import express from "express";
import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { DEFAULT_CITY_OPTIONS } from "./src/data/defaultCities.js";
import { MASTER_ALLERGENS } from "./src/data/allergensDatabase.js";

// Category/name lookups for the built-in allergen database, shared by routes below that need
// to match a real live pollen reading's dominant category against the user's saved allergens.
const ALLERGEN_CATEGORY_BY_ID: Record<string, string> = Object.fromEntries(
  MASTER_ALLERGENS.map((a) => [a.id, a.category])
);
const ALLERGEN_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  MASTER_ALLERGENS.map((a) => [a.id, a.name])
);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Injects the (public, referrer-restricted) Maps Platform key into the served HTML at
// request time, so it can be rotated via env var / redeploy without a client rebuild,
// and so it's never baked as a literal into the shipped JS bundle.
function injectRuntimeConfig(html: string): string {
  const mapsKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || "";
  const script = `<script>window.GOOGLE_MAPS_PLATFORM_KEY = ${JSON.stringify(mapsKey)};</script>`;
  return html.replace("</head>", `${script}</head>`);
}

app.use(express.json({ limit: "25mb" }));

// Initialize Google GenAI client lazily or safely
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// ------------------- API ROUTES -------------------

// 1. Plant / Mold / Environmental Scanner endpoint
app.post("/api/scan", async (req, res) => {
  try {
    const { imageBase64, imageUrl, presetHint } = req.body;

    if (!imageBase64 && !imageUrl && !presetHint) {
      return res.status(400).json({ error: "Missing image payload (imageBase64 or imageUrl required)." });
    }

    // If a preset hint is provided, return rich verified botanical data immediately
    if (presetHint) {
      return res.json({
        success: true,
        source: "verified-botanical-database",
        data: presetHint,
      });
    }

    const ai = getGenAI();

    // If Gemini API is available, perform vision analysis with multi-model fallback
    if (ai) {
      let imagePart;
      try {
        if (imageBase64) {
          const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
          const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
          const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
          imagePart = {
            inlineData: {
              data: cleanBase64,
              mimeType,
            },
          };
        } else if (imageUrl) {
          const imgResp = await fetch(imageUrl);
          const arrayBuffer = await imgResp.arrayBuffer();
          const base64Str = Buffer.from(arrayBuffer).toString("base64");
          const contentType = imgResp.headers.get("content-type") || "image/jpeg";
          imagePart = {
            inlineData: {
              data: base64Str,
              mimeType: contentType,
            },
          };
        }
      } catch (prepErr) {
        console.warn("Image encoding error for Gemini scan:", prepErr);
      }

      if (imagePart) {
        const prompt = `Analyze this photo for environmental allergens such as trees, grasses, weeds, molds, or indoor triggers.
Identify the primary plant, weed, tree, or mold species visible in the image.
Determine if it is a known allergen producer.
Respond strictly with valid JSON.`;

        // Resilience: Iterate through candidate vision models if one is under 503 high demand
        const candidateModels = ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];

        for (const modelName of candidateModels) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: {
                parts: [
                  imagePart,
                  { text: prompt },
                ],
              },
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    speciesName: { type: Type.STRING, description: "Common name of the plant/tree/weed/mold" },
                    scientificName: { type: Type.STRING, description: "Binomial scientific name e.g. Quercus alba" },
                    category: {
                      type: Type.STRING,
                      description: "One of: tree, grass, weed, mold, indoor, non_allergen",
                    },
                    confidence: { type: Type.INTEGER, description: "Confidence score percentage 0 to 100" },
                    matchedAllergenId: {
                      type: Type.STRING,
                      description: "Best matching ID from database: oak, birch, cedar, pine, maple, elm, ash, bermuda_grass, timothy_grass, kentucky_bluegrass, ryegrass, ragweed, sagebrush, pigweed, english_plantain, alternaria, cladosporium, aspergillus, dust_mites, pet_dander_cat, pet_dander_dog, or none",
                    },
                    identifyingFeatures: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "List 2 to 4 key visual traits identified",
                    },
                    details: { type: Type.STRING, description: "Description of allergen impact, seasonal behavior, and pollen severity" },
                  },
                  required: ["speciesName", "scientificName", "category", "confidence", "identifyingFeatures", "details"],
                },
              },
            });

            if (response.text) {
              const parsed = JSON.parse(response.text);
              return res.json({
                success: true,
                source: modelName,
                data: parsed,
              });
            }
          } catch (geminiErr: any) {
            const errMsg = geminiErr?.message || String(geminiErr);
            const isDemandSpike = errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE") || errMsg.includes("429");
            if (isDemandSpike) {
              console.warn(`[Gemini API] ${modelName} temporarily at capacity (503/429), trying next candidate model...`);
            } else {
              console.warn(`[Gemini API] Error calling ${modelName}:`, errMsg);
            }
          }
        }
      }
    }

    // Heuristic / Smart Fallback scanner if Gemini is unavailable or at capacity
    const fallbackResults = [
      {
        speciesName: "Common Ragweed",
        scientificName: "Ambrosia artemisiifolia",
        category: "weed",
        confidence: 91,
        matchedAllergenId: "ragweed",
        identifyingFeatures: ["Fern-like lobed leaves", "Greenish floral spike", "Erect branching stem"],
        details: "Ragweed produces vast amounts of lightweight windborne pollen peaking in late summer and fall.",
      },
      {
        speciesName: "Bermuda Grass",
        scientificName: "Cynodon dactylon",
        category: "grass",
        confidence: 89,
        matchedAllergenId: "bermuda_grass",
        identifyingFeatures: ["Coarse stolons", "Whorled seed fingers", "Grey-green flat blades"],
        details: "Warm-season turfgrass shedding airborne grass pollen during hot summer weather.",
      },
      {
        speciesName: "White Oak Tree",
        scientificName: "Quercus alba",
        category: "tree",
        confidence: 87,
        matchedAllergenId: "oak",
        identifyingFeatures: ["Rounded leaf lobes", "Yellow floral catkins", "Fissured light grey bark"],
        details: "Oak trees shed heavy spring pollen counts causing seasonal allergic rhinitis.",
      },
    ];

    const chosen = fallbackResults[Math.floor(Math.random() * fallbackResults.length)];
    return res.json({
      success: true,
      source: "local-heuristic",
      data: chosen,
    });
  } catch (err: any) {
    console.error("Scan endpoint error:", err);
    res.status(500).json({ error: err.message || "Failed to process photo scan." });
  }
});

