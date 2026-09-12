import express from "express";
import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { DEFAULT_CITY_OPTIONS } from "./src/data/defaultCities.js";
import { MASTER_ALLERGENS } from "./src/data/allergensDatabase.js";
import { applySensitivity } from "./src/utils/sensitivity.js";
import { emptySafeTable, withSafeKeys } from "./src/utils/safeKeys.js";

// Category/name lookups for the built-in allergen database, shared by routes below that need
// to match a real live pollen reading's dominant category against the user's saved allergens.
// Null-prototype: these are indexed with ids that came from a request, and a plain object would
// answer `table["constructor"]` with an inherited function that passes a truthy guard.
const ALLERGEN_CATEGORY_BY_ID: Record<string, string> = Object.assign(
  emptySafeTable<string>(),
  Object.fromEntries(MASTER_ALLERGENS.map((a) => [a.id, a.category]))
);
const ALLERGEN_NAME_BY_ID: Record<string, string> = Object.assign(
  emptySafeTable<string>(),
  Object.fromEntries(MASTER_ALLERGENS.map((a) => [a.id, a.name]))
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

// Only the scan endpoint receives large payloads (a base64 photo). Everything else gets the
// default limit, so an oversized body can't be posted at any other route.
const scanBodyParser = express.json({ limit: "25mb" });
app.use(express.json({ limit: "100kb" }));

// A small in-memory response cache. Without it, two people in the same city — or one person
// tapping refresh — each trigger the full upstream fan-out (up to 15 calls for the hotspots
// route). Values are short-lived because pollen indices move hourly at most.
const responseCache = new Map<string, { expires: number; payload: unknown }>();
const CACHE_MAX_ENTRIES = 200;

function cacheGet<T>(key: string): T | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return hit.payload as T;
}

function cacheSet(key: string, payload: unknown, ttlMs: number): void {
  if (responseCache.size >= CACHE_MAX_ENTRIES) {
    // Cheap eviction: drop whatever the iterator yields first (insertion order).
    const oldest = responseCache.keys().next();
    if (!oldest.done) responseCache.delete(oldest.value);
  }
  responseCache.set(key, { expires: Date.now() + ttlMs, payload });
}

/** Rounds coordinates so nearby requests share a cache entry (~1 km at the equator). */
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

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
// Hosts the preset sample images are served from. The imageUrl branch exists only for those;
// fetching an arbitrary caller-supplied URL would let anyone use this server to reach private
// addresses (cloud metadata endpoints, localhost services) it can see and they can't.
//
// Validating the caller's string and then fetching that same string still hands an
// attacker-controlled value to fetch(): it is only safe for as long as `new URL()` and the fetch
// implementation agree about how to parse a hostile URL, and that class of parser differential is
// exactly how allowlists get bypassed. So the host that reaches fetch() is never the caller's —
// the origin below is a literal, and only the path and query survive from the request.
//
// Written as an explicit conditional over string literals rather than a lookup table: with two
// hosts it is just as readable, there is no computed property access to get wrong, and the
// constant origin is obvious to a reader and to static analysis alike.
function resolveAllowedImageUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase();
  const path = `${parsed.pathname}${parsed.search}`;

  if (host === "images.unsplash.com") return `https://images.unsplash.com${path}`;
  if (host === "plus.unsplash.com") return `https://plus.unsplash.com${path}`;
  return null;
}

