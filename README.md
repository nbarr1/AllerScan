# AllerScan

Personal allergen scanner and air-quality tracker: AI-powered plant/mold identification, a personalized pollen & AQI risk dashboard, a pollen heatmap with clean-air routing, and immunotherapy (allergy shot) tracking.

> **Not a medical device.** AllerScan is for personal environmental tracking only. It does not provide medical diagnosis or treatment advice — see the in-app disclaimer shown during onboarding.

## Features

| Tab | What it does |
|---|---|
| **Dashboard** | Personalized 0–100 risk score blending live pollen/AQI data against your saved allergen profile, a 5-day forecast, and tailored recommendations. |
| **Pollen Heatmap** | Google Maps view of illustrative pollen "zones" around your location, with Places API discovery (clean-air venues, pharmacies) and Routes API navigation. Requires a Google Maps Platform key. |
| **Scan** | Camera/upload plant & mold identification via Gemini Vision, cross-referenced against your allergen profile. Falls back to a clearly-labeled example result if Gemini is unavailable. |
| **Allergy Shots** | Immunotherapy schedule tracking: build-up/maintenance phase, interval, arm rotation, reaction logging, allergist contact info. |
| **Insights & Logs** | Daily symptom journal (sneezing, congestion, etc.) with a severity trend chart. |
| **My Allergens** | Select known allergens by severity from a 20-item database (trees/grasses/weeds/molds/indoor), or add custom triggers. |
| **Settings** | Notification preferences, quiet hours, PWA/native install guide, data reset. |

## Architecture

AllerScan is a single Express server (`server.ts`) that both serves the Vite-built React frontend and hosts the API routes the frontend calls:

- `POST /api/scan` — Gemini Vision plant/mold identification (falls back to a labeled example result if no `GEMINI_API_KEY` is set or Gemini is at capacity)
- `GET /api/pollen-aqi` — personalized risk score, blending live [Open-Meteo](https://open-meteo.com/) weather/air-quality data (and the Google Pollen API, if configured) with your allergen profile
- `GET /api/location-search` — city geocoding via Photon → Nominatim → a static city list, in that order
- `GET /api/pollen-hotspots` — map zones scaled by live wind/humidity/AQI data over a fixed illustrative layout (not a real sensor network — the UI discloses this)

All user data (profile, allergens, shot history, symptom logs, scan history, settings) is stored in the browser's `localStorage` only — there is no backend database or authentication.

**Tech stack:** React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Express 4 · `@google/genai` (Gemini) · `@vis.gl/react-google-maps` · Recharts · `tsx` (dev) / `esbuild` (server bundling for production)

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

## Environment Variables

Copy `.env.example` to `.env` and fill in what you need. All are optional — omitted keys fall back to modeled/estimated data, clearly labeled as such in the UI.

| Variable | Required for | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Real AI plant/mold scanning | Without it, `/api/scan` returns a labeled example result instead of analyzing your photo |
| `GOOGLE_MAPS_PLATFORM_KEY` | The Pollen Heatmap tab | Without it, that tab shows setup instructions instead of the map. Unlike the other keys, this one is a browser-facing Maps JS API key — see note below |
| `GOOGLE_POLLEN_API_KEY` | Species-level Google Pollen forecasts | Without it, `/api/pollen-aqi` derives pollen index values from live Open-Meteo pollen/weather sensors instead |
| `APP_URL` | Self-referential links when deployed | Not required for local development |

This project originated in Google AI Studio, which can auto-inject `GEMINI_API_KEY` and `APP_URL` at runtime from its Secrets panel — see the comments in `.env.example`.

`GEMINI_API_KEY` and `GOOGLE_POLLEN_API_KEY` are read only in `server.ts` and never sent to the client. `GOOGLE_MAPS_PLATFORM_KEY` is different: the Maps JS API it powers runs in the browser, so that key is necessarily visible client-side — there's no way to keep a Maps JS key secret. The server injects it into the HTML at request time (`injectRuntimeConfig` in `server.ts`) rather than baking it into the JS bundle at build time, so it can be rotated via env var / redeploy without a client rebuild. The actual protection for this key is on the Google Cloud side: restrict it (HTTP referrer for the web origin) and set a quota, so a copied key is low-value.

## Testing on a device

Because the frontend calls the API on the same origin it's served from, the simplest way to test on a phone is to make that origin reachable from the device — no native build required:

1. **Same Wi-Fi (fastest, no camera/geolocation):** `npm run dev`, then visit `http://<your-machine's-LAN-IP>:3000` from your phone's browser.
2. **HTTPS tunnel (full feature testing):** `npm run dev`, then tunnel it (e.g. `ngrok http 3000`) — camera and geolocation require a secure (HTTPS) context, which a plain LAN IP doesn't satisfy.
3. **A real deployment:** `npm run build && npm start` behind HTTPS. Since `manifest.json` and iOS meta tags are already in `index.html`, testers can "Add to Home Screen" for an app-like icon/splash without any native build.

A native Android/iOS build via [Capacitor](https://capacitorjs.com/) is also possible — `@capacitor/core`, `/cli`, `/ios`, and `/android` are installed, and `capacitor.config.json` is present as a starting point. See `src/components/InstallAppModal.tsx` for the intended setup flow. Before running a native build, set `server.url` in `capacitor.config.json` to a reachable HTTPS instance of this same Express server (it's currently unset, which means `npx cap add ios|android` would bundle `dist/` locally instead). This matters beyond convenience: a locally-bundled WebView loads from a non-web origin (`capacitor://localhost` / `https://localhost`), which no HTTP-referrer restriction on `GOOGLE_MAPS_PLATFORM_KEY` can match — pointing at the real server origin is what makes that restriction meaningful. `GEMINI_API_KEY` and `GOOGLE_POLLEN_API_KEY` stay server-side either way.

## Project structure

```
server.ts                  Express server: API routes + static/Vite serving
src/
  App.tsx                  Top-level state, routing between tabs, data fetching
  components/              One component per tab, plus shared modals (onboarding, notifications, install guide)
  data/
    allergensDatabase.ts   Master list of 20 known allergens (trees/grasses/weeds/molds/indoor)
    defaultCities.ts       Shared fallback city list (location search)
    sampleScans.ts         Preset sample images for the Scan tab's "Sample Test" mode
  utils/
    storage.ts             localStorage read/write + default (empty) profile/schedule/settings
    fallbackData.ts        Client-side environmental data estimate, used if the API is unreachable
  types.ts                 Shared TypeScript types
```

## Known limitations

- No backend persistence or user accounts — all data lives in the browser's `localStorage` and is lost if it's cleared.
- Pollen heatmap "zones" and hotspot names are a fixed illustrative layout scaled by live weather data, not a real sensor network (disclosed in-app).
- Custom allergen triggers are scored using their category's regional pollen index (e.g. a custom tree trigger uses the local tree pollen level), since there's no species-specific data for arbitrary user-entered names.
