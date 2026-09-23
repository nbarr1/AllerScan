# AllerScan

Personal allergen scanner and air-quality tracker: AI-powered plant/mold identification, a personalized pollen & AQI risk dashboard, a pollen heatmap with clean-air routing, and immunotherapy (allergy shot) tracking.

> **Not a medical device.** AllerScan is for personal environmental tracking only. It does not provide medical diagnosis or treatment advice — see the in-app disclaimer shown during onboarding.

## Features

| Tab | What it does |
|---|---|
| **Dashboard** | Personalized 0–100 risk score blending live pollen/AQI data against your saved allergen profile, a 5-day pollen forecast where a live source provides one, and tailored recommendations. |
| **Pollen Heatmap** | Google Maps view of real nearby parks/gardens (via the Places API), each carrying its own live pollen reading, with Places API discovery (clean-air venues, pharmacies) and Routes API navigation. Requires a Google Maps Platform key. |
| **Scan** | Camera/upload plant & mold identification via Gemini Vision, cross-referenced against your allergen profile. If Gemini is unavailable, the scan says so instead of guessing; the sample photos then show their reference information, labeled as such. |
| **Allergy Shots** | Immunotherapy schedule tracking: build-up/maintenance phase, interval, arm rotation, reaction logging, allergist contact info. |
| **Insights & Logs** | Daily symptom journal (sneezing, congestion, etc.) with a severity trend chart. |
| **My Allergens** | Select known allergens by severity from a 20-item database (trees/grasses/weeds/molds/indoor), add custom triggers, and set how reactive you are compared with a typical sufferer. |
| **Settings** | In-app alert preferences (pollen, AQI, shot reminders, daily summary), a severity threshold, quiet hours, the PWA/native install guide, and data deletion. |

## Architecture

AllerScan is a single Express server (`server.ts`) that both serves the Vite-built React frontend and hosts the API routes the frontend calls:

