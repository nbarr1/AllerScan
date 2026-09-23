package com.allerscan.core.model

/** How a scanned species relates to the user's saved allergens. */
data class ScanMatch(
    val allergenId: String,
    val allergenName: String,
    val severity: SeverityLevel,
)

/**
 * Finds the saved allergen a scan identified, if any: the model's database id first, then a custom
 * trigger whose name appears in the species name. Returns null when nothing the user saved matches,
 * even if the species is a known allergen for other people.
 */
fun ScanIdentification.matchAgainst(profile: UserProfile): ScanMatch? {
    matchedId?.let { id ->
        profile.allergens[id]?.let { severity -> return ScanMatch(id, profile.displayNameFor(id), severity) }
    }
    val haystack = "$speciesName $scientificName".lowercase()
    for ((id, meta) in profile.customAllergens) {
        val severity = profile.allergens[id] ?: continue
        if (meta.name.lowercase() in haystack) return ScanMatch(id, meta.name, severity)
    }
    return null
}
