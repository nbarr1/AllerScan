import express from "express";
import dotenv from "dotenv";
import { rateLimit } from "express-rate-limit";
import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { DEFAULT_CITY_OPTIONS } from "./src/data/defaultCities.js";
import type { AirQualityData, LiveWeatherData } from "./src/types.js";
import { buildEnvironmentalReport } from "./src/utils/envReport.js";
import type { ForecastDayValues } from "./src/utils/envReport.js";
import {
  estimateMoldFromWeather,
  MOLD_FROM_MODEL_NOTE,
  MOLD_FROM_WEATHER_NOTE,
  POLLEN_CATEGORIES,
  SEASONAL_MODEL_SOURCE,
  seasonalEstimate,
} from "./src/utils/pollenModel.js";
import type { PollenCategory } from "./src/utils/pollenModel.js";
import { savedAllergensInCategory } from "./src/utils/riskScore.js";
import type { ScoringProfile } from "./src/utils/riskScore.js";
import { riskLevelForScore } from "./src/utils/severity.js";
import { resolveAllowedImageUrl } from "./server/imageUrl.js";
import {
  OPEN_METEO_POLLEN_FIELDS,
  parseGoogleDay,
  parseGoogleForecast,
  parseOpenMeteoCurrent,
  parseOpenMeteoHourlyForecast,
} from "./server/pollenSources.js";
import { DEFAULT_LOCATION, readPollenRequest } from "./server/profileInput.js";
import type { PollenRequest } from "./server/profileInput.js";

// Loads `.env` for local development. It was a dependency that nothing imported, so the README's
// "copy .env.example to .env" step silently did nothing. Deployed environments set real variables,
// which this never overrides. `quiet` stops dotenv 17 logging a line on every cold start.
dotenv.config({ quiet: true });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");

// `req.ip` is what the rate limiters below key on. Behind a proxy it's the proxy's address — one
// shared bucket for every user — unless Express is told how many proxy hops to trust. Trusting hops
// that aren't there has the opposite problem: a client can pick its own IP with X-Forwarded-For.
// So it's explicit: TRUST_PROXY names the hop count (the Dockerfile sets 1 for Cloud Run), Vercel
// defaults to its one edge hop, and local development trusts nothing.
function readTrustProxy(): number | boolean | string {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) return process.env.VERCEL ? 1 : false;
  if (raw === "false") return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw; // e.g. "loopback" or a list of proxy addresses
}
app.set("trust proxy", readTrustProxy());

// No CSP or X-Frame-Options yet: Google AI Studio previews this app in an iframe, and the Maps JS
// API needs a long, version-dependent source list. These two are safe everywhere.
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  next();
});

// Injects the (public, referrer-restricted) Maps Platform key and Map ID into the served HTML at
// request time, so they can be rotated via env var / redeploy without a client rebuild, and so
// the key is never baked as a literal into the shipped JS bundle.
function injectRuntimeConfig(html: string): string {
  const config = {
    GOOGLE_MAPS_PLATFORM_KEY: process.env.GOOGLE_MAPS_PLATFORM_KEY || "",
    GOOGLE_MAPS_MAP_ID: process.env.GOOGLE_MAPS_MAP_ID || "",
  };
  const assignments = Object.entries(config)
    .map(([name, value]) => `window.${name} = ${JSON.stringify(value).replace(/</g, "\\u003c")};`)
    .join("");
  return html.replace("</head>", `<script>${assignments}</script></head>`);
}

// Rate limits. Several routes spend a paid quota on every call — Gemini for scans, Places plus a
// Pollen lookup per place for hotspots — and the response cache can't help when a caller varies
// the coordinates. Counts are per instance (memory store), so on serverless they're a ceiling per
// warm instance rather than a global one; Google Cloud quotas are the hard backstop. Registered
// before the body parsers so an over-limit client's 4 MB upload is refused unread.
function limiter(windowMinutes: number, limit: number, what: string) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: `Too many ${what} requests from this network. Wait a few minutes and try again.` },
  });
}
app.use("/api/scan", limiter(10, 20, "scan"));
app.use("/api/pollen-hotspots", limiter(10, 30, "hotspot"));
app.use("/api/pollen-aqi", limiter(10, 60, "pollen"));
app.use("/api/reverse-geocode", limiter(10, 30, "location"));
app.use("/api/location-search", limiter(1, 60, "location search"));

