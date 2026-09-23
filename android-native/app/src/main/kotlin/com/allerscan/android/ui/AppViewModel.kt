package com.allerscan.android.ui

import android.app.Application
import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.allerscan.android.data.SettingsRepository
import com.allerscan.android.util.ImageUtils
import com.allerscan.android.util.LocationHelper
import com.allerscan.core.api.AllerScanApi
import com.allerscan.core.api.AllerScanApiException
import com.allerscan.core.model.AllergenCategory
import com.allerscan.core.model.CityOption
import com.allerscan.core.model.EnvironmentalData
import com.allerscan.core.model.ScanIdentification
import com.allerscan.core.model.ScanMatch
import com.allerscan.core.model.SeverityLevel
import com.allerscan.core.model.UserProfile
import com.allerscan.core.model.matchAgainst
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.Locale
import kotlin.coroutines.cancellation.CancellationException

sealed interface DashboardState {
    data object Loading : DashboardState
    data class Loaded(val data: EnvironmentalData) : DashboardState
    data class Failed(val message: String) : DashboardState
}

sealed interface ScanState {
    data object Idle : ScanState
    data class Analyzing(val preview: Bitmap?) : ScanState
    data class Identified(val preview: Bitmap, val result: ScanIdentification, val match: ScanMatch?) : ScanState
    data class Failed(val preview: Bitmap?, val message: String) : ScanState
}

data class LocationSearchState(
    val query: String = "",
    val results: List<CityOption> = emptyList(),
    val searching: Boolean = false,
    val error: String? = null,
)

data class AppUiState(
    val loaded: Boolean = false,
    val profile: UserProfile = UserProfile(),
    val serverUrl: String = "",
    val dashboard: DashboardState = DashboardState.Loading,
    val scan: ScanState = ScanState.Idle,
    val locationSearch: LocationSearchState = LocationSearchState(),
    val locating: Boolean = false,
    /** A one-off notice for a snackbar, cleared once shown. */
    val notice: String? = null,
)