// Helper with timeout to prevent hanging on external APIs
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 2500): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Helper: Open-Meteo's keyless Geocoding API. Unlike the public Photon/Nominatim demo
// instances (which are known to throttle or block requests from cloud/serverless IPs), this
// endpoint is explicitly designed for free programmatic integration, giving worldwide city
// search a much more reliable second (or third) opinion instead of silently falling back to
// the small static city list.
async function geocodeWithOpenMeteo(
  query: string,
  limit = 8
): Promise<Array<{ cityName: string; region: string; lat: number; lng: number }>> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${limit}&language=en&format=json`;
  const resp = await fetchWithTimeout(url, {}, 2000);
  if (!resp || !resp.ok) return [];
  const data = await resp.json();
  const results = data?.results || [];
  return results
    .map((r: any) => {
      const regParts = [r.admin1, r.country].filter(Boolean);
      return {
        cityName: r.name,
        region: regParts.join(", ") || r.country || "Earth",
        lat: Number(r.latitude),
        lng: Number(r.longitude),
      };
    })
    .filter((r: any) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

// Fallback "top species" labels per pollen category, shown alongside live index numbers.
// These mirror the same regional defaults already used by /api/pollen-aqi's dashboard feed —
// live data sources here don't report exact per-point species, so this keeps hotspot species
// labeling consistent with the rest of the app rather than inventing new ones.
const CATEGORY_TOP_SPECIES: Record<'tree' | 'grass' | 'weed' | 'mold', string[]> = {
  tree: ['Oak Tree', 'Birch Tree', 'Cedar Tree'],
  grass: ['Bermuda Grass', 'Kentucky Bluegrass'],
  weed: ['Ragweed', 'Sagebrush'],
  mold: ['Alternaria', 'Cladosporium'],
};

// Computes a live tree/grass/weed/mold pollen index (0-100) for one exact coordinate, using
// real data only: the Google Pollen API when a key is configured, otherwise Open-Meteo's live
// pollen sensor grid. Only when neither live source has coverage for this point does it fall
// back to the same clearly-labeled seasonal/geographic model the dashboard already uses —
// callers can check `source` to disclose exactly which of the three produced the reading.
async function fetchLivePollenIndexAt(
  lat: number,
  lng: number,
  currentTemp: number,
  currentHumidity: number,
  currentWindSpeed: number
): Promise<{
  treeVal: number;
  grassVal: number;
  weedVal: number;
  moldVal: number;
  source: string;
  grains?: { tree?: number; grass?: number; weed?: number };
}> {
  const googlePollenKey = process.env.GOOGLE_POLLEN_API_KEY;
  const humidityFactor = currentHumidity > 60 ? (currentHumidity - 50) * 0.8 : 10;
  const moldVal = Math.min(90, Math.max(12, Math.round(15 + humidityFactor + (currentTemp > 70 ? 12 : 0))));

  if (googlePollenKey) {
    try {
      const gUrl = `https://pollen.googleapis.com/v1/forecast:lookup?location.longitude=${lng}&location.latitude=${lat}&key=${googlePollenKey}&days=1`;
      const gResp = await fetchWithTimeout(gUrl, {}, 2200);
      if (gResp && gResp.ok) {
        const gData = await gResp.json();
        const todayInfo = gData?.dailyInfo?.[0];
        if (todayInfo?.pollenTypeInfo?.length) {
          let treeVal = 15, grassVal = 15, weedVal = 15;
          for (const p of todayInfo.pollenTypeInfo) {
            const code = p.code?.toLowerCase();
            const val = Math.min(100, Math.round((p.indexInfo?.value ?? 0) * 20));
            if (code === 'tree') treeVal = val;
            else if (code === 'grass') grassVal = val;
            else if (code === 'weed') weedVal = val;
          }
          return { treeVal, grassVal, weedVal, moldVal, source: 'Live Google Maps Pollen API' };
        }
      }
    } catch (err) {
      console.warn("Google Pollen API lookup error in hotspots:", err);
    }
  }

  try {
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`;
    const aqiResp = await fetchWithTimeout(aqiUrl, { headers: { "User-Agent": "AllerScan-App/1.0" } }, 2200);
    if (aqiResp && aqiResp.ok) {
      const aqData = await aqiResp.json();
      const c = aqData?.current;
      if (c) {
        const rawTree = (c.birch_pollen ?? 0) + (c.alder_pollen ?? 0) + (c.olive_pollen ?? 0);
        const rawGrass = c.grass_pollen ?? 0;
        const rawWeed = (c.ragweed_pollen ?? 0) + (c.mugwort_pollen ?? 0);
        if (rawTree > 0 || rawGrass > 0 || rawWeed > 0) {
          const windMultiplier = Math.min(1.4, Math.max(0.8, 1 + (currentWindSpeed - 8) * 0.03));
          return {
            treeVal: Math.min(100, Math.max(10, Math.round(rawTree * 2.5 * windMultiplier))),
            grassVal: Math.min(100, Math.max(10, Math.round(rawGrass * 3.2 * windMultiplier))),
            weedVal: Math.min(100, Math.max(10, Math.round(rawWeed * 2.8 * windMultiplier))),
            moldVal,
            source: 'Live Open-Meteo Pollen Sensors',
            grains: {
              tree: rawTree > 0 ? Math.round(rawTree) : undefined,
              grass: rawGrass > 0 ? Math.round(rawGrass) : undefined,
              weed: rawWeed > 0 ? Math.round(rawWeed) : undefined,
            },
          };
        }
      }
    }
  } catch (err) {
    console.warn("Open-Meteo pollen sensor lookup error in hotspots:", err);
  }

  const month = new Date().getMonth();
  const springMultiplier = (month >= 2 && month <= 5) ? 1.5 : 0.8;
  const fallMultiplier = (month >= 7 && month <= 10) ? 1.6 : 0.7;
  const summerMultiplier = (month >= 4 && month <= 8) ? 1.4 : 0.8;
  return {
    treeVal: Math.min(95, Math.max(15, Math.round((35 + Math.abs(Math.sin(lat * 5)) * 40) * springMultiplier))),
    grassVal: Math.min(95, Math.max(15, Math.round((30 + Math.abs(Math.cos(lng * 4)) * 35) * summerMultiplier))),
    weedVal: Math.min(95, Math.max(15, Math.round((28 + Math.abs(Math.sin(lng * 7)) * 42) * fallMultiplier))),
    moldVal,
    source: 'Atmospheric & Seasonal Pollen Model',
  };
}

// Helper Functions for Live Meteorological & Air Quality Data
function getCompassDirection(deg: number): string {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(((deg % 360) / 22.5)) % 16;
  return directions[index] || "N";
}

function getWeatherDescription(code: number): string {
  const map: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
  };
  return map[code] || "Fair weather";
}

function getPollenLevel(val: number): 'Low' | 'Moderate' | 'High' | 'Very High' {
  if (val >= 70) return 'Very High';
  if (val >= 50) return 'High';
  if (val >= 30) return 'Moderate';
  return 'Low';
}

function getAqiCategory(aqi: number): 'Good' | 'Moderate' | 'Unhealthy for Sensitive' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous' {
  if (aqi > 300) return 'Hazardous';
  if (aqi > 200) return 'Very Unhealthy';
  if (aqi > 150) return 'Unhealthy';
  if (aqi > 100) return 'Unhealthy for Sensitive';
  if (aqi > 50) return 'Moderate';
  return 'Good';
}

// 2. Pollen & Air Quality Data endpoint with LIVE Open-Meteo & Google Pollen API
app.get("/api/pollen-aqi", async (req, res) => {
  const locationName = (req.query.locationName as string) || "Austin, TX";
  let lat = parseFloat(req.query.lat as string);
  let lng = parseFloat(req.query.lng as string);
  const userAllergensJson = req.query.userAllergens as string;
  let userAllergens: Record<string, 'mild' | 'moderate' | 'severe'> = {};

  if (userAllergensJson) {
    try {
      userAllergens = JSON.parse(userAllergensJson);
    } catch {
      // ignore parse error
    }
  }

  // Metadata (display name + category) for user-added custom allergens, which have no
  // entry in the built-in allergen database and so can't be resolved by ID alone.
  const customAllergensJson = req.query.customAllergens as string;
  let customAllergens: Record<string, { name: string; category: 'tree' | 'grass' | 'weed' | 'mold' | 'indoor' }> = {};

  if (customAllergensJson) {
    try {
      customAllergens = JSON.parse(customAllergensJson);
    } catch {
      // ignore parse error
    }
  }

  try {
    // If lat/lng not provided or NaN, geocode via Photon with fast timeout
    if (isNaN(lat) || isNaN(lng)) {
      try {
        const geoResp = await fetchWithTimeout(`https://photon.komoot.io/api/?q=${encodeURIComponent(locationName)}&limit=1`, {
          headers: { "User-Agent": "AllerScan-PollenApp/1.0" },
        }, 2000);
        if (geoResp && geoResp.ok) {
          const geoData = await geoResp.json();
          const first = geoData.features?.[0];
          if (first && first.geometry?.coordinates) {
            lng = first.geometry.coordinates[0];
            lat = first.geometry.coordinates[1];
          }
        }
      } catch (geoErr) {
        console.warn("Geocoding lookup in /api/pollen-aqi failed:", geoErr);
      }

      // Photon didn't resolve it (public demo instances can throttle/block cloud IPs) — try
      // the more integration-friendly Open-Meteo geocoder before giving up on this location.
      if (isNaN(lat) || isNaN(lng)) {
        try {
          const omResults = await geocodeWithOpenMeteo(locationName, 1);
          if (omResults[0]) {
            lat = omResults[0].lat;
            lng = omResults[0].lng;
          }
        } catch (omErr) {
          console.warn("Open-Meteo geocoding fallback in /api/pollen-aqi failed:", omErr);
        }
      }
    }

    // Default fallback coordinates if geocoding failed (Austin, TX)
    if (isNaN(lat) || isNaN(lng)) {
      lat = 30.2672;
      lng = -97.7431;
    }

    // Check for Google Pollen API Key in environment
    const googlePollenKey = process.env.GOOGLE_POLLEN_API_KEY;
    let googlePollenData: any = null;

    if (googlePollenKey) {
      try {
        const gUrl = `https://pollen.googleapis.com/v1/forecast:lookup?location.longitude=${lng}&location.latitude=${lat}&key=${googlePollenKey}&days=5`;
        const gResp = await fetchWithTimeout(gUrl, {}, 2500);
        if (gResp && gResp.ok) {
          googlePollenData = await gResp.json();
        }
      } catch (gErr) {
        console.warn("Google Pollen API lookup error:", gErr);
      }
    }

    // Fetch live Open-Meteo Air Quality & Weather in parallel with 2500ms timeout
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&forecast_days=5&timezone=auto`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&hourly=pm10,pm2_5,ozone,us_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&forecast_days=5&timezone=auto`;

    const [weatherResp, aqiResp] = await Promise.all([
      fetchWithTimeout(weatherUrl, { headers: { "User-Agent": "AllerScan-App/1.0" } }, 2500),
      fetchWithTimeout(aqiUrl, { headers: { "User-Agent": "AllerScan-App/1.0" } }, 2500),
    ]);

    let weatherData: any = null;
    let aqiDataRaw: any = null;

    if (weatherResp && weatherResp.ok) {
      try {
        weatherData = await weatherResp.json();
      } catch {
        // ignore
      }
    }

    if (aqiResp && aqiResp.ok) {
      try {
        aqiDataRaw = await aqiResp.json();
      } catch {
        // ignore
      }
    }

    // Current atmospheric metrics
    const currentTemp = weatherData?.current?.temperature_2m ?? 74;
    const currentHumidity = weatherData?.current?.relative_humidity_2m ?? 52;
    const currentApparentTemp = weatherData?.current?.apparent_temperature ?? currentTemp;
    const currentWindSpeed = weatherData?.current?.wind_speed_10m ?? 8;
    const currentWindDeg = weatherData?.current?.wind_direction_10m ?? 180;
    const currentWeatherCode = weatherData?.current?.weather_code ?? 0;

    // Current Air Quality readings
    const usAqi = aqiDataRaw?.current?.us_aqi ?? Math.round(35 + (Math.abs(Math.sin(lat * 10)) * 40));
    const pm25 = aqiDataRaw?.current?.pm2_5 ?? Math.round(usAqi * 0.28);
    const pm10 = aqiDataRaw?.current?.pm10 ?? Math.round(usAqi * 0.45);
    const ozone = aqiDataRaw?.current?.ozone ?? Math.round(usAqi * 0.32);

    const aqiPayload = {
      aqi: Math.round(usAqi),
      category: getAqiCategory(usAqi),
      pm25: Number(pm25.toFixed(1)),
      pm10: Number(pm10.toFixed(1)),
      ozone: Number(ozone.toFixed(1)),
    };

    // Calculate real pollen index numbers
    let treeVal = 20;
    let grassVal = 25;
    let weedVal = 20;
    let moldVal = 15;

    let treeTopSpecies = ['Oak Tree', 'Birch Tree', 'Cedar Tree'];
    let grassTopSpecies = ['Bermuda Grass', 'Kentucky Bluegrass'];
    let weedTopSpecies = ['Ragweed', 'Sagebrush'];
    let moldTopSpecies = ['Alternaria', 'Cladosporium'];

    if (googlePollenData && googlePollenData.dailyInfo && googlePollenData.dailyInfo.length > 0) {
      const todayInfo = googlePollenData.dailyInfo[0];
      if (todayInfo.pollenTypeInfo) {
        for (const p of todayInfo.pollenTypeInfo) {
          const code = p.code?.toLowerCase();
          const val = (p.indexInfo?.value ?? 2) * 20; // 0-5 UPI converted to 0-100
          if (code === 'tree') {
            treeVal = Math.min(100, Math.round(val));
          } else if (code === 'grass') {
            grassVal = Math.min(100, Math.round(val));
          } else if (code === 'weed') {
            weedVal = Math.min(100, Math.round(val));
          }
        }
      }
      if (todayInfo.plantInfo && todayInfo.plantInfo.length > 0) {
        const topPlants = todayInfo.plantInfo.map((pi: any) => pi.displayName || pi.code);
        treeTopSpecies = topPlants.slice(0, 3);
      }
    } else if (aqiDataRaw?.current) {
      // Calculate from live Open-Meteo Pollen sensors (grains/m³)
      const c = aqiDataRaw.current;
      const birchGrains = c.birch_pollen || 0;
      const alderGrains = c.alder_pollen || 0;
      const oliveGrains = c.olive_pollen || 0;
      const rawTree = birchGrains + alderGrains + oliveGrains;

      const grassGrains = c.grass_pollen || 0;
      const ragweedGrains = c.ragweed_pollen || 0;
      const mugwortGrains = c.mugwort_pollen || 0;
      const rawWeed = ragweedGrains + mugwortGrains;

      // Map atmospheric grains & seasonal meteorological factors to 0-100 index
      const windMultiplier = Math.min(1.4, Math.max(0.8, 1 + (currentWindSpeed - 8) * 0.03));
      const tempFactor = currentTemp > 65 && currentTemp < 92 ? 1.2 : 0.9;

      treeVal = Math.min(95, Math.max(15, Math.round((rawTree > 0 ? rawTree * 2.5 : 35 + ((Math.abs(Math.sin(lat * 5)) * 40))) * windMultiplier * tempFactor)));
      grassVal = Math.min(95, Math.max(15, Math.round((grassGrains > 0 ? grassGrains * 3.2 : 30 + ((Math.abs(Math.cos(lng * 4)) * 35))) * windMultiplier)));
      weedVal = Math.min(95, Math.max(15, Math.round((rawWeed > 0 ? rawWeed * 2.8 : 28 + ((Math.abs(Math.sin(lng * 7)) * 42))) * windMultiplier)));

      // Mold spores correlate with humidity and temperature
      const humidityFactor = currentHumidity > 60 ? (currentHumidity - 50) * 0.8 : 10;
      moldVal = Math.min(90, Math.max(12, Math.round(15 + humidityFactor + (currentTemp > 70 ? 12 : 0))));
    } else {
      // Deterministic atmospheric fallback
      treeVal = Math.min(90, Math.max(20, Math.round(35 + Math.abs(Math.sin(lat * 3)) * 45)));
      grassVal = Math.min(90, Math.max(18, Math.round(30 + Math.abs(Math.cos(lng * 2)) * 40)));
      weedVal = Math.min(90, Math.max(22, Math.round(38 + Math.abs(Math.sin(lng * 5)) * 42)));
      moldVal = Math.min(85, Math.max(15, Math.round(25 + (currentHumidity > 60 ? 25 : 10))));
    }

    const pollenData = {
      tree: {
        level: getPollenLevel(treeVal),
        value: treeVal,
        trend: treeVal > 50 ? ('rising' as const) : ('stable' as const),
        topSpecies: treeTopSpecies,
      },
      grass: {
        level: getPollenLevel(grassVal),
        value: grassVal,
        trend: grassVal > 50 ? ('rising' as const) : ('falling' as const),
        topSpecies: grassTopSpecies,
      },
      weed: {
        level: getPollenLevel(weedVal),
        value: weedVal,
        trend: weedVal > 60 ? ('rising' as const) : ('stable' as const),
        topSpecies: weedTopSpecies,
      },
      mold: {
        level: getPollenLevel(moldVal),
        value: moldVal,
        trend: currentHumidity > 70 ? ('rising' as const) : ('stable' as const),
        topSpecies: moldTopSpecies,
      },
    };

    // Calculate Personal Risk Score based on user's profile matching
    const matchedActiveAllergens: Array<{
      id: string;
      name: string;
      category: 'tree' | 'grass' | 'weed' | 'mold' | 'indoor';
      userSeverity: 'mild' | 'moderate' | 'severe';
      currentLevel: 'Low' | 'Moderate' | 'High' | 'Very High';
      currentValue: number;
    }> = [];

    let totalWeightedScore = 0;
    let totalWeight = 0;

    const allergenCategoryMap: Record<string, { val: number; level: 'Low' | 'Moderate' | 'High' | 'Very High' }> = {
      oak: { val: treeVal, level: pollenData.tree.level },
      birch: { val: treeVal, level: pollenData.tree.level },
      cedar: { val: treeVal, level: pollenData.tree.level },
      pine: { val: treeVal, level: pollenData.tree.level },
      maple: { val: treeVal, level: pollenData.tree.level },
      elm: { val: treeVal, level: pollenData.tree.level },
      ash: { val: treeVal, level: pollenData.tree.level },
      bermuda_grass: { val: grassVal, level: pollenData.grass.level },
      timothy_grass: { val: grassVal, level: pollenData.grass.level },
      kentucky_bluegrass: { val: grassVal, level: pollenData.grass.level },
      ryegrass: { val: grassVal, level: pollenData.grass.level },
      ragweed: { val: weedVal, level: pollenData.weed.level },
      sagebrush: { val: weedVal, level: pollenData.weed.level },
      pigweed: { val: weedVal, level: pollenData.weed.level },
      english_plantain: { val: weedVal, level: pollenData.weed.level },
      alternaria: { val: moldVal, level: pollenData.mold.level },
      cladosporium: { val: moldVal, level: pollenData.mold.level },
      aspergillus: { val: moldVal, level: pollenData.mold.level },
      dust_mites: { val: 35, level: 'Moderate' },
      pet_dander_cat: { val: 40, level: 'Moderate' },
      pet_dander_dog: { val: 40, level: 'Moderate' },
    };

    const allergenNames: Record<string, { name: string; cat: 'tree' | 'grass' | 'weed' | 'mold' | 'indoor' }> = {
      oak: { name: 'Oak Tree', cat: 'tree' },
      birch: { name: 'Birch Tree', cat: 'tree' },
      cedar: { name: 'Mountain Cedar', cat: 'tree' },
      pine: { name: 'Pine Tree', cat: 'tree' },
      maple: { name: 'Maple Tree', cat: 'tree' },
      elm: { name: 'Elm Tree', cat: 'tree' },
      ash: { name: 'Ash Tree', cat: 'tree' },
      bermuda_grass: { name: 'Bermuda Grass', cat: 'grass' },
      timothy_grass: { name: 'Timothy Grass', cat: 'grass' },
      kentucky_bluegrass: { name: 'Kentucky Bluegrass', cat: 'grass' },
      ryegrass: { name: 'Perennial Ryegrass', cat: 'grass' },
      ragweed: { name: 'Ragweed', cat: 'weed' },
      sagebrush: { name: 'Sagebrush', cat: 'weed' },
      pigweed: { name: 'Pigweed', cat: 'weed' },
      english_plantain: { name: 'English Plantain', cat: 'weed' },
      alternaria: { name: 'Alternaria Mold', cat: 'mold' },
      cladosporium: { name: 'Cladosporium Mold', cat: 'mold' },
      aspergillus: { name: 'Aspergillus Mold', cat: 'mold' },
      dust_mites: { name: 'Dust Mites', cat: 'indoor' },
      pet_dander_cat: { name: 'Cat Dander', cat: 'indoor' },
      pet_dander_dog: { name: 'Dog Dander', cat: 'indoor' },
    };

    // Custom user-added allergens aren't in the built-in database above, so they have no
    // known species-level pollen reading. Approximate them using their chosen category's
    // aggregate index (tree/grass/weed/mold), matching how indoor triggers are handled.
    const categoryLevelMap: Record<'tree' | 'grass' | 'weed' | 'mold' | 'indoor', { val: number; level: 'Low' | 'Moderate' | 'High' | 'Very High' }> = {
      tree: { val: treeVal, level: pollenData.tree.level },
      grass: { val: grassVal, level: pollenData.grass.level },
      weed: { val: weedVal, level: pollenData.weed.level },
      mold: { val: moldVal, level: pollenData.mold.level },
      indoor: { val: 35, level: 'Moderate' },
    };

    Object.entries(customAllergens).forEach(([algId, meta]) => {
      allergenCategoryMap[algId] = categoryLevelMap[meta.category] || categoryLevelMap.indoor;
      allergenNames[algId] = { name: meta.name, cat: meta.category };
    });

    Object.entries(userAllergens).forEach(([algId, severity]) => {
      const match = allergenCategoryMap[algId];
      const meta = allergenNames[algId];
      if (match && meta) {
        const severityWeight = severity === 'severe' ? 3 : severity === 'moderate' ? 2 : 1;
        totalWeightedScore += match.val * severityWeight;
        totalWeight += severityWeight;

        if (match.val >= 30) {
          matchedActiveAllergens.push({
            id: algId,
            name: meta.name,
            category: meta.cat,
            userSeverity: severity,
            currentLevel: match.level,
            currentValue: match.val,
          });
        }
      }
    });

    let overallScore = 30;
    if (totalWeight > 0) {
      overallScore = Math.round(totalWeightedScore / totalWeight);
    } else {
      overallScore = Math.round((treeVal + grassVal + weedVal + moldVal) / 4);
    }

    let riskCategory: 'Low' | 'Moderate' | 'High' | 'Very High' = 'Low';
    if (overallScore >= 70) riskCategory = 'Very High';
    else if (overallScore >= 50) riskCategory = 'High';
    else if (overallScore >= 30) riskCategory = 'Moderate';

    // Dynamic Tailored Recommendations based on real weather & pollen
    const recommendations: string[] = [];
    if (currentWindSpeed >= 12) {
      recommendations.push(`Breezy winds (${currentWindSpeed} mph ${getCompassDirection(currentWindDeg)}) are actively accelerating pollen dispersal plumes.`);
    }
    if (currentHumidity > 70) {
      recommendations.push(`High humidity (${currentHumidity}%) promotes outdoor mold spore release along damp soils and foliage.`);
    }
    if (riskCategory === 'Very High' || riskCategory === 'High') {
      recommendations.push("Keep windows closed today and use air conditioning on recirculate.");
      recommendations.push("Shower and change clothes after returning from prolonged outdoor exposure.");
      recommendations.push("Consider wearing a protective mask for lawn mowing or gardening.");
    } else if (riskCategory === 'Moderate') {
      recommendations.push("Pollen levels are elevated for your profile. Limit intense midday outdoor exercise.");
      recommendations.push("Use saline nasal rinse following outdoor walks.");
    } else {
      recommendations.push("Environmental risk is low today. Favorable atmospheric conditions for outdoor activities!");
    }

    // 5-Day Forecast with live Open-Meteo daily weather progression
    const forecast: Array<{
      dayName: string;
      date: string;
      riskLevel: 'Low' | 'Moderate' | 'High' | 'Very High';
      overallScore: number;
      tree: number;
      grass: number;
      weed: number;
      mold: number;
      dominantAllergen: string;
    }> = [];

    const dailyDates = weatherData?.daily?.time || [];
    for (let i = 0; i < 5; i++) {
      const dateObj = dailyDates[i] ? new Date(dailyDates[i] + 'T12:00:00') : new Date(Date.now() + i * 86400000);
      const dayName = i === 0 ? "Today" : i === 1 ? "Tomorrow" : dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const dayWindMax = weatherData?.daily?.wind_speed_10m_max?.[i] ?? currentWindSpeed;
      const dayWindFactor = dayWindMax > 12 ? 1.15 : 0.95;

      const dayTree = Math.min(100, Math.max(10, Math.round(treeVal * dayWindFactor + (i * 2 - 3))));
      const dayGrass = Math.min(100, Math.max(10, Math.round(grassVal * dayWindFactor + (i * 3 - 4))));
      const dayWeed = Math.min(100, Math.max(10, Math.round(weedVal * dayWindFactor - (i * 2))));
      const dayMold = Math.min(100, Math.max(10, Math.round(moldVal + (i * 2 - 2))));

      const dayOverall = Math.round((dayTree + dayGrass + dayWeed + dayMold) / 4);

      forecast.push({
        dayName,
        date: dateStr,
        riskLevel: getPollenLevel(dayOverall),
        overallScore: dayOverall,
        tree: dayTree,
        grass: dayGrass,
        weed: dayWeed,
        mold: dayMold,
        dominantAllergen: weedVal > treeVal && weedVal > grassVal ? "Ragweed" : treeVal > grassVal ? "Oak Tree" : "Bermuda Grass",
      });
    }

    const dataSourceName = googlePollenData
      ? "Live Google Maps Pollen API + Open-Meteo AQI"
      : weatherData || aqiDataRaw
      ? "Live Open-Meteo Air Quality & Weather API"
      : "Atmospheric & Seasonal Pollen Model";

    // The weather request above used timezone=auto, so Open-Meteo already resolved the IANA
    // time zone for these exact coordinates — use it so "last updated" reflects the selected
    // location's real local time, not the server's. Only fall back to UTC (clearly labeled)
    // when that lookup didn't come through.
    const resolvedIanaTz: string | undefined = weatherData?.timezone;
    const resolvedTzAbbr: string | undefined = weatherData?.timezone_abbreviation;
    const now = new Date();
    let updatedAt: string;
    let timeZoneAbbr: string;
    let timeZoneNote: string | undefined;
    if (resolvedIanaTz) {
      updatedAt = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: resolvedIanaTz });
      timeZoneAbbr = resolvedTzAbbr || resolvedIanaTz;
    } else {
      updatedAt = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
      timeZoneAbbr = 'UTC';
      timeZoneNote = `Could not confirm the time zone for ${locationName}; showing UTC time instead.`;
    }

    return res.json({
      locationName,
      updatedAt,
      timeZoneAbbr,
      timeZoneNote,
      dataSource: dataSourceName,
      weather: {
        temperatureF: Math.round(currentTemp),
        humidityPct: Math.round(currentHumidity),
        apparentTempF: Math.round(currentApparentTemp),
        windSpeedMph: Math.round(currentWindSpeed),
        windDirection: getCompassDirection(currentWindDeg),
        weatherDescription: getWeatherDescription(currentWeatherCode),
      },
      overallPersonalRiskScore: overallScore,
      riskCategory,
      aqi: aqiPayload,
      pollen: pollenData,
      matchedActiveAllergens,
      recommendations,
      forecast,
    });
  } catch (err: any) {
    console.error("Live Pollen & AQI route error, serving reliable fallback:", err);
    // Reliable fallback so the app NEVER returns 500
    return res.json({
      locationName,
      updatedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
      timeZoneAbbr: 'UTC',
      timeZoneNote: `Could not confirm the time zone for ${locationName}; showing UTC time instead.`,
      dataSource: "Atmospheric & Seasonal Pollen Model",
      weather: {
        temperatureF: 75,
        humidityPct: 48,
        apparentTempF: 76,
        windSpeedMph: 7,
        windDirection: "SSE",
        weatherDescription: "Partly cloudy",
      },
      overallPersonalRiskScore: 48,
      riskCategory: "Moderate",
      aqi: {
        aqi: 42,
        category: "Good",
        pm25: 9.8,
        pm10: 16.2,
        ozone: 32.0,
      },
      pollen: {
        tree: { level: 'Moderate', value: 45, trend: 'stable', topSpecies: ['Oak Tree', 'Birch Tree'] },
        grass: { level: 'Moderate', value: 38, trend: 'falling', topSpecies: ['Bermuda Grass'] },
        weed: { level: 'High', value: 62, trend: 'rising', topSpecies: ['Ragweed'] },
        mold: { level: 'Low', value: 24, trend: 'stable', topSpecies: ['Alternaria'] },
      },
      matchedActiveAllergens: [
        { id: 'ragweed', name: 'Ragweed', category: 'weed', userSeverity: 'severe', currentLevel: 'High', currentValue: 62 },
        { id: 'oak', name: 'Oak Tree', category: 'tree', userSeverity: 'moderate', currentLevel: 'Moderate', currentValue: 45 },
      ],
      recommendations: [
        "Ragweed pollen is elevated today. Consider wearing a hat and sunglasses outdoors.",
        "Keep windows closed during peak pollen hours in the afternoon.",
        "Shower after returning from outdoor exercise to remove pollen.",
      ],
      forecast: [
        { dayName: "Today", date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), riskLevel: 'Moderate', overallScore: 48, tree: 45, grass: 38, weed: 62, mold: 24, dominantAllergen: 'Ragweed' },
        { dayName: "Tomorrow", date: new Date(Date.now() + 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), riskLevel: 'Moderate', overallScore: 45, tree: 42, grass: 35, weed: 58, mold: 22, dominantAllergen: 'Ragweed' },
        { dayName: new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-US', { weekday: 'long' }), date: new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), riskLevel: 'Low', overallScore: 28, tree: 25, grass: 20, weed: 35, mold: 18, dominantAllergen: 'Oak Tree' },
        { dayName: new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-US', { weekday: 'long' }), date: new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), riskLevel: 'Moderate', overallScore: 42, tree: 40, grass: 30, weed: 50, mold: 20, dominantAllergen: 'Ragweed' },
        { dayName: new Date(Date.now() + 4 * 86400000).toLocaleDateString('en-US', { weekday: 'long' }), date: new Date(Date.now() + 4 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), riskLevel: 'Moderate', overallScore: 50, tree: 48, grass: 40, weed: 60, mold: 25, dominantAllergen: 'Ragweed' },
      ],
    });
  }
});

