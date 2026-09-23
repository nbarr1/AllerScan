package com.allerscan.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Mirrors of the TypeScript types in src/types.ts that the server's JSON responses follow. Fields
// the server omits when it has no reading are nullable here, so "no reading" never turns into a
// plausible-looking zero.

@Serializable
enum class SeverityLevel {
    @SerialName("mild") MILD,
    @SerialName("moderate") MODERATE,
    @SerialName("severe") SEVERE,
}

@Serializable
enum class AllergenCategory {
    @SerialName("tree") TREE,
    @SerialName("grass") GRASS,
    @SerialName("weed") WEED,
    @SerialName("mold") MOLD,
    @SerialName("indoor") INDOOR,
}

@Serializable
enum class RiskLevel(val label: String) {
    @SerialName("Low") LOW("Low"),
    @SerialName("Moderate") MODERATE("Moderate"),
    @SerialName("High") HIGH("High"),
    @SerialName("Very High") VERY_HIGH("Very High");

    companion object {
        /** The app's shared 0-100 thresholds: Low < 30, Moderate < 50, High < 70, then Very High. */
        fun forScore(score: Int): RiskLevel = when {
            score >= 70 -> VERY_HIGH
            score >= 50 -> HIGH
            score >= 30 -> MODERATE
            else -> LOW
        }
    }
}

@Serializable
enum class ScoreBasis {
    @SerialName("profile") PROFILE,
    @SerialName("general") GENERAL,
}

@Serializable
enum class Trend {
    @SerialName("rising") RISING,
    @SerialName("stable") STABLE,
    @SerialName("falling") FALLING,
}

@Serializable
data class PollenCategoryScore(
    val level: RiskLevel? = null,
    val value: Int? = null,
    val trend: Trend? = null,
    val topSpecies: List<String> = emptyList(),
    val estimateNote: String? = null,
)

@Serializable
data class PollenBreakdown(
    val tree: PollenCategoryScore = PollenCategoryScore(),
    val grass: PollenCategoryScore = PollenCategoryScore(),
    val weed: PollenCategoryScore = PollenCategoryScore(),
    val mold: PollenCategoryScore = PollenCategoryScore(),
)

@Serializable
data class MatchedAllergen(
    val id: String,
    val name: String,
    val category: AllergenCategory,
    val userSeverity: SeverityLevel,
    val currentLevel: RiskLevel,
    val currentValue: Int,
)

@Serializable
data class UnscoredAllergen(
    val id: String,
    val name: String,
    val category: AllergenCategory,
    /** "indoor" or "no-reading". */
    val reason: String,
)

@Serializable
data class AirQualityData(
    val aqi: Int,
    val category: String,
    val pm25: Double,
    val pm10: Double,
    val ozone: Double,
)

@Serializable
data class DailyPollenForecast(
    val dayName: String,
    val date: String,
    val riskLevel: RiskLevel,
    val overallScore: Int,
    val basis: ScoreBasis = ScoreBasis.GENERAL,
    val tree: Int? = null,
    val grass: Int? = null,
    val weed: Int? = null,
    val dominantAllergen: String = "",
)

@Serializable
data class LiveWeatherData(
    val temperatureF: Double,
    val humidityPct: Double,
    val apparentTempF: Double,
    val windSpeedMph: Double,
    val windDirection: String,
    val weatherDescription: String,
)

/** The `/api/pollen-aqi` response. */
@Serializable
data class EnvironmentalData(
    val locationName: String,
    val updatedAt: String,
    val timeZoneAbbr: String? = null,
    val timeZoneNote: String? = null,
    val dataSource: String? = null,
    val pollenDataSource: String? = null,
    val pollenIsModeled: Boolean = false,
    val weather: LiveWeatherData? = null,
    val overallPersonalRiskScore: Int,
    val riskCategory: RiskLevel,
    val scoreBasis: ScoreBasis = ScoreBasis.GENERAL,
    val aqi: AirQualityData? = null,
    val pollen: PollenBreakdown = PollenBreakdown(),
    val matchedActiveAllergens: List<MatchedAllergen> = emptyList(),
    val unscoredAllergens: List<UnscoredAllergen> = emptyList(),
    val recommendations: List<String> = emptyList(),
    val forecast: List<DailyPollenForecast> = emptyList(),
    val forecastSource: String? = null,
)

/** One `/api/location-search` result, and the saved location in a profile. */
@Serializable
data class CityOption(
    val cityName: String,
    val region: String = "",
    val lat: Double,
    val lng: Double,
) {
    val displayName: String get() = if (region.isBlank()) cityName else "$cityName, $region"
}

@Serializable
data class CustomAllergenMeta(
    val name: String,
    val category: AllergenCategory,
)

/**
 * What the model reported for a photo (the `data` field of a successful `/api/scan` response).
 * [category] stays a string because it comes from a language model and can be "non_allergen" or
 * something unexpected; [allergenCategory] maps it when it's one the app knows.
 */
@Serializable
data class ScanIdentification(
    val speciesName: String,
    val scientificName: String = "",
    val category: String = "",
    val confidence: Int? = null,
    val matchedAllergenId: String? = null,
    val identifyingFeatures: List<String> = emptyList(),
    val details: String = "",
) {
    val allergenCategory: AllergenCategory?
        get() = AllergenCategory.entries.firstOrNull { it.name.equals(category.trim(), ignoreCase = true) }

    /** The model's database match, or null when it answered "none" or left it out. */
    val matchedId: String?
        get() = matchedAllergenId?.trim()?.lowercase()?.takeUnless { it.isEmpty() || it == "none" }
}

@Serializable
internal data class ScanResponse(
    val success: Boolean = false,
    val source: String? = null,
    val data: ScanIdentification? = null,
)

@Serializable
internal data class ErrorResponse(
    val error: String? = null,
    val code: String? = null,
)
