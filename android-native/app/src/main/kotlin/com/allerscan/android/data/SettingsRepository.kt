package com.allerscan.android.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.allerscan.android.BuildConfig
import com.allerscan.core.api.AllerScanApi
import com.allerscan.core.model.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerializationException

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "allerscan")

data class StoredSettings(
    val profile: UserProfile,
    val serverUrl: String,
)

/** Keeps the profile and server address on this device only. */
class SettingsRepository(private val context: Context) {
    val settings: Flow<StoredSettings> = context.dataStore.data.map { prefs ->
        StoredSettings(
            profile = prefs[PROFILE]?.let(::decodeProfile) ?: UserProfile(),
            serverUrl = prefs[SERVER_URL] ?: BuildConfig.DEFAULT_BASE_URL,
        )
    }

    suspend fun updateProfile(transform: (UserProfile) -> UserProfile) {
        context.dataStore.edit { prefs ->
            val current = prefs[PROFILE]?.let(::decodeProfile) ?: UserProfile()
            prefs[PROFILE] = AllerScanApi.json.encodeToString(UserProfile.serializer(), transform(current))
        }
    }

    suspend fun setServerUrl(url: String) {
        context.dataStore.edit { it[SERVER_URL] = url.trim() }
    }

    private fun decodeProfile(raw: String): UserProfile? = try {
        AllerScanApi.json.decodeFromString(UserProfile.serializer(), raw)
    } catch (_: SerializationException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }

    private companion object {
        val PROFILE = stringPreferencesKey("profile")
        val SERVER_URL = stringPreferencesKey("server_url")
    }
}