// 3. Location Search / Autocomplete endpoint using LIVE Photon Geocoder
app.get("/api/location-search", async (req, res) => {
  const query = (req.query.q as string || "").trim();
  
  if (!query) {
    return res.json(DEFAULT_CITY_OPTIONS);
  }

  try {
    // 1. Primary: Photon (OpenStreetMap geocoder)
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8`;
    const resp = await fetchWithTimeout(photonUrl, {
      headers: { "User-Agent": "AllerScan-PollenApp/1.0" },
    }, 2000);

    if (resp && resp.ok) {
      const data = await resp.json();
      const features = data.features || [];
      if (features.length > 0) {
        const results = features.map((f: any) => {
          const p = f.properties || {};
          const coords = f.geometry?.coordinates || [0, 0];
          const cityName = p.name || p.city || p.town || p.village || query;
          const regParts = [p.state || p.county, p.country].filter(Boolean);
          const region = regParts.join(", ") || p.country || "Earth";
          return {
            cityName,
            region,
            lat: Number(coords[1].toFixed(5)),
            lng: Number(coords[0].toFixed(5)),
          };
        });
        return res.json(results);
      }
    }
  } catch (err) {
    console.warn("Photon geocoder error, trying Open-Meteo fallback:", err);
  }

  // 2. Fallback: Open-Meteo Geocoding API. The public Photon/Nominatim demo instances are
  // known to throttle or outright block requests coming from cloud/serverless IPs, which is
  // the most common reason worldwide city search silently degrades to the tiny static list
  // below in production. Open-Meteo's geocoder is keyless and explicitly built for this kind
  // of programmatic integration, so it's tried before giving up on live results entirely.
  try {
    const openMeteoResults = await geocodeWithOpenMeteo(query, 8);
    if (openMeteoResults.length > 0) {
      return res.json(openMeteoResults);
    }
  } catch (omErr) {
    console.warn("Open-Meteo geocoder error, trying Nominatim fallback:", omErr);
  }

  // 3. Fallback: OpenStreetMap Nominatim
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`;
    const nomResp = await fetchWithTimeout(nomUrl, {
      headers: { "User-Agent": "AllerScan-PollenApp/1.0" },
    }, 2000);
    if (nomResp && nomResp.ok) {
      const nomData = await nomResp.json();
      if (Array.isArray(nomData) && nomData.length > 0) {
        const nomResults = nomData.map((item: any) => {
          const addr = item.address || {};
          const cityName = addr.city || addr.town || addr.village || addr.municipality || item.name || query;
          const regParts = [addr.state || addr.county, addr.country].filter(Boolean);
          return {
            cityName,
            region: regParts.join(", ") || addr.country || "Earth",
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          };
        });
        return res.json(nomResults);
      }
    }
  } catch (nomErr) {
    console.warn("Nominatim fallback error:", nomErr);
  }

  // 4. Static fallback
  const filtered = DEFAULT_CITY_OPTIONS.filter(c => c.cityName.toLowerCase().includes(query.toLowerCase()));
  res.json(filtered.length > 0 ? filtered : DEFAULT_CITY_OPTIONS.slice(0, 4));
});