// Body parsers. Only the scan endpoint receives large payloads (a photo), so it gets its own parser
// and it must run first: the default parser used to be registered ahead of it, so every photo over
// 100 KB was rejected before the scan route ran. body-parser skips a body that's already parsed.
//
// 4 MB matches what Vercel Functions accept (4.5 MB); the app downscales photos well below it.
const SCAN_BODY_LIMIT = "4mb";
app.use("/api/scan", express.json({ limit: SCAN_BODY_LIMIT }));
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

// 1. Plant / Mold / Environmental Scanner endpoint.
//
// This used to answer with a random species from a list of three, at 87-91% "confidence", whenever
// Gemini was unavailable — and the app saved it to history as a real identification of the user's
// photo. It also echoed a client-supplied `presetHint` back as "verified-botanical-database". Now
// it either analyses the image or says it couldn't, with a 503 the app shows as an error.
app.post("/api/scan", async (req, res) => {
  const { imageBase64, imageUrl } = (req.body ?? {}) as Record<string, unknown>;

  if (typeof imageBase64 !== "string" && typeof imageUrl !== "string") {
    return res.status(400).json({ error: "Missing image payload (imageBase64 or imageUrl required)." });
  }

  // Resolved up front so the guard doesn't depend on whether a Gemini key happens to be set.
  // Everything downstream uses `resolvedImageUrl`, never the caller's `imageUrl`.
  let resolvedImageUrl: string | null = null;
  if (typeof imageUrl === "string") {
    resolvedImageUrl = resolveAllowedImageUrl(imageUrl);
    if (!resolvedImageUrl) {
      return res.status(400).json({
        error: "That image URL isn't allowed. Send the image as base64 instead.",
      });
    }
  }

  let inlineImage: { data: string; mimeType: string } | null = null;
  if (typeof imageBase64 === "string") {
    const header = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(imageBase64.slice(0, 100));
    if (!header) {
      return res.status(400).json({ error: "That doesn't look like an image. Send a JPEG, PNG or HEIC photo." });
    }
    inlineImage = { data: imageBase64.slice(header[0].length), mimeType: header[1] };
  }

  const ai = getGenAI();
  if (!ai) {
    return res.status(503).json({
      error: "AI plant identification isn't set up on this server (GEMINI_API_KEY is missing), so the photo wasn't analyzed.",
      code: "vision_unconfigured",
    });
  }

  try {
    if (!inlineImage && resolvedImageUrl) {
      const imgResp = await fetchWithTimeout(resolvedImageUrl, {}, 4000);
      const contentType = imgResp?.headers.get("content-type") || "";
      if (!imgResp || !imgResp.ok || !contentType.startsWith("image/")) {
        return res.status(502).json({
          error: "Couldn't download that sample photo. Try again, or scan a photo of your own.",
          code: "image_unavailable",
        });
      }
      const arrayBuffer = await imgResp.arrayBuffer();
      inlineImage = { data: Buffer.from(arrayBuffer).toString("base64"), mimeType: contentType };
    }

    if (!inlineImage) {
      return res.status(400).json({ error: "Missing image payload (imageBase64 or imageUrl required)." });
    }

    const prompt = `Analyze this photo for environmental allergens such as trees, grasses, weeds, molds, or indoor triggers.
Identify the primary plant, weed, tree, or mold species visible in the image.
Determine if it is a known allergen producer.
Respond strictly with valid JSON.`;

    // Candidates in preference order. The floating alias goes first so this keeps working
    // as Google's catalogue moves; the pinned id is the fallback. Verify these against the
    // current model list before changing them — an id that doesn't exist costs a failed
    // round trip on every single scan.
    const candidateModels = ["gemini-flash-latest", "gemini-2.5-flash"];
    let configurationError = false;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [{ inlineData: inlineImage }, { text: prompt }],
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
          if (parsed && typeof parsed === "object" && typeof parsed.speciesName === "string") {
            return res.json({ success: true, source: modelName, data: parsed });
          }
          console.warn(`[Gemini API] ${modelName} returned JSON without a species name; trying the next candidate...`);
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
          configurationError = true;
          break;
        } else {
          console.warn(`[Gemini API] Error calling ${modelName}:`, errMsg);
        }
      }
    }

    // A rejected key or a retired model id won't fix itself in a minute, so don't say it will.
    return res.status(503).json(
      configurationError
        ? {
            error: "AI plant identification is misconfigured on this server (Gemini rejected its key or model), so the photo wasn't analyzed.",
            code: "vision_misconfigured",
          }
        : {
            error: "The AI vision service is busy or unavailable right now, so the photo wasn't analyzed. Try again in a minute.",
            code: "vision_unavailable",
          }
    );
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

