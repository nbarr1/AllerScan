package com.allerscan.core.model

import com.allerscan.core.data.AllergenDatabase
import kotlinx.serialization.Serializable
import kotlin.math.roundToLong

/**
 * Everything the app keeps about the user. Stored on the device only, like the web app's
 * localStorage profile; the server never stores it.
 */
@Serializable
data class UserProfile(
    val allergens: Map<String, SeverityLevel> = emptyMap(),
    val customAllergens: Map<String, CustomAllergenMeta> = emptyMap(),
    val location: CityOption? = null,
    /** 1 (less reactive than typical) to 3 (more reactive); 2 is neutral. */
    val sensitivityFactor: Int = 2,
) {
    fun withSeverity(id: String, severity: SeverityLevel?): UserProfile =
        copy(allergens = if (severity == null) allergens - id else allergens + (id to severity))

    fun addCustom(name: String, category: AllergenCategory, severity: SeverityLevel): UserProfile {
        val trimmed = name.trim().take(MAX_CUSTOM_NAME_LENGTH)
        require(trimmed.isNotEmpty()) { "A custom allergen needs a name." }
        val id = customIdFor(trimmed)
        return copy(
            allergens = allergens + (id to severity),
            customAllergens = customAllergens + (id to CustomAllergenMeta(trimmed, category)),
        )
    }

    fun removeCustom(id: String): UserProfile =
        copy(allergens = allergens - id, customAllergens = customAllergens - id)

    fun displayNameFor(id: String): String =
        AllergenDatabase.byId(id)?.name ?: customAllergens[id]?.name ?: id

    /** The JSON body `/api/pollen-aqi` expects (see server/profileInput.ts). */
    fun toPollenRequest(): PollenRequest {
        val place = location ?: DEFAULT_LOCATION
        return PollenRequest(
            locationName = place.displayName,
            lat = roundCoordinate(place.lat),
            lng = roundCoordinate(place.lng),
            userAllergens = allergens,
            customAllergens = customAllergens,
            sensitivityFactor = sensitivityFactor.coerceIn(1, 3),
        )
    }

    companion object {
        const val MAX_CUSTOM_NAME_LENGTH = 80

        /** The server's own default, used until the user picks a location. */
        val DEFAULT_LOCATION = CityOption("Austin", "Texas, USA", 30.2672, -97.7431)

        /**
         * Two decimal places is about 1 km — enough for pollen and weather, and it keeps the exact
         * position off the network, matching the web app.
         */
        fun roundCoordinate(value: Double): Double = (value * 100).roundToLong() / 100.0

        private fun customIdFor(name: String): String {
            val slug = name.lowercase().replace(Regex("[^a-z0-9]+"), "_").trim('_').ifEmpty { "trigger" }
            return "custom_${slug.take(48)}"
        }
    }
}

@Serializable
data class PollenRequest(
    val locationName: String,
    val lat: Double,
    val lng: Double,
    val userAllergens: Map<String, SeverityLevel>,
    val customAllergens: Map<String, CustomAllergenMeta>,
    val sensitivityFactor: Int,
)