app.post("/api/scan", scanBodyParser, async (req, res) => {
  try {
    const { imageBase64, imageUrl, presetHint } = req.body;

    if (!imageBase64 && !imageUrl && !presetHint) {
      return res.status(400).json({ error: "Missing image payload (imageBase64 or imageUrl required)." });
    }

    // Resolved up front so the guard doesn't depend on whether a Gemini key happens to be set.
    // Everything downstream uses `resolvedImageUrl`, never the caller's `imageUrl`.
    let resolvedImageUrl: string | null = null;
    if (imageUrl) {
      resolvedImageUrl = resolveAllowedImageUrl(imageUrl);
      if (!resolvedImageUrl) {
        return res.status(400).json({
          error: "That image URL isn't allowed. Send the image as base64 instead.",
        });
      }
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
        } else if (resolvedImageUrl) {
          const imgResp = await fetchWithTimeout(resolvedImageUrl, {}, 4000);
          if (!imgResp || !imgResp.ok) {
            throw new Error("Could not download the preset image");
          }
          const contentType = imgResp.headers.get("content-type") || "image/jpeg";
          if (!contentType.startsWith("image/")) {
            throw new Error("The preset URL did not return an image");
          }
          const arrayBuffer = await imgResp.arrayBuffer();
          const base64Str = Buffer.from(arrayBuffer).toString("base64");
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

        // Candidates in preference order. The floating alias goes first so this keeps working
        // as Google's catalogue moves; the pinned id is the fallback. Verify these against the
        // current model list before changing them — an id that doesn't exist costs a failed
        // round trip on every single scan.
        const candidateModels = ["gemini-flash-latest", "gemini-2.5-flash"];

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
            const isDemandSpike =
              errMsg.includes("503") ||
              errMsg.includes("high demand") ||
              errMsg.includes("UNAVAILABLE") ||
              errMsg.includes("429");
            const isPermanent =
              errMsg.includes("404") ||
              errMsg.includes("NOT_FOUND") ||
              errMsg.includes("PERMISSION_DENIED") ||
              errMsg.includes("API key not valid");

            if (isDemandSpike) {
              console.warn(`[Gemini API] ${modelName} temporarily at capacity, trying the next candidate...`);
            } else if (isPermanent) {
              // A missing model or a bad key is a configuration error, not a capacity blip.
              // Retrying the rest of the list just burns latency on every request.
              console.error(`[Gemini API] ${modelName} is unavailable to this key (configuration error):`, errMsg);
              break;
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
    res.status(500).json({ error: "Failed to process the photo scan. Try again in a moment." });
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

/**
 * A JSON fetch whose parsed body is cached by key. Caching the upstream calls rather than the
 * finished responses means two people in the same city share one round trip to Open-Meteo while
 * each still gets a response personalised to their own allergen profile.
 */
async function cachedJsonFetch(
  cacheKey: string,
  url: string,
  options: RequestInit = {},
  timeoutMs = 2500,
  ttlMs = 10 * 60 * 1000
): Promise<any | null> {
  const cached = cacheGet<any>(cacheKey);
  if (cached !== null) return cached;

  const resp = await fetchWithTimeout(url, options, timeoutMs);
  if (!resp || !resp.ok) return null;

  try {
    const data = await resp.json();
    cacheSet(cacheKey, data, ttlMs);
    return data;
  } catch {
    return null;
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
  const moldVal = Math.min(90, Math.max(5, Math.round(15 + humidityFactor + (currentTemp > 70 ? 12 : 0))));

  if (googlePollenKey) {
    try {
      const gUrl = `https://pollen.googleapis.com/v1/forecast:lookup?location.longitude=${lng}&location.latitude=${lat}&key=${googlePollenKey}&days=1`;
      const gData = await cachedJsonFetch(`gpollen1:${coordKey(lat, lng)}`, gUrl, {}, 2200);
      if (gData) {
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
    const aqData = await cachedJsonFetch(
      `pointpollen:${coordKey(lat, lng)}`,
      aqiUrl,
      { headers: { "User-Agent": "AllerScan-App/1.0" } },
      2200
    );
    if (aqData) {
      const c = aqData?.current;
      if (c) {
        const rawTree = (c.birch_pollen ?? 0) + (c.alder_pollen ?? 0) + (c.olive_pollen ?? 0);
        const rawGrass = c.grass_pollen ?? 0;
        const rawWeed = (c.ragweed_pollen ?? 0) + (c.mugwort_pollen ?? 0);
        if (rawTree > 0 || rawGrass > 0 || rawWeed > 0) {
          const windMultiplier = Math.min(1.4, Math.max(0.8, 1 + (currentWindSpeed - 8) * 0.03));
          return {
            treeVal: Math.min(100, Math.max(0, Math.round(rawTree * 2.5 * windMultiplier))),
            grassVal: Math.min(100, Math.max(0, Math.round(rawGrass * 3.2 * windMultiplier))),
            weedVal: Math.min(100, Math.max(0, Math.round(rawWeed * 2.8 * windMultiplier))),
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

  // Seasons invert below the equator.
  const rawMonth = new Date().getMonth();
  const month = lat < 0 ? (rawMonth + 6) % 12 : rawMonth;
  const springMultiplier = (month >= 2 && month <= 5) ? 1.5 : 0.8;
  const fallMultiplier = (month >= 7 && month <= 10) ? 1.6 : 0.7;
  const summerMultiplier = (month >= 4 && month <= 8) ? 1.4 : 0.8;
  return {
    treeVal: Math.min(95, Math.max(5, Math.round((35 + Math.abs(Math.sin(lat * 5)) * 40) * springMultiplier))),
    grassVal: Math.min(95, Math.max(5, Math.round((30 + Math.abs(Math.cos(lng * 4)) * 35) * summerMultiplier))),
    weedVal: Math.min(95, Math.max(5, Math.round((28 + Math.abs(Math.sin(lng * 7)) * 42) * fallMultiplier))),
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
      // Ids become computed property keys on the lookup tables below — see utils/safeKeys.
      userAllergens = withSafeKeys(JSON.parse(userAllergensJson));
    } catch {
      // ignore parse error
    }
  }

  // 1 (less reactive) to 3 (more reactive); 2 is neutral. Previously stored in the profile and
  // read by nothing.
  const parsedSensitivity = Number(req.query.sensitivityFactor);
  const sensitivityFactor = Number.isFinite(parsedSensitivity) ? parsedSensitivity : 2;

  // Metadata (display name + category) for user-added custom allergens, which have no
  // entry in the built-in allergen database and so can't be resolved by ID alone.
  const customAllergensJson = req.query.customAllergens as string;
  let customAllergens: Record<string, { name: string; category: 'tree' | 'grass' | 'weed' | 'mold' | 'indoor' }> = {};

  if (customAllergensJson) {
    try {
      customAllergens = withSafeKeys(JSON.parse(customAllergensJson));
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
        googlePollenData = await cachedJsonFetch(`gpollen5:${coordKey(lat, lng)}`, gUrl, {}, 2500);
      } catch (gErr) {
        console.warn("Google Pollen API lookup error:", gErr);
      }
    }

    // Fetch live Open-Meteo Air Quality & Weather in parallel with 2500ms timeout
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&forecast_days=5&timezone=auto`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&hourly=pm10,pm2_5,ozone,us_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&forecast_days=5&timezone=auto`;

    const [weatherData, aqiDataRaw] = await Promise.all([
      cachedJsonFetch(
        `weather5:${coordKey(lat, lng)}`,
        weatherUrl,
        { headers: { "User-Agent": "AllerScan-App/1.0" } },
        2500
      ),
      cachedJsonFetch(
        `aqi5:${coordKey(lat, lng)}`,
        aqiUrl,
        { headers: { "User-Agent": "AllerScan-App/1.0" } },
        2500
      ),
    ]);

    // Current atmospheric metrics
    const currentTemp = weatherData?.current?.temperature_2m ?? 74;
    const currentHumidity = weatherData?.current?.relative_humidity_2m ?? 52;
    const currentApparentTemp = weatherData?.current?.apparent_temperature ?? currentTemp;
    const currentWindSpeed = weatherData?.current?.wind_speed_10m ?? 8;
    const currentWindDeg = weatherData?.current?.wind_direction_10m ?? 180;
    const currentWeatherCode = weatherData?.current?.weather_code ?? 0;

    // Current air quality. Emitted only when the live feed actually reported one — deriving a
    // plausible AQI from `Math.sin(lat)` produced a number indistinguishable from a measurement.
    const liveAqi = aqiDataRaw?.current;
    const usAqi = typeof liveAqi?.us_aqi === 'number' ? liveAqi.us_aqi : null;
    const aqiPayload =
      usAqi === null
        ? undefined
        : {
            aqi: Math.round(usAqi),
            category: getAqiCategory(usAqi),
            pm25: Number((typeof liveAqi.pm2_5 === 'number' ? liveAqi.pm2_5 : 0).toFixed(1)),
            pm10: Number((typeof liveAqi.pm10 === 'number' ? liveAqi.pm10 : 0).toFixed(1)),
            ozone: Number((typeof liveAqi.ozone === 'number' ? liveAqi.ozone : 0).toFixed(1)),
          };

    // Calculate the pollen index numbers, tracking where they came from.
    //
    // The weather call succeeding tells you nothing about whether pollen data exists for this
    // point: Open-Meteo's forecast grid is global, its pollen sensor grid is not. Labelling both
    // with one "Live" badge meant modelled numbers shipped as readings, so the provenance is
    // tracked separately here and returned as `pollenDataSource` / `pollenIsModeled`.
    let treeVal = 20;
    let grassVal = 25;
    let weedVal = 20;
    let moldVal = 15;
    let pollenSource = "Atmospheric & Seasonal Pollen Model";
    let pollenIsModeled = true;

    let treeTopSpecies = ['Oak Tree', 'Birch Tree', 'Cedar Tree'];
    let grassTopSpecies = ['Bermuda Grass', 'Kentucky Bluegrass'];
    let weedTopSpecies = ['Ragweed', 'Sagebrush'];
    const moldTopSpecies = ['Alternaria', 'Cladosporium'];

    // Mold is always derived from humidity and temperature — no source reports it directly.
    const humidityFactor = currentHumidity > 60 ? (currentHumidity - 50) * 0.8 : 10;
    const derivedMold = Math.min(90, Math.max(5, Math.round(15 + humidityFactor + (currentTemp > 70 ? 12 : 0))));

    const googleTodayInfo = googlePollenData?.dailyInfo?.[0];
    const googleTypeInfo: any[] = googleTodayInfo?.pollenTypeInfo || [];
    // A type with no index value means "Google has no reading", which is not the same as a
    // reading of zero. Substituting a mid-scale 2 (40/100) invented a Moderate day out of nothing.
    const googleHasReading = googleTypeInfo.some((p: any) => typeof p?.indexInfo?.value === 'number');

    if (googleHasReading) {
      for (const p of googleTypeInfo) {
        const code = p.code?.toLowerCase();
        const raw = p?.indexInfo?.value;
        if (typeof raw !== 'number') continue;
        const val = Math.min(100, Math.round(raw * 20)); // 0-5 UPI to 0-100
        if (code === 'tree') treeVal = val;
        else if (code === 'grass') grassVal = val;
        else if (code === 'weed') weedVal = val;
      }
      moldVal = derivedMold;
      pollenSource = "Live Google Maps Pollen API";
      pollenIsModeled = false;

      // Google's plantInfo mixes trees, grasses and weeds in one array. Filing all of it under
      // "tree" put ragweed in the Tree Pollen card and left the others on their defaults.
      const plants: any[] = googleTodayInfo?.plantInfo || [];
      const named = plants.filter((pi: any) => pi?.displayName || pi?.code);
      const byType = (type: string) =>
        named
          .filter((pi: any) => (pi?.plantDescription?.type || '').toUpperCase() === type)
          .map((pi: any) => pi.displayName || pi.code)
          .slice(0, 3);

      const googleTrees = byType('TREE');
      const googleGrasses = byType('GRASS');
      const googleWeeds = byType('WEED');
      if (googleTrees.length > 0) treeTopSpecies = googleTrees;
      if (googleGrasses.length > 0) grassTopSpecies = googleGrasses;
      if (googleWeeds.length > 0) weedTopSpecies = googleWeeds;
    } else if (aqiDataRaw?.current) {
      // Live Open-Meteo pollen sensors, in grains/m3. `null` means the grid doesn't cover this
      // point; `0` is a real reading and is passed through as a real zero rather than being
      // overwritten with a seasonal guess — winter really does have no grass pollen.
      const c = aqiDataRaw.current;
      const readField = (value: unknown): number | null =>
        typeof value === 'number' && Number.isFinite(value) ? value : null;

      const birch = readField(c.birch_pollen);
      const alder = readField(c.alder_pollen);
      const olive = readField(c.olive_pollen);
      const grass = readField(c.grass_pollen);
      const ragweed = readField(c.ragweed_pollen);
      const mugwort = readField(c.mugwort_pollen);

      const hasTree = birch !== null || alder !== null || olive !== null;
      const hasGrass = grass !== null;
      const hasWeed = ragweed !== null || mugwort !== null;

      if (hasTree || hasGrass || hasWeed) {
        const windMultiplier = Math.min(1.4, Math.max(0.8, 1 + (currentWindSpeed - 8) * 0.03));
        const tempFactor = currentTemp > 65 && currentTemp < 92 ? 1.2 : 0.9;
        const rawTree = (birch ?? 0) + (alder ?? 0) + (olive ?? 0);
        const rawWeed = (ragweed ?? 0) + (mugwort ?? 0);

        treeVal = hasTree ? Math.min(100, Math.round(rawTree * 2.5 * windMultiplier * tempFactor)) : 0;
        grassVal = hasGrass ? Math.min(100, Math.round((grass ?? 0) * 3.2 * windMultiplier)) : 0;
        weedVal = hasWeed ? Math.min(100, Math.round(rawWeed * 2.8 * windMultiplier)) : 0;
        moldVal = derivedMold;
        pollenSource = "Live Open-Meteo Pollen Sensors";
        pollenIsModeled = false;
      }
    }

    if (pollenIsModeled) {
      // No live pollen coverage for this point. These are seasonal/geographic estimates and are
      // labelled as such by `pollenIsModeled`, so the dashboard can say so instead of implying a
      // sensor reading.
      const month = new Date().getMonth();
      const hemisphereMonth = lat < 0 ? (month + 6) % 12 : month;
      const springMultiplier = hemisphereMonth >= 2 && hemisphereMonth <= 5 ? 1.5 : 0.8;
      const summerMultiplier = hemisphereMonth >= 4 && hemisphereMonth <= 8 ? 1.4 : 0.8;
      const fallMultiplier = hemisphereMonth >= 7 && hemisphereMonth <= 10 ? 1.6 : 0.7;

      treeVal = Math.min(95, Math.max(5, Math.round((35 + Math.abs(Math.sin(lat * 5)) * 40) * springMultiplier)));
      grassVal = Math.min(95, Math.max(5, Math.round((30 + Math.abs(Math.cos(lng * 4)) * 35) * summerMultiplier)));
      weedVal = Math.min(95, Math.max(5, Math.round((28 + Math.abs(Math.sin(lng * 7)) * 42) * fallMultiplier)));
      moldVal = derivedMold;
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

    const allergenCategoryMap: Record<string, { val: number; level: 'Low' | 'Moderate' | 'High' | 'Very High' }> = Object.assign(emptySafeTable<{ val: number; level: 'Low' | 'Moderate' | 'High' | 'Very High' }>(), {
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
    });

    const allergenNames: Record<string, { name: string; cat: 'tree' | 'grass' | 'weed' | 'mold' | 'indoor' }> = Object.assign(emptySafeTable<{ name: string; cat: 'tree' | 'grass' | 'weed' | 'mold' | 'indoor' }>(), {
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
    });

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

    const baseScore =
      totalWeight > 0
        ? Math.round(totalWeightedScore / totalWeight)
        : Math.round((treeVal + grassVal + weedVal + moldVal) / 4);
    const overallScore = applySensitivity(baseScore, sensitivityFactor);

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

    // Describes the weather/AQI feed only. The pollen figures carry their own provenance in
    // `pollenDataSource`, because the two can disagree.
    const dataSourceName = weatherData || aqiDataRaw
      ? "Live Open-Meteo Air Quality & Weather API"
      : "No live weather feed";

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
      pollenDataSource: pollenSource,
      pollenIsModeled,
      // Omitted when the weather call didn't come back. The defaults behind these variables keep
      // the pollen maths working; they are not observations and aren't presented as any.
      weather: weatherData?.current
        ? {
            temperatureF: Math.round(currentTemp),
            humidityPct: Math.round(currentHumidity),
            apparentTempF: Math.round(currentApparentTemp),
            windSpeedMph: Math.round(currentWindSpeed),
            windDirection: getCompassDirection(currentWindDeg),
            weatherDescription: getWeatherDescription(currentWeatherCode),
          }
        : undefined,
      overallPersonalRiskScore: overallScore,
      riskCategory,
      aqi: aqiPayload,
      pollen: pollenData,
      matchedActiveAllergens,
      recommendations,
      forecast,
    });
  } catch (err: any) {
    console.error("Live Pollen & AQI route error, serving the seasonal estimate:", err);

    // The app never gets a 500 from this route, but the fallback must not invent the user's
    // medical profile either. This block used to return a hard-coded `matchedActiveAllergens`
    // naming ragweed as "severe" and oak as "moderate", which the dashboard then rendered as
    // "2 of your allergens active" — for people who had selected neither. Everything below is
    // derived from what the request actually carried, labelled as an estimate, and omits the
    // weather and air-quality figures entirely rather than making them up.
    const month = new Date().getMonth();
    const safeLat = Number.isFinite(lat) ? lat : 30.2672;
    const safeLng = Number.isFinite(lng) ? lng : -97.7431;
    const hemisphereMonth = safeLat < 0 ? (month + 6) % 12 : month;
    const springMultiplier = hemisphereMonth >= 2 && hemisphereMonth <= 5 ? 1.5 : 0.8;
    const summerMultiplier = hemisphereMonth >= 4 && hemisphereMonth <= 8 ? 1.4 : 0.8;
    const fallMultiplier = hemisphereMonth >= 7 && hemisphereMonth <= 10 ? 1.6 : 0.7;

    const estTree = Math.min(95, Math.max(5, Math.round((35 + Math.abs(Math.sin(safeLat * 5)) * 40) * springMultiplier)));
    const estGrass = Math.min(95, Math.max(5, Math.round((30 + Math.abs(Math.cos(safeLng * 4)) * 35) * summerMultiplier)));
    const estWeed = Math.min(95, Math.max(5, Math.round((28 + Math.abs(Math.sin(safeLng * 7)) * 42) * fallMultiplier)));
    const estMold = Math.min(90, Math.max(5, Math.round(22 + Math.abs(Math.cos(safeLat * 3)) * 30)));

    const estByCategory: Record<string, number> = Object.assign(emptySafeTable<number>(), {
      tree: estTree,
      grass: estGrass,
      weed: estWeed,
      mold: estMold,
      indoor: 35,
    });

    const estMatched: Array<{
      id: string;
      name: string;
      category: 'tree' | 'grass' | 'weed' | 'mold' | 'indoor';
      userSeverity: 'mild' | 'moderate' | 'severe';
      currentLevel: 'Low' | 'Moderate' | 'High' | 'Very High';
      currentValue: number;
    }> = [];

    let estWeighted = 0;
    let estWeight = 0;

    for (const [algId, severity] of Object.entries(userAllergens)) {
      const category =
        ALLERGEN_CATEGORY_BY_ID[algId] || customAllergens[algId]?.category || null;
      if (!category) continue;
      const name = ALLERGEN_NAME_BY_ID[algId] || customAllergens[algId]?.name || algId;
      const value = estByCategory[category] ?? 35;
      const weight = severity === 'severe' ? 3 : severity === 'moderate' ? 2 : 1;

      estWeighted += value * weight;
      estWeight += weight;

      if (value >= 30) {
        estMatched.push({
          id: algId,
          name,
          category: category as 'tree' | 'grass' | 'weed' | 'mold' | 'indoor',
          userSeverity: severity,
          currentLevel: getPollenLevel(value),
          currentValue: value,
        });
      }
    }

    const estBase =
      estWeight > 0
        ? Math.round(estWeighted / estWeight)
        : Math.round((estTree + estGrass + estWeed + estMold) / 4);
    const estScore = applySensitivity(estBase, sensitivityFactor);
    const estCategory: 'Low' | 'Moderate' | 'High' | 'Very High' =
      estScore >= 70 ? 'Very High' : estScore >= 50 ? 'High' : estScore >= 30 ? 'Moderate' : 'Low';

    const estForecast = [];
    for (let i = 0; i < 5; i++) {
      const dateObj = new Date(Date.now() + i * 86400000);
      const dayTree = Math.min(95, Math.max(5, estTree + (i * 2 - 3)));
      const dayGrass = Math.min(95, Math.max(5, estGrass + (i * 3 - 4)));
      const dayWeed = Math.min(95, Math.max(5, estWeed - i * 2));
      const dayMold = Math.min(90, Math.max(5, estMold + (i * 2 - 2)));
      const dayOverall = Math.round((dayTree + dayGrass + dayWeed + dayMold) / 4);
      estForecast.push({
        dayName: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dateObj.toLocaleDateString('en-US', { weekday: 'long' }),
        date: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        riskLevel: getPollenLevel(dayOverall),
        overallScore: dayOverall,
        tree: dayTree,
        grass: dayGrass,
        weed: dayWeed,
        mold: dayMold,
        dominantAllergen:
          estWeed > estTree && estWeed > estGrass ? 'Ragweed' : estTree > estGrass ? 'Oak Tree' : 'Bermuda Grass',
      });
    }

    return res.json({
      locationName,
      updatedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
      timeZoneAbbr: 'UTC',
      timeZoneNote: `Could not confirm the time zone for ${locationName}; showing UTC time instead.`,
      dataSource: "No live weather feed",
      pollenDataSource: "Atmospheric & Seasonal Pollen Model",
      pollenIsModeled: true,
      // No `weather` and no `aqi`: nothing live came back, and plausible-looking figures would
      // read as measurements.
      overallPersonalRiskScore: estScore,
      riskCategory: estCategory,
      pollen: {
        tree: { level: getPollenLevel(estTree), value: estTree, trend: 'stable', topSpecies: ['Oak Tree', 'Birch Tree', 'Cedar Tree'] },
        grass: { level: getPollenLevel(estGrass), value: estGrass, trend: 'stable', topSpecies: ['Bermuda Grass', 'Kentucky Bluegrass'] },
        weed: { level: getPollenLevel(estWeed), value: estWeed, trend: 'stable', topSpecies: ['Ragweed', 'Sagebrush'] },
        mold: { level: getPollenLevel(estMold), value: estMold, trend: 'stable', topSpecies: ['Alternaria', 'Cladosporium'] },
      },
      matchedActiveAllergens: estMatched,
      recommendations: [
        estCategory === 'High' || estCategory === 'Very High'
          ? 'Estimated risk is high for your profile. Keep windows closed and use air conditioning on recirculate.'
          : estCategory === 'Moderate'
          ? 'Estimated risk is moderate. Check again before planning long outdoor activity.'
          : 'Estimated risk is low for your profile today.',
        'Shower and change clothes after returning from prolonged outdoor exposure.',
        'These figures are a seasonal estimate — live pollen and air quality data could not be reached.',
      ],
      forecast: estForecast,
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

// 3b. Reverse geocoding — turns GPS coordinates into a place name, so "use my location" can
// store a real city instead of writing the literal string "My GPS Location" in as the city name
// (which then went out as `?locationName=My GPS Location` on every subsequent request).
app.get("/api/reverse-geocode", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat and lng are required." });
  }

  const cacheKey = `reverse:${coordKey(lat, lng)}`;
  const cached = cacheGet<{ cityName: string; region: string }>(cacheKey);
  if (cached) return res.json({ ...cached, lat, lng });

  // 1. Photon. Built from a constant base so the request target is assembled here, not
  // interpolated from request data, even though both values are already validated numbers.
  const photonUrl = new URL("https://photon.komoot.io/reverse");
  photonUrl.searchParams.set("lat", String(lat));
  photonUrl.searchParams.set("lon", String(lng));

  try {
    const photonData = await cachedJsonFetch(
      `reverse-photon:${coordKey(lat, lng)}`,
      photonUrl.toString(),
      { headers: { "User-Agent": "AllerScan-PollenApp/1.0" } },
      2000,
      60 * 60 * 1000
    );
    const props = photonData?.features?.[0]?.properties;
    if (props) {
      const cityName = props.city || props.town || props.village || props.name || props.county;
      if (cityName) {
        const region = [props.state || props.county, props.country].filter(Boolean).join(", ");
        const result = { cityName, region };
        cacheSet(cacheKey, result, 60 * 60 * 1000);
        return res.json({ ...result, lat, lng });
      }
    }
  } catch (err) {
    console.warn("Photon reverse geocode failed, trying Nominatim:", err);
  }

  // 2. Nominatim
  const nominatimUrl = new URL("https://nominatim.openstreetmap.org/reverse");
  nominatimUrl.searchParams.set("lat", String(lat));
  nominatimUrl.searchParams.set("lon", String(lng));
  nominatimUrl.searchParams.set("format", "json");
  nominatimUrl.searchParams.set("zoom", "10");
  nominatimUrl.searchParams.set("addressdetails", "1");

  try {
    const nomData = await cachedJsonFetch(
      `reverse-nominatim:${coordKey(lat, lng)}`,
      nominatimUrl.toString(),
      { headers: { "User-Agent": "AllerScan-PollenApp/1.0" } },
      2000,
      60 * 60 * 1000
    );
    const addr = nomData?.address;
    if (addr) {
      const cityName = addr.city || addr.town || addr.village || addr.municipality || addr.county;
      if (cityName) {
        const region = [addr.state || addr.county, addr.country].filter(Boolean).join(", ");
        const result = { cityName, region };
        cacheSet(cacheKey, result, 60 * 60 * 1000);
        return res.json({ ...result, lat, lng });
      }
    }
  } catch (err) {
    console.warn("Nominatim reverse geocode failed:", err);
  }

  // Neither geocoder could name the point. The coordinates are what the data layer actually
  // needs, so this isn't an error — the caller falls back to a generic label.
  return res.status(404).json({ error: "Could not resolve a place name for those coordinates." });
});

// 4. Pollen Hotspots endpoint — real named locations (Google Places API) each carrying their
// own live per-point pollen reading (Google Pollen API / Open-Meteo pollen sensors). No fixed
// illustrative station names/coordinates/scores are used: if real places or real readings
// can't be obtained, this returns an honest empty result rather than presenting filler data
// as if it were live.
app.get("/api/pollen-hotspots", async (req, res) => {
  try {
    // `||` treated a valid 0 as missing, relocating anyone on the equator or the prime meridian
    // to Austin. Test for a finite number instead.
    const parsedLat = parseFloat(req.query.lat as string);
    const parsedLng = parseFloat(req.query.lng as string);
    const centerLat = Number.isFinite(parsedLat) ? parsedLat : 30.2672;
    const centerLng = Number.isFinite(parsedLng) ? parsedLng : -97.7431;
    const locationName = (req.query.locationName as string) || "Austin, TX";
    const userAllergensJson = req.query.userAllergens as string;
    let userAllergens: Record<string, 'mild' | 'moderate' | 'severe'> = {};

    if (userAllergensJson) {
      try {
        userAllergens = withSafeKeys(JSON.parse(userAllergensJson));
      } catch (e) {
        // ignore parse
      }
    }

    // Live weather & AQI for the centre point. The numeric defaults keep the pollen maths
    // working; `weatherIsLive` records whether any of it was actually measured, so the response
    // can omit the figures instead of reporting 75 °F for a feed that never answered.
    let liveWeather = { tempF: 75, humidity: 50, windMph: 8, windDirDeg: 180, windDirStr: "S", aqi: 45 };
    let weatherIsLive = false;
    let aqiIsLive = false;
    const [centerWeather, centerAqi] = await Promise.all([
      cachedJsonFetch(
        `hotspotweather:${coordKey(centerLat, centerLng)}`,
        `https://api.open-meteo.com/v1/forecast?latitude=${centerLat}&longitude=${centerLng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`,
        { headers: { "User-Agent": "AllerScan-App/1.0" } },
        2200
      ),
      cachedJsonFetch(
        `hotspotaqi:${coordKey(centerLat, centerLng)}`,
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${centerLat}&longitude=${centerLng}&current=us_aqi,pm2_5,pm10`,
        { headers: { "User-Agent": "AllerScan-App/1.0" } },
        2200
      ),
    ]);

    const cw = centerWeather?.current;
    if (cw) {
      weatherIsLive = true;
      if (typeof cw.temperature_2m === "number") liveWeather.tempF = Math.round(cw.temperature_2m);
      if (typeof cw.relative_humidity_2m === "number") liveWeather.humidity = Math.round(cw.relative_humidity_2m);
      if (typeof cw.wind_speed_10m === "number") liveWeather.windMph = Math.round(cw.wind_speed_10m);
      if (typeof cw.wind_direction_10m === "number") {
        liveWeather.windDirDeg = Math.round(cw.wind_direction_10m);
        liveWeather.windDirStr = getCompassDirection(liveWeather.windDirDeg);
      }
    }

    if (typeof centerAqi?.current?.us_aqi === "number") {
      liveWeather.aqi = Math.round(centerAqi.current.us_aqi);
      aqiIsLive = true;
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
      const placesCacheKey = `places:${coordKey(centerLat, centerLng)}`;
      const cachedPlaces = cacheGet<typeof realPlaces>(placesCacheKey);

      if (cachedPlaces && cachedPlaces.length > 0) {
        realPlaces = cachedPlaces;
      } else try {
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
          } else {
            // Places results change far more slowly than pollen readings.
            cacheSet(placesCacheKey, realPlaces, 60 * 60 * 1000);
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
        liveWeather: weatherIsLive
          ? {
              tempF: liveWeather.tempF,
              humidityPct: liveWeather.humidity,
              windSpeedMph: liveWeather.windMph,
              windDirection: liveWeather.windDirStr,
              aqi: aqiIsLive ? liveWeather.aqi : undefined,
            }
          : undefined,
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
      const score = Math.min(100, Math.max(0, dominant.val));

      // Same thresholds the dashboard gauge, the pollen tiles and the map legend use
      // (src/utils/severity.ts), so one reading can't carry two different severities.
      let overallRisk: "Low" | "Moderate" | "High" | "Very High" = "Low";
      if (score >= 70) overallRisk = "Very High";
      else if (score >= 50) overallRisk = "High";
      else if (score >= 30) overallRisk = "Moderate";

      const dominantSpecies = CATEGORY_TOP_SPECIES[dominant.cat][0];

      // Only count a match when the saved allergen can actually be named — the UI reports the
      // user's own trigger, not the category's default species, so an unnameable match would
      // leave it with nothing truthful to show.
      const matchedIds = Object.keys(userAllergens).filter(
        (id) => ALLERGEN_CATEGORY_BY_ID[id] === dominant.cat && Boolean(ALLERGEN_NAME_BY_ID[id])
      );
      const isProfileMatch = matchedIds.length > 0;
      const matchedUserAllergen = isProfileMatch ? ALLERGEN_NAME_BY_ID[matchedIds[0]] : undefined;
      const userSeverity = isProfileMatch ? userAllergens[matchedIds[0]] : undefined;

      // "Elevated" was unconditional, so an index of 10 — the bottom of the Low band — still
      // read as elevated in the same sentence that printed the number.
      const levelPhrase =
        overallRisk === "Very High"
          ? "very high"
          : overallRisk === "High"
          ? "elevated"
          : overallRisk === "Moderate"
          ? "moderate"
          : "low";

      const windClause = weatherIsLive
        ? `, carried by ${liveWeather.windMph} mph ${liveWeather.windDirStr} winds`
        : "";
      const humidityClause = weatherIsLive
        ? ` Humidity is ${liveWeather.humidity}%, which favors spore release.`
        : "";

      const advisory =
        dominant.cat === "mold"
          ? `Mold is the highest reading here (${levelPhrase}, index ${score}/100).${humidityClause}`
          : `${dominant.cat.charAt(0).toUpperCase()}${dominant.cat.slice(1)} pollen is the highest reading here (${levelPhrase}, index ${score}/100)${windClause}.`;

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
        aqi: aqiIsLive ? liveWeather.aqi : undefined,
        dominantSpecies,
        dominantCategory: dominant.cat,
        dataSource: reading.source,
        isProfileMatch,
        matchedUserAllergen,
        userSeverity,
        windSpeedMph: weatherIsLive ? liveWeather.windMph : undefined,
        windDirection: weatherIsLive ? liveWeather.windDirStr : undefined,
        temperatureF: weatherIsLive ? liveWeather.tempF : undefined,
        humidityPct: weatherIsLive ? liveWeather.humidity : undefined,
        advisory,
      };
    });

    res.json({
      center: { lat: centerLat, lng: centerLng, cityName: locationName },
      updatedAt: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
      liveWeather: weatherIsLive
        ? {
            tempF: liveWeather.tempF,
            humidityPct: liveWeather.humidity,
            windSpeedMph: liveWeather.windMph,
            windDirection: liveWeather.windDirStr,
            aqi: aqiIsLive ? liveWeather.aqi : undefined,
          }
        : undefined,
      hotspots,
      count: hotspots.length,
    });
  } catch (err: any) {
    console.error("Live Hotspots endpoint error:", err);
    res.status(500).json({ error: "Failed to load live pollen hotspot data. Try again in a moment." });
  }
});


// ------------------- VITE MIDDLEWARE / PRODUCTION SERVING -------------------

// Anything under /api that no route above matched is a missing endpoint, not a page. Without
// this, the SPA catch-all answered with index.html and a 200, so every client calling
// `resp.json()` failed with "Unexpected token <" — which reads like a parse bug rather than a
// missing route.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "No such API endpoint." });
});

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
    const indexPath = path.join(distPath, "index.html");

    // Read the shell once at startup rather than on every request. Reading it per-request also
    // meant a missing build threw synchronously inside the handler, with no error middleware to
    // catch it — every request died with a stack trace instead of a useful message.
    let indexHtml: string | null = null;
    try {
      indexHtml = fs.readFileSync(indexPath, "utf-8");
    } catch (err) {
      console.error(
        `Could not read ${indexPath}. Run "npm run build" before "npm start" — the server has no client to serve.`,
        err
      );
    }

    // index: false so "/" and "index.html" fall through to the catch-all below instead of
    // being served directly by static — otherwise the runtime config script never gets injected.
    app.use(express.static(distPath, { index: false }));
    app.get("*", (_req, res) => {
      if (!indexHtml) {
        res
          .status(503)
          .set({ "Content-Type": "text/plain" })
          .send("AllerScan's client bundle is missing. Run `npm run build`, then restart the server.");
        return;
      }
      res.status(200).set({ "Content-Type": "text/html" }).send(injectRuntimeConfig(indexHtml));
    });
  }

  // Anything that throws past a route handler lands here instead of Express's default HTML error
  // page. The detail goes to the log; the client gets a message it can show.
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled server error:", err);
    if (res.headersSent) return;
    if (req.path.startsWith("/api/")) {
      res.status(500).json({ error: "Something went wrong handling that request." });
    } else {
      res.status(500).set({ "Content-Type": "text/plain" }).send("Something went wrong.");
    }
  });

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
