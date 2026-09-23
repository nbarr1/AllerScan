package com.allerscan.core

import com.allerscan.core.api.AllerScanApi
import com.allerscan.core.api.AllerScanApiException
import com.allerscan.core.model.AllergenCategory
import com.allerscan.core.model.CityOption
import com.allerscan.core.model.RiskLevel
import com.allerscan.core.model.ScoreBasis
import com.allerscan.core.model.SeverityLevel
import com.allerscan.core.model.UserProfile
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class AllerScanApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: AllerScanApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = AllerScanApi(server.url("/").toString())
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `pollen request is a JSON body with rounded coordinates`() = runTest {
        server.enqueue(MockResponse().setBody(SAMPLE_REPORT))
        val profile = UserProfile(
            allergens = mapOf("oak" to SeverityLevel.SEVERE),
            location = CityOption("Austin", "Texas, USA", 30.26721, -97.74312),
            sensitivityFactor = 3,
        )

        api.fetchEnvironment(profile)

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/pollen-aqi", recorded.path)
        val body = AllerScanApi.json.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        assertEquals("30.27", body["lat"]!!.jsonPrimitive.content)
        assertEquals("-97.74", body["lng"]!!.jsonPrimitive.content)
        assertEquals("Austin, Texas, USA", body["locationName"]!!.jsonPrimitive.content)
        assertEquals("severe", body["userAllergens"]!!.jsonObject["oak"]!!.jsonPrimitive.content)
        assertEquals("3", body["sensitivityFactor"]!!.jsonPrimitive.content)
    }

    @Test
    fun `report keeps missing readings as null instead of zero`() = runTest {
        server.enqueue(MockResponse().setBody(SAMPLE_REPORT))

        val report = api.fetchEnvironment(UserProfile())

        assertEquals(62, report.overallPersonalRiskScore)
        assertEquals(RiskLevel.HIGH, report.riskCategory)
        assertEquals(ScoreBasis.PROFILE, report.scoreBasis)
        assertEquals(71, report.pollen.tree.value)
        assertNull(report.pollen.weed.value)
        assertNull(report.pollen.weed.level)
        assertNull(report.aqi)
        assertEquals(RiskLevel.VERY_HIGH, report.matchedActiveAllergens.single().currentLevel)
        assertEquals("indoor", report.unscoredAllergens.single().reason)
        assertTrue(report.forecast.isEmpty())
    }

    @Test
    fun `scan sends a data URL and returns the identification`() = runTest {
        server.enqueue(
            MockResponse().setBody(
                """{"success":true,"source":"gemini-flash-latest","data":{"speciesName":"Live Oak",
                "scientificName":"Quercus virginiana","category":"tree","confidence":91,
                "matchedAllergenId":"oak","identifyingFeatures":["Lobed leaves"],"details":"Wind-pollinated."}}"""
            )
        )

        val result = api.scan(byteArrayOf(1, 2, 3), "image/jpeg")

        val body = AllerScanApi.json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
        assertEquals("data:image/jpeg;base64,AQID", body["imageBase64"]!!.jsonPrimitive.content)
        assertEquals("Live Oak", result.speciesName)
        assertEquals(AllergenCategory.TREE, result.allergenCategory)
        assertEquals("oak", result.matchedId)
    }

    @Test
    fun `scan surfaces the server's vision error code`() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(503).setBody(
                """{"error":"AI plant identification isn't set up on this server.","code":"vision_unconfigured"}"""
            )
        )

        try {
            api.scan(byteArrayOf(1), "image/png")
            fail("Expected an exception")
        } catch (e: AllerScanApiException) {
            assertEquals(503, e.status)
            assertEquals("vision_unconfigured", e.code)
            assertEquals("AI plant identification isn't set up on this server.", e.message)
        }
    }

    @Test
    fun `non-JSON errors still produce a readable message`() = runTest {
        server.enqueue(MockResponse().setResponseCode(429).setBody("Too Many Requests"))

        try {
            api.searchLocations("Paris")
            fail("Expected an exception")
        } catch (e: AllerScanApiException) {
            assertEquals(429, e.status)
            assertTrue(e.message!!.startsWith("Too many requests"))
        }
    }

    @Test
    fun `location search encodes the query`() = runTest {
        server.enqueue(MockResponse().setBody("""[{"cityName":"São Paulo","region":"Brazil","lat":-23.55,"lng":-46.63}]"""))

        val results = api.searchLocations(" São Paulo ")

        assertEquals("/api/location-search?q=S%C3%A3o%20Paulo", server.takeRequest().path)
        assertEquals("São Paulo, Brazil", results.single().displayName)
    }

    @Test
    fun `base URL keeps a path prefix and gains a trailing slash`() {
        assertEquals("https://example.com/allerscan/", AllerScanApi.normalizeBaseUrl("example.com/allerscan")!!.toString())
        assertEquals("http://10.0.2.2:3000/", AllerScanApi.normalizeBaseUrl("http://10.0.2.2:3000")!!.toString())
        assertNull(AllerScanApi.normalizeBaseUrl("  "))
        assertNull(AllerScanApi.normalizeBaseUrl("ftp://example.com"))
    }

    companion object {
        // Shaped like buildEnvironmentalReport's output (src/utils/envReport.ts), with a category
        // no source reported and no air-quality reading.
        val SAMPLE_REPORT = """
            {
              "locationName": "Austin, Texas, USA",
              "updatedAt": "09:15 AM",
              "timeZoneAbbr": "CDT",
              "dataSource": "Live Open-Meteo Air Quality & Weather API",
              "pollenDataSource": "Live Google Maps Pollen API",
              "pollenIsModeled": false,
              "overallPersonalRiskScore": 62,
              "riskCategory": "High",
              "scoreBasis": "profile",
              "pollen": {
                "tree": {"level": "Very High", "value": 71, "trend": "rising", "topSpecies": ["Oak"]},
                "grass": {"level": "Low", "value": 12, "topSpecies": []},
                "weed": {"level": null, "value": null, "topSpecies": []},
                "mold": {"level": "Moderate", "value": 40, "topSpecies": [], "estimateNote": "Estimated from humidity."}
              },
              "matchedActiveAllergens": [
                {"id": "oak", "name": "Oak Tree", "category": "tree", "userSeverity": "severe", "currentLevel": "Very High", "currentValue": 71}
              ],
              "unscoredAllergens": [
                {"id": "dust_mites", "name": "Dust Mites", "category": "indoor", "reason": "indoor"}
              ],
              "recommendations": ["Keep windows closed this morning."],
              "forecast": [],
              "someFieldAddedLater": true
            }
        """.trimIndent()
    }
}