- `POST /api/scan` — Gemini Vision plant/mold identification. Returns `503` with a `code` of `vision_unconfigured`, `vision_misconfigured` or `vision_unavailable` when Gemini can't analyze the photo; it never substitutes a canned species. The `imageUrl` form only accepts the preset sample hosts; send anything else as base64. The body limit is 4 MB, matching what Vercel Functions accept; the app downscales photos to 1600 px before sending them.
- `POST /api/pollen-aqi` — personalized risk score, blending live [Open-Meteo](https://open-meteo.com/) weather/air-quality data (and the Google Pollen API, if configured) with your allergen profile and `sensitivityFactor`, sent as a JSON body so the profile stays out of request logs (`GET` with the same fields in the query string still works). Weather and pollen provenance are reported separately (`dataSource` vs `pollenDataSource`/`pollenIsModeled`), because a live weather reading doesn't imply live pollen coverage for the same point. Figures nothing measured — weather, air quality — are omitted rather than estimated, and a pollen category a live source didn't report is `null` rather than a stand-in number.
  - **Scoring:** `scoreBasis` is `profile` when the score is weighted by your saved allergens, and `general` (the plain outdoor average) when none of them can be scored. Indoor allergens and allergens whose category has no reading are listed in `unscoredAllergens` instead of being scored against a made-up figure.
  - **Forecast:** built only from real forecast data: the Google Pollen API's daily forecast, or Open-Meteo's hourly pollen forecast (Europe only), taking each day's peak. Where neither covers a location, `forecast` is empty. Mold is always an estimate (from live humidity and temperature, or the seasonal model) and is labeled with `estimateNote`.
- `GET /api/location-search` — worldwide city geocoding via Photon → Open-Meteo Geocoding → Nominatim → a static city list, in that order (multiple live tiers because the free Photon/Nominatim demo instances can throttle cloud/serverless IPs)
- `GET /api/reverse-geocode` — coordinates to a place name (Photon → Nominatim), so "use my location" stores a real city rather than a placeholder label
- `POST /api/pollen-hotspots` — real nearby locations from the Google Places API, each with its own live per-point pollen reading from the same sources and parsing as the dashboard (Google Pollen API, or Open-Meteo pollen sensors if that key isn't set); returns an honest empty result instead of placeholder data if live sources are unavailable. `GET` also works.

Upstream responses are cached in memory by rounded coordinate for a few minutes, so repeated
refreshes and multiple users in one city share a single round trip to each provider. The app itself
rounds coordinates to two decimal places (about 1 km) before sending them.

Every API route is rate limited per client address (for example, 20 scans and 30 hotspot lookups
per 10 minutes), because several of them spend paid Google quota on each call. The limits live in
memory, so they apply per server instance; on serverless hosts, treat them as a ceiling per warm
instance. Set quotas on the Google Cloud side too — see [Protecting your API quota](#protecting-your-api-quota).

All user data (profile, allergens, shot history, symptom logs, scan history, settings) is stored in the browser's `localStorage` only — there is no backend database or authentication. Scan photos are downscaled before storage and the history is capped, so a few camera scans can't exhaust the ~5 MB budget; if a write fails anyway, the app says so instead of showing data it didn't keep.

A service worker (`public/sw.js`) caches the app shell and hashed build assets so AllerScan opens
offline with your saved data. API responses are never cached — a stale risk score is worse than no
risk score — and navigations are network-first so the runtime-injected Maps key stays current.

**Tech stack:** React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Express 5 · `@google/genai` (Gemini) · `@vis.gl/react-google-maps` · Recharts · `express-rate-limit` · Vitest · `tsx` (dev) / `esbuild` (server bundling for production)

## Getting Started

### Prerequisites

- Node.js 20+
- Optional API keys (the app runs and degrades gracefully without any of them — see [Environment Variables](#environment-variables))

### Install & run

```bash
npm install       # or: bun install (bun.lock is committed)
npm run dev        # starts the Express server + Vite dev middleware on http://localhost:3000
```

Open `http://localhost:3000` in a browser. On first load you'll go through onboarding to build your allergen profile.

### Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the dev server (Express + Vite middleware, HMR enabled) |
| `npm run build` | Build the client (`vite build`) and bundle the server (`esbuild` → `dist/server.cjs`) for production |
| `npm start` | Run the production server bundle (`dist/server.cjs`) |
| `npm run clean` | Remove build output (`dist/`, `server.cjs`) |
| `npm run lint` | Type-check the whole project (`tsc --noEmit`) |
| `npm test` | Run the unit tests (Vitest, `tests/`) |
| `npm run test:smoke` | Start the production bundle and check that it serves pages and API routes (run after `npm run build`) |

## Environment Variables

Copy `.env.example` to `.env` and fill in what you need; the server loads it at startup, and real environment variables take precedence over it. All are optional — omitted keys fall back to modeled/estimated data, clearly labeled as such in the UI.

| Variable | Required for | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Real AI plant/mold scanning | Without it, `/api/scan` returns a labeled example result instead of analyzing your photo |
| `GOOGLE_MAPS_PLATFORM_KEY` | The Pollen Heatmap tab | Without it, that tab shows setup instructions instead of the map. Unlike the other keys, this one is a browser-facing Maps JS API key — see note below |
| `GOOGLE_MAPS_MAP_ID` | A production Map ID for the Pollen Heatmap tab | Advanced Markers need a Map ID. Without one, the map uses Google's `DEMO_MAP_ID` placeholder. Injected at request time, like the Maps key |
| `GOOGLE_PLACES_SERVER_KEY` | Real hotspot locations on the Pollen Heatmap tab | Server-to-server Places API (New) call from `/api/pollen-hotspots`. Without it, falls back to `GOOGLE_MAPS_PLATFORM_KEY` — see the referrer-restriction warning below, this is a common cause of 403s |
| `GOOGLE_POLLEN_API_KEY` | Species-level Google Pollen forecasts | Without it, `/api/pollen-aqi` and `/api/pollen-hotspots` derive pollen index values from live Open-Meteo pollen/weather sensors instead |
| `APP_URL` | Self-referential links when deployed | Not required for local development |
| `TRUST_PROXY` | Correct per-client rate limits behind a proxy | Number of proxy hops in front of the server. Unset locally (trusts none); defaults to 1 on Vercel; the Dockerfile sets 1 for Cloud Run. Set `0` if clients connect directly, or they can spoof their address |

This project originated in Google AI Studio, which can auto-inject `GEMINI_API_KEY` and `APP_URL` at runtime from its Secrets panel — see the comments in `.env.example`.

`GEMINI_API_KEY`, `GOOGLE_POLLEN_API_KEY`, and `GOOGLE_PLACES_SERVER_KEY` are read only in `server.ts` and never sent to the client. `GOOGLE_MAPS_PLATFORM_KEY` is different: the Maps JS API it powers runs in the browser, so that key is necessarily visible client-side — there's no way to keep a Maps JS key secret. The server injects it into the HTML at request time (`injectRuntimeConfig` in `server.ts`) rather than baking it into the JS bundle at build time, so it can be rotated via env var / redeploy without a client rebuild. The actual protection for this key is on the Google Cloud side: restrict it (HTTP referrer for the web origin) and set a quota, so a copied key is low-value.

**Don't reuse `GOOGLE_MAPS_PLATFORM_KEY` for `/api/pollen-hotspots`'s Places lookup.** That key is meant to be HTTP-referrer restricted (per the paragraph above), but HTTP referrer restrictions only validate a browser's `Referer` header — Google rejects server-to-server requests against a referrer-restricted key with a 403, since there's no referrer to check. Set `GOOGLE_PLACES_SERVER_KEY` to a **separate** key restricted by IP address (or left API-restricted only) instead, with "Places API (New)" enabled and billing active on its project. `/api/pollen-hotspots` will fall back to `GOOGLE_MAPS_PLATFORM_KEY` if `GOOGLE_PLACES_SERVER_KEY` isn't set, purely so local dev with an unrestricted key still works — in any deployment where the Maps key is properly referrer-restricted, expect that fallback to 403.

### Protecting your API quota

The rate limits in `server.ts` slow down abuse, but they're per instance and keyed on client
address, so they aren't a hard cap. In the Google Cloud console, set a daily quota on each API
these keys can call (Gemini, Places API (New), Pollen API, Maps JavaScript API, Routes API) and a
budget alert on the project, so a leaked or hammered key has a bounded cost.

## Testing on a device

Because the frontend calls the API on the same origin it's served from, the simplest way to test on a phone is to make that origin reachable from the device — no native build required:

1. **Same Wi-Fi (fastest, no camera/geolocation):** `npm run dev`, then visit `http://<your-machine's-LAN-IP>:3000` from your phone's browser.
2. **HTTPS tunnel (full feature testing):** `npm run dev`, then tunnel it (e.g. `ngrok http 3000`) — camera and geolocation require a secure (HTTPS) context, which a plain LAN IP doesn't satisfy.
3. **A real deployment:** `npm run build && npm start` behind HTTPS. Since `manifest.json` and iOS meta tags are already in `index.html`, testers can "Add to Home Screen" for an app-like icon/splash without any native build.

A native Android/iOS build via [Capacitor](https://capacitorjs.com/) is also possible — `@capacitor/core`, `/cli`, `/ios`, and `/android` are installed, and `capacitor.config.json` is present as a starting point. See `src/components/InstallAppModal.tsx` for the intended setup flow. Before running a native build, set `server.url` in `capacitor.config.json` to a reachable HTTPS instance of this same Express server (it's currently unset, which means `npx cap add ios|android` would bundle `dist/` locally instead). This matters beyond convenience: a locally-bundled WebView loads from a non-web origin (`capacitor://localhost` / `https://localhost`), which no HTTP-referrer restriction on `GOOGLE_MAPS_PLATFORM_KEY` can match — pointing at the real server origin is what makes that restriction meaningful. `GEMINI_API_KEY` and `GOOGLE_POLLEN_API_KEY` stay server-side either way.

## Project structure

```
server.ts                  Express server: API routes + static/Vite serving
server/
  imageUrl.ts              Allowlist for the scan route's sample-image URLs
  pollenSources.ts         Parsers for Google Pollen API and Open-Meteo responses (current + forecast)
  profileInput.ts          Validation for the allergen profile and location the pollen routes receive
src/
  App.tsx                  Top-level state, routing between tabs, data fetching
  components/              One component per tab, plus shared modals (onboarding, notifications, install guide)
  data/
    allergensDatabase.ts   Master list of 20 known allergens (trees/grasses/weeds/molds/indoor)
    defaultCities.ts       Shared fallback city list (location search)
    sampleScans.ts         Preset sample images for the Scan tab's "Sample Test" mode
  utils/
    storage.ts             localStorage read/write + default (empty) profile/schedule/settings
    pollenModel.ts         Index conversions, the mold estimate and the seasonal model (shared with the server)
    riskScore.ts           Personal risk scoring against the saved allergens (shared with the server)
    envReport.ts           Builds the dashboard payload, forecast and recommendations (shared with the server)
    fallbackData.ts        Client-side environmental data estimate, used if the API is unreachable
  types.ts                 Shared TypeScript types
tests/                     Vitest unit tests
scripts/
  smoke-test.mjs           Boots the production bundle and checks it serves (CI runs it)
  check-secrets.mjs        Pre-commit guard against committing keys or .env files
```

## Known limitations

- No backend persistence or user accounts — all data lives in the browser's `localStorage` and is lost if it's cleared. It isn't encrypted: saved coordinates are only obfuscated (XOR with a key that ships in the app), and everything else is stored as-is.
- Pollen hotspots report which *category* (tree/grass/weed/mold) reads highest at each point, not a species: live sources report a category index, not per-point species. When a hotspot matches your profile, the UI names the allergen you actually saved.
- Custom allergen triggers are scored using their category's regional pollen index (e.g. a custom tree trigger uses the local tree pollen level), since there's no species-specific data for arbitrary user-entered names.
- Indoor allergens (dust mites, pet dander, custom indoor triggers) aren't part of the risk score. Outdoor pollen data says nothing about them, so the dashboard lists them as not scored.
- A pollen forecast needs a live source for the location: the Google Pollen API (with `GOOGLE_POLLEN_API_KEY`) or Open-Meteo, whose pollen data covers Europe only. Elsewhere, the dashboard shows no forecast rather than an extrapolated one.
- Alerts are in-app only: they appear in the notification bell when the app refreshes its data. There is no push delivery, so nothing reaches you while the app is closed. Quiet hours and the severity threshold apply to these in-app alerts.
- Route comparison ranks the alternatives Google returns by how close each passes to known hotspots. When only one route exists, or the alternatives pass the same hotspots, the UI says so rather than claiming a low-pollen route.