/**
 * Coordinates for a place name, asking Photon and Open-Meteo at the same time and preferring
 * Photon's answer. Asking them one after the other could spend 4 s here alone, which with the data
 * fetches after it ran past the app's request timeout.
 */
async function geocodeLocation(name: string): Promise<{ lat: number; lng: number } | null> {
  const photon = (async () => {
    const resp = await fetchWithTimeout(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(name)}&limit=1`,
      { headers: { "User-Agent": "AllerScan-PollenApp/1.0" } },
      2000
    );
    if (!resp || !resp.ok) return null;
    const coords = (await resp.json())?.features?.[0]?.geometry?.coordinates;
    return Array.isArray(coords) && Number.isFinite(coords[0]) && Number.isFinite(coords[1])
      ? { lat: Number(coords[1]), lng: Number(coords[0]) }
      : null;
  })().catch(() => null);

  const openMeteo = geocodeWithOpenMeteo(name, 1)
    .then((results) => (results[0] ? { lat: results[0].lat, lng: results[0].lng } : null))
    .catch(() => null);

  const [fromPhoton, fromOpenMeteo] = await Promise.all([photon, openMeteo]);
  return fromPhoton ?? fromOpenMeteo;
}

// Regional default names per pollen category. Live sources report a category index, not a
// per-point species, so the hotspot card presents this as a category-level label and names the
// user's own saved allergen when calling something a match.
const CATEGORY_TOP_SPECIES: Record<PollenCategory, string> = {
  tree: "Oak Tree",
  grass: "Bermuda Grass",
  weed: "Ragweed",
};

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

function getAqiCategory(aqi: number): AirQualityData["category"] {
  if (aqi > 300) return 'Hazardous';
  if (aqi > 200) return 'Very Unhealthy';
  if (aqi > 150) return 'Unhealthy';
  if (aqi > 100) return 'Unhealthy for Sensitive';
  if (aqi > 50) return 'Moderate';
  return 'Good';
}

function scoringProfileOf(input: PollenRequest): ScoringProfile {
  return {
    allergens: input.allergens,
    customAllergens: input.customAllergens,
    sensitivityFactor: input.sensitivityFactor,
  };
}

/** The `current` block as display figures, or undefined unless temperature and humidity both came back. */
function readLiveWeather(current: any): LiveWeatherData | undefined {
  if (typeof current?.temperature_2m !== "number" || typeof current?.relative_humidity_2m !== "number") {
    return undefined;
  }
  const num = (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback);
  return {
    temperatureF: Math.round(current.temperature_2m),
    humidityPct: Math.round(current.relative_humidity_2m),
    apparentTempF: Math.round(num(current.apparent_temperature, current.temperature_2m)),
    windSpeedMph: Math.round(num(current.wind_speed_10m, 0)),
    windDirection: getCompassDirection(num(current.wind_direction_10m, 0)),
    weatherDescription: getWeatherDescription(num(current.weather_code, 0)),
  };
}

// 2. Pollen & Air Quality Data endpoint with LIVE Open-Meteo & Google Pollen API.
//
// POST with a JSON body is what the app sends: the allergen profile and coordinates used to travel
// in the query string, which hosting platforms write to their request logs. GET is still accepted
// so an older cached copy of the app keeps working.
async function handlePollenAqi(req: express.Request, res: express.Response) {
  const input = readPollenRequest(req.method === "POST" ? req.body : req.query);
  const profile = scoringProfileOf(input);
  const { locationName } = input;
  let lat = input.lat;
  let lng = input.lng;

  try {
    if (lat === null || lng === null) {
      const geocoded = await geocodeLocation(locationName);
      lat = geocoded?.lat ?? DEFAULT_LOCATION.lat;
      lng = geocoded?.lng ?? DEFAULT_LOCATION.lng;
    }

    const googlePollenKey = process.env.GOOGLE_POLLEN_API_KEY;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;
    const pollenFields = OPEN_METEO_POLLEN_FIELDS.join(",");
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5,ozone,us_aqi,${pollenFields}&hourly=${pollenFields}&forecast_days=5&timezone=auto`;

    // All three in parallel. Google's lookup used to be awaited before the other two started, which
    // alone could take 5 s — past the point where the app gives up and shows its offline estimate.
    const [googlePollenData, weatherData, aqiData] = await Promise.all([
      googlePollenKey
        ? cachedJsonFetch(
            `gpollen5:${coordKey(lat, lng)}`,
            `https://pollen.googleapis.com/v1/forecast:lookup?location.longitude=${lng}&location.latitude=${lat}&key=${googlePollenKey}&days=5`,
            {},
            2500
          )
        : Promise.resolve(null),
      cachedJsonFetch(`weather:${coordKey(lat, lng)}`, weatherUrl, { headers: { "User-Agent": "AllerScan-App/1.0" } }, 2500),
      cachedJsonFetch(`aqi5:${coordKey(lat, lng)}`, aqiUrl, { headers: { "User-Agent": "AllerScan-App/1.0" } }, 2500),
    ]);

    const weather = readLiveWeather(weatherData?.current);

    // Current air quality. Emitted only when the live feed actually reported one — deriving a
    // plausible AQI from `Math.sin(lat)` produced a number indistinguishable from a measurement.
    const liveAqi = aqiData?.current;
    const usAqi = typeof liveAqi?.us_aqi === 'number' ? liveAqi.us_aqi : null;
    const aqi: AirQualityData | undefined =
      usAqi === null
        ? undefined
        : {
            aqi: Math.round(usAqi),
            category: getAqiCategory(usAqi),
            pm25: Number((typeof liveAqi.pm2_5 === 'number' ? liveAqi.pm2_5 : 0).toFixed(1)),
            pm10: Number((typeof liveAqi.pm10 === 'number' ? liveAqi.pm10 : 0).toFixed(1)),
            ozone: Number((typeof liveAqi.ozone === 'number' ? liveAqi.ozone : 0).toFixed(1)),
          };

    // Pollen, tracking where it came from. The weather call succeeding tells you nothing about
    // whether pollen data exists for this point: Open-Meteo's forecast grid is global, its pollen
    // grid covers Europe only. So provenance is tracked separately (`pollenDataSource` /
    // `pollenIsModeled`), and a category a live source didn't report stays null.
    const fromGoogle = parseGoogleDay(googlePollenData?.dailyInfo?.[0]);
    const fromOpenMeteo = fromGoogle ? null : parseOpenMeteoCurrent(aqiData?.current);
    const estimate = seasonalEstimate(lat, lng);

    let pollenValues: Record<PollenCategory, number | null>;
    let pollenSource: string;
    let topSpecies: Partial<Record<PollenCategory, string[]>> | undefined;
    let forecastDays: ForecastDayValues[] = [];
    let forecastSource: string | undefined;

    if (fromGoogle) {
      pollenValues = fromGoogle.values;
      pollenSource = "Live Google Maps Pollen API";
      topSpecies = fromGoogle.topSpecies;
      forecastDays = parseGoogleForecast(googlePollenData);
      forecastSource = "Google Pollen API forecast";
    } else if (fromOpenMeteo) {
      pollenValues = fromOpenMeteo.values;
      pollenSource = "Live Open-Meteo Pollen Sensors";
      topSpecies = fromOpenMeteo.topSpecies;
      forecastDays = parseOpenMeteoHourlyForecast(aqiData?.hourly);
      forecastSource = "Open-Meteo pollen forecast";
    } else {
      // No live pollen coverage for this point. A seasonal/geographic estimate, labelled as such by
      // `pollenIsModeled`, and with no forecast: extrapolating an estimate isn't a forecast.
      pollenValues = { tree: estimate.tree, grass: estimate.grass, weed: estimate.weed };
      pollenSource = SEASONAL_MODEL_SOURCE;
    }

    // The weather request uses timezone=auto, so Open-Meteo already resolved the IANA time zone
    // for these exact coordinates — "last updated" reflects the selected location's real local
    // time, not the server's. Only fall back to UTC (clearly labeled) when that lookup failed.
    const resolvedIanaTz: string | undefined = weatherData?.timezone;
    const now = new Date();
    const updatedAt = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: resolvedIanaTz || 'UTC',
    });

    return res.json(
      buildEnvironmentalReport({
        locationName,
        updatedAt,
        timeZoneAbbr: resolvedIanaTz ? weatherData?.timezone_abbreviation || resolvedIanaTz : 'UTC',
        timeZoneNote: resolvedIanaTz
          ? undefined
          : `Could not confirm the time zone for ${locationName}; showing UTC time instead.`,
        // Describes the weather/AQI feed only. The pollen figures carry their own provenance.
        dataSource: weatherData || aqiData ? "Live Open-Meteo Air Quality & Weather API" : "No live weather feed",
        pollenSource,
        pollenIsModeled: !fromGoogle && !fromOpenMeteo,
        values: {
          ...pollenValues,
          mold: weather ? estimateMoldFromWeather(weather.humidityPct, weather.temperatureF) : estimate.mold,
        },
        moldNote: weather ? MOLD_FROM_WEATHER_NOTE : MOLD_FROM_MODEL_NOTE,
        topSpecies,
        forecastDays,
        forecastSource,
        weather,
        aqi,
        profile,
      })
    );
  } catch (err: any) {
    console.error("Live Pollen & AQI route error, serving the seasonal estimate:", err);

    // The app never gets a 500 from this route, but the fallback must not invent anything either:
    // the profile is the one the request carried, everything is labelled as an estimate, and the
    // weather, air quality and forecast are omitted rather than made up.
    const safeLat = lat ?? DEFAULT_LOCATION.lat;
    const safeLng = lng ?? DEFAULT_LOCATION.lng;
    return res.json(
      buildEnvironmentalReport({
        locationName,
        updatedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
        timeZoneAbbr: 'UTC',
        timeZoneNote: `Could not confirm the time zone for ${locationName}; showing UTC time instead.`,
        dataSource: "No live weather feed",
        pollenSource: SEASONAL_MODEL_SOURCE,
        pollenIsModeled: true,
        values: seasonalEstimate(safeLat, safeLng),
        moldNote: MOLD_FROM_MODEL_NOTE,
        forecastDays: [],
        profile,
      })
    );
  }
}