@OptIn(FlowPreview::class)
class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SettingsRepository(application)
    private val _state = MutableStateFlow(AppUiState())
    val state: StateFlow<AppUiState> = _state.asStateFlow()

    private val searchQuery = MutableStateFlow("")
    private var refreshJob: Job? = null
    private var scanJob: Job? = null

    init {
        viewModelScope.launch {
            repository.settings.collect { stored ->
                _state.update { it.copy(loaded = true, profile = stored.profile, serverUrl = stored.serverUrl) }
            }
        }
        // Refresh the dashboard whenever something the report depends on changes.
        viewModelScope.launch {
            _state
                .filter { it.loaded }
                .map { it.profile to it.serverUrl }
                .distinctUntilChanged()
                .debounce(300)
                .collectLatest { refresh() }
        }
        viewModelScope.launch {
            searchQuery
                .debounce(350)
                .distinctUntilChanged()
                .collectLatest { query -> runLocationSearch(query) }
        }
    }

    fun refresh() {
        refreshJob?.cancel()
        refreshJob = viewModelScope.launch {
            _state.update { it.copy(dashboard = DashboardState.Loading) }
            val result = callApi { api -> api.fetchEnvironment(_state.value.profile) }
            _state.update {
                it.copy(dashboard = result.fold({ data -> DashboardState.Loaded(data) }, { e -> DashboardState.Failed(e) }))
            }
        }
    }

    fun scanPhoto(uri: Uri) {
        scanJob?.cancel()
        scanJob = viewModelScope.launch {
            _state.update { it.copy(scan = ScanState.Analyzing(null)) }
            val photo = try {
                withContext(Dispatchers.Default) { ImageUtils.prepare(getApplication<Application>().contentResolver, uri) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                _state.update { it.copy(scan = ScanState.Failed(null, "Couldn't open that photo. Try another one.")) }
                return@launch
            } catch (e: RuntimeException) {
                // ImageDecoder reports undecodable or unsupported files as runtime exceptions too.
                _state.update { it.copy(scan = ScanState.Failed(null, "Couldn't read that photo. Try a JPEG or PNG.")) }
                return@launch
            }
            if (photo.jpeg.size > AllerScanApi.MAX_SCAN_IMAGE_BYTES) {
                _state.update { it.copy(scan = ScanState.Failed(photo.preview, "That photo is too large to send.")) }
                return@launch
            }
            _state.update { it.copy(scan = ScanState.Analyzing(photo.preview)) }
            val result = callApi { api -> api.scan(photo.jpeg, "image/jpeg") }
            _state.update { current ->
                current.copy(
                    scan = result.fold(
                        { id -> ScanState.Identified(photo.preview, id, id.matchAgainst(current.profile)) },
                        { message -> ScanState.Failed(photo.preview, message) },
                    )
                )
            }
        }
    }

    fun clearScan() {
        scanJob?.cancel()
        _state.update { it.copy(scan = ScanState.Idle) }
    }

    fun setSeverity(allergenId: String, severity: SeverityLevel?) = updateProfile { it.withSeverity(allergenId, severity) }

    fun addCustomAllergen(name: String, category: AllergenCategory, severity: SeverityLevel) {
        if (name.isBlank()) return
        updateProfile { it.addCustom(name, category, severity) }
    }

    fun removeCustomAllergen(id: String) = updateProfile { it.removeCustom(id) }

    fun setSensitivity(value: Int) = updateProfile { it.copy(sensitivityFactor = value.coerceIn(1, 3)) }

    fun selectLocation(city: CityOption) {
        updateProfile { it.copy(location = city) }
        searchQuery.value = ""
        _state.update { it.copy(locationSearch = LocationSearchState()) }
    }

    fun onLocationQueryChange(query: String) {
        searchQuery.value = query
        _state.update { it.copy(locationSearch = it.locationSearch.copy(query = query)) }
    }

    /** Call after ACCESS_COARSE_LOCATION was granted. */
    fun useDeviceLocation() {
        viewModelScope.launch {
            _state.update { it.copy(locating = true) }
            val location = LocationHelper.currentLocation(getApplication())
            if (location == null) {
                _state.update { it.copy(locating = false, notice = "Couldn't get a position. Check that location is turned on.") }
                return@launch
            }
            val lat = UserProfile.roundCoordinate(location.latitude)
            val lng = UserProfile.roundCoordinate(location.longitude)
            // Name the place when the server can; otherwise the coordinates themselves are the name,
            // rather than a placeholder label the server would then try to geocode.
            val city = callApi { api -> api.reverseGeocode(lat, lng) }.fold(
                { it.copy(lat = lat, lng = lng) },
                { CityOption(cityName = String.format(Locale.US, "%.2f, %.2f", lat, lng), region = "", lat = lat, lng = lng) },
            )
            updateProfile { it.copy(location = city) }
            _state.update { it.copy(locating = false) }
        }
    }

    fun setServerUrl(url: String): Boolean {
        if (AllerScanApi.normalizeBaseUrl(url) == null) return false
        viewModelScope.launch { repository.setServerUrl(url) }
        return true
    }

    fun noticeShown() = _state.update { it.copy(notice = null) }

    private suspend fun runLocationSearch(query: String) {
        if (query.isBlank()) {
            _state.update { it.copy(locationSearch = it.locationSearch.copy(results = emptyList(), searching = false, error = null)) }
            return
        }
        _state.update { it.copy(locationSearch = it.locationSearch.copy(searching = true, error = null)) }
        val result = callApi { api -> api.searchLocations(query) }
        _state.update {
            it.copy(
                locationSearch = it.locationSearch.copy(
                    searching = false,
                    results = result.valueOrNull.orEmpty(),
                    error = result.errorOrNull,
                )
            )
        }
    }

    private fun updateProfile(transform: (UserProfile) -> UserProfile) {
        viewModelScope.launch { repository.updateProfile(transform) }
    }

    private suspend fun <T> callApi(block: suspend (AllerScanApi) -> T): Outcome<T> {
        val api = try {
            AllerScanApi(_state.value.serverUrl, sharedClient)
        } catch (e: IllegalArgumentException) {
            return Outcome.Error(e.message ?: "The server address isn't valid.")
        }
        return try {
            Outcome.Value(block(api))
        } catch (e: AllerScanApiException) {
            Outcome.Error(e.message ?: "Something went wrong.")
        }
    }

    private sealed interface Outcome<out T> {
        data class Value<T>(val value: T) : Outcome<T>
        data class Error(val message: String) : Outcome<Nothing>

        val valueOrNull: T? get() = (this as? Value<T>)?.value
        val errorOrNull: String? get() = (this as? Error)?.message

        fun <R> fold(onValue: (T) -> R, onError: (String) -> R): R = when (this) {
            is Value -> onValue(value)
            is Error -> onError(message)
        }
    }

    private companion object {
        // One HTTP client for every call; AllerScanApi instances are cheap wrappers around it.
        val sharedClient = AllerScanApi.defaultClient()
    }
}
