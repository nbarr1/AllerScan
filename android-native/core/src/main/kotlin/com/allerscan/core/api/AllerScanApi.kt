package com.allerscan.core.api

import com.allerscan.core.model.CityOption
import com.allerscan.core.model.EnvironmentalData
import com.allerscan.core.model.ErrorResponse
import com.allerscan.core.model.PollenRequest
import com.allerscan.core.model.ScanIdentification
import com.allerscan.core.model.ScanResponse
import com.allerscan.core.model.UserProfile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.Base64
import java.util.concurrent.TimeUnit

/** A failed API call, with a message fit to show the user. */
class AllerScanApiException(
    message: String,
    /** The HTTP status, or null when the server was never reached. */
    val status: Int? = null,
    /** The server's machine-readable `code`, such as "vision_unconfigured", when it sent one. */
    val code: String? = null,
    cause: Throwable? = null,
) : Exception(message, cause)

/**
 * Client for the AllerScan server's API (see the "Architecture" section of the repository README).
 * The server holds every third-party key; this client only ever talks to it.
 */
class AllerScanApi(
    baseUrl: String,
    private val client: OkHttpClient = defaultClient(),
) {
    private val base: HttpUrl = normalizeBaseUrl(baseUrl)
        ?: throw IllegalArgumentException("\"$baseUrl\" isn't a valid http(s) server address.")

    /** Personal risk score, pollen, air quality and forecast for the profile's location. */
    suspend fun fetchEnvironment(profile: UserProfile): EnvironmentalData =
        fetchEnvironment(profile.toPollenRequest())

    suspend fun fetchEnvironment(request: PollenRequest): EnvironmentalData {
        // Sent as a JSON body so the allergen profile stays out of URLs and request logs.
        val body = json.encodeToString(PollenRequest.serializer(), request).toRequestBody(JSON_MEDIA_TYPE)
        return execute(Request.Builder().url(endpoint("api/pollen-aqi")).post(body).build()) {
            json.decodeFromString(EnvironmentalData.serializer(), it)
        }
    }

    suspend fun searchLocations(query: String): List<CityOption> {
        val url = endpoint("api/location-search").newBuilder().addQueryParameter("q", query.trim()).build()
        return execute(Request.Builder().url(url).get().build()) {
            json.decodeFromString(ListSerializer, it)
        }
    }

    /** Names the place at the given coordinates, which are rounded to about 1 km before sending. */
    suspend fun reverseGeocode(lat: Double, lng: Double): CityOption {
        val url = endpoint("api/reverse-geocode").newBuilder()
            .addQueryParameter("lat", UserProfile.roundCoordinate(lat).toString())
            .addQueryParameter("lng", UserProfile.roundCoordinate(lng).toString())
            .build()
        return execute(Request.Builder().url(url).get().build()) {
            json.decodeFromString(CityOption.serializer(), it)
        }
    }

    /**
     * Identifies the plant or mold in a photo. The server answers with an error rather than a
     * made-up species when its vision model can't run, and that error is thrown here unchanged.
     */
    suspend fun scan(image: ByteArray, mimeType: String = "image/jpeg"): ScanIdentification {
        require(mimeType.startsWith("image/")) { "Expected an image MIME type, got $mimeType." }
        require(image.size <= MAX_SCAN_IMAGE_BYTES) { "The photo is too large to send; downscale it first." }
        val payload = buildImagePayload(image, mimeType)
        return execute(Request.Builder().url(endpoint("api/scan")).post(payload.toRequestBody(JSON_MEDIA_TYPE)).build()) {
            val response = json.decodeFromString(ScanResponse.serializer(), it)
            response.data?.takeIf { data -> response.success && data.speciesName.isNotBlank() }
                ?: throw AllerScanApiException("The server didn't return an identification for that photo.")
        }
    }

    private fun endpoint(path: String): HttpUrl = base.resolve(path)!!

    private suspend fun <T> execute(request: Request, parse: (String) -> T): T = withContext(Dispatchers.IO) {
        val (status, body) = try {
            client.newCall(request).execute().use { response -> response.code to response.body?.string().orEmpty() }
        } catch (e: IOException) {
            throw AllerScanApiException("Couldn't reach the AllerScan server at $base. Check the server address and your connection.", cause = e)
        }

        if (status !in 200..299) {
            val error = runCatching { json.decodeFromString(ErrorResponse.serializer(), body) }.getOrNull()
            throw AllerScanApiException(
                message = error?.error ?: when (status) {
                    429 -> "Too many requests. Wait a few minutes and try again."
                    else -> "The server answered with an error (HTTP $status)."
                },
                status = status,
                code = error?.code,
            )
        }

        try {
            parse(body)
        } catch (e: SerializationException) {
            throw AllerScanApiException("The server's response wasn't in the expected format. Is this an AllerScan server?", status, cause = e)
        } catch (e: IllegalArgumentException) {
            throw AllerScanApiException("The server's response wasn't in the expected format. Is this an AllerScan server?", status, cause = e)
        }
    }

    companion object {
        /** The server's scan body limit is 4 MB; base64 adds a third, so stay well under it. */
        const val MAX_SCAN_IMAGE_BYTES = 2_800_000

        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
        private val ListSerializer = kotlinx.serialization.builtins.ListSerializer(CityOption.serializer())

        val json = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
            coerceInputValues = true
        }

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            // A scan waits on the vision model, which can take a while under load.
            .readTimeout(45, TimeUnit.SECONDS)
            .build()

        /** Accepts "host:port" or a full URL and returns it with a trailing slash, or null. */
        fun normalizeBaseUrl(raw: String): HttpUrl? {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) return null
            val withScheme = if ("://" in trimmed) trimmed else "https://$trimmed"
            val parsed = withScheme.toHttpUrlOrNull() ?: return null
            val path = if (parsed.encodedPath.endsWith("/")) parsed.encodedPath else parsed.encodedPath + "/"
            return parsed.newBuilder().encodedPath(path).query(null).fragment(null).build()
        }

        internal fun buildImagePayload(image: ByteArray, mimeType: String): String {
            val dataUrl = "data:$mimeType;base64," + Base64.getEncoder().encodeToString(image)
            return json.encodeToString(ScanRequest.serializer(), ScanRequest(dataUrl))
        }
    }
}

@kotlinx.serialization.Serializable
internal data class ScanRequest(val imageBase64: String)