app.get("/api/pollen-aqi", handlePollenAqi);
app.post("/api/pollen-aqi", handlePollenAqi);

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

/**
 * One place's pollen reading from the same sources, in the same order and with the same parsing
 * as the dashboard: the Google Pollen API when a key is configured, then Open-Meteo's pollen model,
 * then the seasonal estimate. The hotspot helper used to treat Open-Meteo's real winter zeros as
 * "no data" and scale readings by a different formula, so the map and the dashboard could disagree
 * about the same point.
 */
async function readPollenAt(lat: number, lng: number): Promise<{
  values: Record<PollenCategory, number | null>;
  grains?: Partial<Record<PollenCategory, number>>;
  source: string;
  isModeled: boolean;
}> {
  const googlePollenKey = process.env.GOOGLE_POLLEN_API_KEY;
  if (googlePollenKey) {
    const gData = await cachedJsonFetch(
      `gpollen1:${coordKey(lat, lng)}`,
      `https://pollen.googleapis.com/v1/forecast:lookup?location.longitude=${lng}&location.latitude=${lat}&key=${googlePollenKey}&days=1`,
      {},
      2200
    );
    const fromGoogle = parseGoogleDay(gData?.dailyInfo?.[0]);
    if (fromGoogle) return { values: fromGoogle.values, source: "Live Google Maps Pollen API", isModeled: false };
  }

  const aqData = await cachedJsonFetch(
    `pointpollen:${coordKey(lat, lng)}`,
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=${OPEN_METEO_POLLEN_FIELDS.join(",")}`,
    { headers: { "User-Agent": "AllerScan-App/1.0" } },
    2200
  );
  const fromOpenMeteo = parseOpenMeteoCurrent(aqData?.current);
  if (fromOpenMeteo) {
    return {
      values: fromOpenMeteo.values,
      grains: fromOpenMeteo.grains,
      source: "Live Open-Meteo Pollen Sensors",
      isModeled: false,
    };
  }

  const estimate = seasonalEstimate(lat, lng);
  return {
    values: { tree: estimate.tree, grass: estimate.grass, weed: estimate.weed },
    source: SEASONAL_MODEL_SOURCE,
    isModeled: true,
  };
}

// 4. Pollen Hotspots endpoint — real named locations (Google Places API) each carrying their
// own live per-point pollen reading (Google Pollen API / Open-Meteo pollen sensors). No fixed
// illustrative station names/coordinates/scores are used: if real places or real readings
// can't be obtained, this returns an honest empty result rather than presenting filler data
// as if it were live. POST (JSON body) or GET, for the same reason as /api/pollen-aqi.
async function handlePollenHotspots(req: express.Request, res: express.Response) {
  try {
    const input = readPollenRequest(req.method === "POST" ? req.body : req.query);
    const profile = scoringProfileOf(input);
    const centerLat = input.lat ?? DEFAULT_LOCATION.lat;
    const centerLng = input.lng ?? DEFAULT_LOCATION.lng;
    const locationName = input.locationName;

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
    if (typeof cw?.temperature_2m === "number" && typeof cw?.relative_humidity_2m === "number") {
      weatherIsLive = true;
      liveWeather.tempF = Math.round(cw.temperature_2m);
      liveWeather.humidity = Math.round(cw.relative_humidity_2m);
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

    const liveWeatherPayload = weatherIsLive
      ? {
          tempF: liveWeather.tempF,
          humidityPct: liveWeather.humidity,
          windSpeedMph: liveWeather.windMph,
          windDirection: liveWeather.windDirStr,
          aqi: aqiIsLive ? liveWeather.aqi : undefined,
        }
      : undefined;

    if (realPlaces.length === 0) {
      return res.json({
        center: { lat: centerLat, lng: centerLng, cityName: locationName },
        updatedAt: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
        liveWeather: liveWeatherPayload,
        hotspots: [],
        count: 0,
        dataUnavailable: true,
        message: unavailableReason || "No verified live hotspot data is currently available for this area.",
      });
    }

    // A genuine per-place pollen reading, computed for each real place's own coordinates rather
    // than one shared number applied to every pin.
    const pollenReadings = await Promise.all(realPlaces.map((p) => readPollenAt(p.lat, p.lng)));

    // Mold is an estimate everywhere. With live weather it comes from the centre's humidity and so
    // is the same at every pin, which is why it never decides the "highest here" category.
    const moldAtCenter = weatherIsLive ? estimateMoldFromWeather(liveWeather.humidity, liveWeather.tempF) : null;

    const hotspots = realPlaces.map((place, idx) => {
      const reading = pollenReadings[idx];

      let dominant: PollenCategory = "tree";
      let score = -1;
      for (const category of POLLEN_CATEGORIES) {
        const value = reading.values[category];
        if (value !== null && value > score) {
          dominant = category;
          score = value;
        }
      }
      score = Math.max(0, score);

      // Same thresholds the dashboard gauge, the pollen tiles and the map legend use
      // (src/utils/severity.ts), so one reading can't carry two different severities.
      const overallRisk = riskLevelForScore(score);

      // Names the user's own saved trigger in the dominant category (built-in or custom), most
      // severe first, rather than the category's default species.
      const match = savedAllergensInCategory(dominant, profile)[0];

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
      const estimateClause = reading.isModeled ? " This is a seasonal estimate, not a live reading." : "";

      return {
        id: place.id,
        name: place.name,
        address: place.address,
        type: "park" as const,
        lat: Number(place.lat.toFixed(5)),
        lng: Number(place.lng.toFixed(5)),
        overallRisk,
        overallScore: score,
        pollenCountGrains: reading.grains?.[dominant],
        treePollen: reading.values.tree,
        grassPollen: reading.values.grass,
        weedPollen: reading.values.weed,
        moldCount: moldAtCenter ?? seasonalEstimate(place.lat, place.lng).mold,
        moldNote: moldAtCenter !== null ? MOLD_FROM_WEATHER_NOTE : MOLD_FROM_MODEL_NOTE,
        aqi: aqiIsLive ? liveWeather.aqi : undefined,
        dominantSpecies: CATEGORY_TOP_SPECIES[dominant],
        dominantCategory: dominant,
        dataSource: reading.source,
        isProfileMatch: Boolean(match),
        matchedUserAllergen: match?.name,
        userSeverity: match?.severity,
        windSpeedMph: weatherIsLive ? liveWeather.windMph : undefined,
        windDirection: weatherIsLive ? liveWeather.windDirStr : undefined,
        temperatureF: weatherIsLive ? liveWeather.tempF : undefined,
        humidityPct: weatherIsLive ? liveWeather.humidity : undefined,
        advisory: `${dominant.charAt(0).toUpperCase()}${dominant.slice(1)} pollen is the highest reading here (${levelPhrase}, index ${score}/100)${windClause}.${estimateClause}`,
      };
    });

    res.json({
      center: { lat: centerLat, lng: centerLng, cityName: locationName },
      updatedAt: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
      liveWeather: liveWeatherPayload,
      hotspots,
      count: hotspots.length,
    });
  } catch (err: any) {
    console.error("Live Hotspots endpoint error:", err);
    res.status(500).json({ error: "Failed to load live pollen hotspot data. Try again in a moment." });
  }
}

app.get("/api/pollen-hotspots", handlePollenHotspots);
app.post("/api/pollen-hotspots", handlePollenHotspots);


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

    // Express 5 (path-to-regexp 8) rejects a bare "*" — registering one threw at startup and took
    // the whole production server down. "/{*splat}" is the Express 5 catch-all and includes "/".
    app.get("/{*splat}", (_req, res) => {
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
  // page. The detail goes to the log; the client gets a message it can show. Client errors keep
  // their status — an oversized upload is a 413, not a 500 that reads like a server fault.
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status >= 500) console.error("Unhandled server error:", err);
    if (res.headersSent) return;
    if (req.path.startsWith("/api/")) {
      const message =
        status === 413
          ? "That upload is too large. Try a smaller photo."
          : status === 400
          ? "The request couldn't be read. Check it's valid JSON."
          : status < 500
          ? "The request couldn't be handled."
          : "Something went wrong handling that request.";
      res.status(status).json({ error: message });
    } else {
      res.status(status).set({ "Content-Type": "text/plain" }).send("Something went wrong.");
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

// A failure here used to surface only as an unhandled promise rejection. Say what failed and exit
// non-zero so a process manager or container platform sees the crash for what it is.
startServer().catch((err) => {
  console.error("AllerScan failed to start:", err);
  process.exit(1);
});

export default app;