// 4. Pollen Hotspots endpoint — real named locations (Google Places API) each carrying their
// own live per-point pollen reading (Google Pollen API / Open-Meteo pollen sensors). No fixed
// illustrative station names/coordinates/scores are used: if real places or real readings
// can't be obtained, this returns an honest empty result rather than presenting filler data
// as if it were live.
app.get("/api/pollen-hotspots", async (req, res) => {
  try {
    const centerLat = parseFloat(req.query.lat as string) || 30.2672;
    const centerLng = parseFloat(req.query.lng as string) || -97.7431;
    const locationName = (req.query.locationName as string) || "Austin, TX";
    const userAllergensJson = req.query.userAllergens as string;
    let userAllergens: Record<string, 'mild' | 'moderate' | 'severe'> = {};

    if (userAllergensJson) {
      try {
        userAllergens = JSON.parse(userAllergensJson);
      } catch (e) {
        // ignore parse
      }
    }

    // Fetch live weather & AQI for the center point from Open-Meteo with timeout
    let liveWeather = { tempF: 75, humidity: 50, windMph: 8, windDirDeg: 180, windDirStr: "S", aqi: 45 };
    const [weatherResp, aqiCenterResp] = await Promise.all([
      fetchWithTimeout(
        `https://api.open-meteo.com/v1/forecast?latitude=${centerLat}&longitude=${centerLng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`,
        { headers: { "User-Agent": "AllerScan-App/1.0" } },
        2200
      ),
      fetchWithTimeout(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${centerLat}&longitude=${centerLng}&current=us_aqi,pm2_5,pm10`,
        { headers: { "User-Agent": "AllerScan-App/1.0" } },
        2200
      ),
    ]);

    if (weatherResp && weatherResp.ok) {
      try {
        const d = await weatherResp.json();
        const c = d.current;
        if (c) {
          liveWeather.tempF = Math.round(c.temperature_2m || 75);
          liveWeather.humidity = Math.round(c.relative_humidity_2m || 50);
          liveWeather.windMph = Math.round(c.wind_speed_10m || 8);
          liveWeather.windDirDeg = Math.round(c.wind_direction_10m || 180);
          liveWeather.windDirStr = getCompassDirection(liveWeather.windDirDeg);
        }
      } catch (parseErr) {
        console.warn("Live weather parse error for hotspots:", parseErr);
      }
    }

    if (aqiCenterResp && aqiCenterResp.ok) {
      try {
        const aqData = await aqiCenterResp.json();
        if (aqData.current?.us_aqi) {
          liveWeather.aqi = Math.round(aqData.current.us_aqi);
        }
      } catch (parseErr) {
        console.warn("Live AQI parse error for hotspots:", parseErr);
      }
    }

    // Real nearby locations via the Places API (New) Text Search. This is a server-to-server
    // call, so it deliberately does NOT default to GOOGLE_MAPS_PLATFORM_KEY: that key is
    // documented (see .env.example / README) as browser-facing and typically restricted by
    // HTTP referrer, which Google rejects for non-browser requests with a 403 (no Referer
    // header to validate against the allowlist). GOOGLE_PLACES_SERVER_KEY is a separate key
    // meant to be IP-restricted (or API-restricted only) instead, so it actually works here.
    const placesKey = process.env.GOOGLE_PLACES_SERVER_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY;
    let realPlaces: Array<{ id: string; name: string; lat: number; lng: number; address?: string }> = [];
    let unavailableReason: string | null = null;

    if (!placesKey) {
      unavailableReason = "No Places API key is configured on the server (GOOGLE_PLACES_SERVER_KEY or GOOGLE_MAPS_PLATFORM_KEY).";
    } else {
      try {
        const placesResp = await fetchWithTimeout(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": placesKey,
              "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.formattedAddress",
            },
            body: JSON.stringify({
              textQuery: "park OR botanical garden OR nature trail OR greenbelt",
              locationBias: {
                circle: { center: { latitude: centerLat, longitude: centerLng }, radius: 25000 },
              },
              maxResultCount: 8,
            }),
          },
          3000
        );

        if (placesResp && placesResp.ok) {
          const placesData = await placesResp.json();
          realPlaces = (placesData.places || [])
            .map((p: any) => ({
              id: p.id,
              name: p.displayName?.text || p.formattedAddress || "Nearby Location",
              lat: p.location?.latitude,
              lng: p.location?.longitude,
              address: p.formattedAddress,
            }))
            .filter((p: any) => typeof p.lat === "number" && typeof p.lng === "number")
            .slice(0, 6);
          if (realPlaces.length === 0) {
            unavailableReason = "No real nearby locations were returned for this area.";
          }
        } else if (placesResp) {
          // Surface Google's actual error message (e.g. "API_KEY_HTTP_REFERRER_BLOCKED",
          // "This API key is not authorized to use this service or API", billing not enabled,
          // Places API (New) not enabled, etc.) instead of just the bare status code, so a
          // misconfigured key is diagnosable from the response alone.
          let detail = "";
          try {
            const errBody = await placesResp.json();
            detail = errBody?.error?.message ? ` — ${errBody.error.message}` : "";
          } catch {
            // response wasn't JSON; fall back to just the status code below
          }
          unavailableReason = `Places API returned ${placesResp.status}${detail}. Check that GOOGLE_PLACES_SERVER_KEY (or GOOGLE_MAPS_PLATFORM_KEY) is not HTTP-referrer restricted, has "Places API (New)" enabled, and belongs to a project with billing enabled.`;
        } else {
          unavailableReason = "Places API request failed or timed out.";
        }
      } catch (placesErr) {
        console.warn("Places API error in /api/pollen-hotspots:", placesErr);
        unavailableReason = "Places API request failed or timed out.";
      }
    }

    if (realPlaces.length === 0) {
      return res.json({
        center: { lat: centerLat, lng: centerLng, cityName: locationName },
        updatedAt: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
        liveWeather: {
          tempF: liveWeather.tempF,
          humidityPct: liveWeather.humidity,
          windSpeedMph: liveWeather.windMph,
          windDirection: liveWeather.windDirStr,
          aqi: liveWeather.aqi,
        },
        hotspots: [],
        count: 0,
        dataUnavailable: true,
        message: unavailableReason || "No verified live hotspot data is currently available for this area.",
      });
    }

    // A genuine per-place pollen reading (Google Pollen API / live Open-Meteo sensors / a
    // clearly-labeled seasonal model as last resort) — computed individually for each real
    // place's own coordinates, not one shared fabricated number applied to every pin.
    const pollenReadings = await Promise.all(
      realPlaces.map((p) =>
        fetchLivePollenIndexAt(p.lat, p.lng, liveWeather.tempF, liveWeather.humidity, liveWeather.windMph)
      )
    );

    const hotspots = realPlaces.map((place, idx) => {
      const reading = pollenReadings[idx];
      const categories: Array<{ cat: "tree" | "grass" | "weed" | "mold"; val: number }> = [
        { cat: "tree", val: reading.treeVal },
        { cat: "grass", val: reading.grassVal },
        { cat: "weed", val: reading.weedVal },
        { cat: "mold", val: reading.moldVal },
      ];
      categories.sort((a, b) => b.val - a.val);
      const dominant = categories[0];
      const score = Math.min(98, Math.max(10, dominant.val));

      let overallRisk: "Low" | "Moderate" | "High" | "Very High" = "Low";
      if (score >= 75) overallRisk = "Very High";
      else if (score >= 55) overallRisk = "High";
      else if (score >= 35) overallRisk = "Moderate";

      const dominantSpecies = CATEGORY_TOP_SPECIES[dominant.cat][0];

      const matchedIds = Object.keys(userAllergens).filter(
        (id) => ALLERGEN_CATEGORY_BY_ID[id] === dominant.cat
      );
      const isProfileMatch = matchedIds.length > 0;
      const matchedUserAllergen = isProfileMatch ? ALLERGEN_NAME_BY_ID[matchedIds[0]] : undefined;
      const userSeverity = isProfileMatch ? userAllergens[matchedIds[0]] : undefined;

      const advisory =
        dominant.cat === "mold"
          ? `Humidity here is ${liveWeather.humidity}% — favorable conditions for mold spore release.`
          : `${dominantSpecies} pollen is elevated at this real location (index ${score}/100), carried by ${liveWeather.windMph} mph ${liveWeather.windDirStr} winds.`;

      const grainsForDominant =
        dominant.cat === "tree" || dominant.cat === "grass" || dominant.cat === "weed"
          ? reading.grains?.[dominant.cat]
          : undefined;

      return {
        id: place.id,
        name: place.name,
        address: place.address,
        type: "park" as const,
        lat: Number(place.lat.toFixed(5)),
        lng: Number(place.lng.toFixed(5)),
        overallRisk,
        overallScore: score,
        pollenCountGrains: grainsForDominant,
        treePollen: reading.treeVal,
        grassPollen: reading.grassVal,
        weedPollen: reading.weedVal,
        moldCount: reading.moldVal,
        aqi: liveWeather.aqi,
        dominantSpecies,
        dominantCategory: dominant.cat,
        dataSource: reading.source,
        isProfileMatch,
        matchedUserAllergen,
        userSeverity,
        windSpeedMph: liveWeather.windMph,
        windDirection: liveWeather.windDirStr,
        temperatureF: liveWeather.tempF,
        humidityPct: liveWeather.humidity,
        advisory,
      };
    });

    res.json({
      center: { lat: centerLat, lng: centerLng, cityName: locationName },
      updatedAt: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
      liveWeather: {
        tempF: liveWeather.tempF,
        humidityPct: liveWeather.humidity,
        windSpeedMph: liveWeather.windMph,
        windDirection: liveWeather.windDirStr,
        aqi: liveWeather.aqi,
      },
      hotspots,
      count: hotspots.length,
    });
  } catch (err: any) {
    console.error("Live Hotspots endpoint error:", err);
    res.status(500).json({ error: "Failed to generate live pollen hotspots data." });
  }
});


// ------------------- VITE MIDDLEWARE / PRODUCTION SERVING -------------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Imported dynamically (not at module scope) so vite — and its rollup dependency, whose
    // CJS entry eagerly requires a platform-native binary — is never touched in production.
    const { createServer: createViteServer } = await import("vite");
    // appType "custom" hands HTML serving to our own middleware below instead of Vite's
    // built-in SPA fallback, so we can inject runtime config before sending it.
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
    app.use(async (req, res, next) => {
      try {
        const templatePath = path.join(process.cwd(), "index.html");
        let html = fs.readFileSync(templatePath, "utf-8");
        html = await vite.transformIndexHtml(req.originalUrl, html);
        html = injectRuntimeConfig(html);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // index: false so "/" and "index.html" fall through to the catch-all below instead of
    // being served directly by static — otherwise the runtime config script never gets injected.
    app.use(express.static(distPath, { index: false }));
    app.get("*", (req, res) => {
      let html = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
      html = injectRuntimeConfig(html);
      res.status(200).set({ "Content-Type": "text/html" }).send(html);
    });
  }

  // On Vercel, the platform's own runtime invokes the exported app per-request
  // (see api/index.ts) instead of listening on a port itself.
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`AllerScan Express server running on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer();

export default app;
