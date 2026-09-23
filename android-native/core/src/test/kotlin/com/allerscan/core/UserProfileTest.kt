package com.allerscan.core

import com.allerscan.core.data.AllergenDatabase
import com.allerscan.core.model.AllergenCategory
import com.allerscan.core.model.RiskLevel
import com.allerscan.core.model.ScanIdentification
import com.allerscan.core.model.SeverityLevel
import com.allerscan.core.model.UserProfile
import com.allerscan.core.model.matchAgainst
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class UserProfileTest {
    @Test
    fun `custom allergens get an id that can't collide with a built-in one`() {
        val profile = UserProfile().addCustom("  Oak  ", AllergenCategory.TREE, SeverityLevel.MILD)

        val id = profile.customAllergens.keys.single()
        assertEquals("custom_oak", id)
        assertNull(AllergenDatabase.byId(id))
        assertEquals("Oak", profile.displayNameFor(id))
        assertFalse(profile.removeCustom(id).allergens.containsKey(id))
    }

    @Test
    fun `sensitivity is clamped to the server's range`() {
        assertEquals(3, UserProfile(sensitivityFactor = 9).toPollenRequest().sensitivityFactor)
        assertEquals(1, UserProfile(sensitivityFactor = -1).toPollenRequest().sensitivityFactor)
    }

    @Test
    fun `scan matches by database id, then by custom name`() {
        val profile = UserProfile(allergens = mapOf("ragweed" to SeverityLevel.MODERATE))
            .addCustom("Olive", AllergenCategory.TREE, SeverityLevel.SEVERE)

        val ragweed = ScanIdentification(speciesName = "Common Ragweed", matchedAllergenId = "ragweed")
        assertEquals(SeverityLevel.MODERATE, ragweed.matchAgainst(profile)!!.severity)

        val olive = ScanIdentification(speciesName = "Olive tree", scientificName = "Olea europaea", matchedAllergenId = "none")
        assertEquals("Olive", olive.matchAgainst(profile)!!.allergenName)

        val oak = ScanIdentification(speciesName = "White Oak", matchedAllergenId = "oak")
        assertNull(oak.matchAgainst(profile))
    }

    @Test
    fun `risk thresholds match the web app`() {
        assertEquals(RiskLevel.LOW, RiskLevel.forScore(29))
        assertEquals(RiskLevel.MODERATE, RiskLevel.forScore(30))
        assertEquals(RiskLevel.HIGH, RiskLevel.forScore(50))
        assertEquals(RiskLevel.VERY_HIGH, RiskLevel.forScore(70))
    }

    @Test
    fun `database ids are unique`() {
        assertEquals(AllergenDatabase.all.size, AllergenDatabase.all.map { it.id }.toSet().size)
    }
}
