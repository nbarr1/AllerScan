// The pollen numbers AllerScan shows, and the one place each of them is computed.
//
// The seasonal estimate used to be copied into four places (the live route's no-coverage branch,
// its error branch, the hotspot helper and the offline fallback), and the grains-to-index
// conversion into two that had already drifted apart — the dashboard multiplied by a wind *and*
// a temperature factor, the map only by wind, so one park could read differently on each screen.
// Everything that turns a source into a 0-100 index now reads from here.
//
// Kept dependency-free because server.ts imports it too.

export type PollenCategory = 'tree' | 'grass' | 'weed';
export type ReadingCategory = PollenCategory | 'mold';

/**
 * A 0-100 index per category. `null` means no source reported that category for this point —
 * which is not the same as a reading of zero, and must not be displayed or scored as one.
 */
export type CategoryValues = Record<ReadingCategory, number | null>;

export const POLLEN_CATEGORIES: readonly PollenCategory[] = ['tree', 'grass', 'weed'];
export const READING_CATEGORIES: readonly ReadingCategory[] = ['tree', 'grass', 'weed', 'mold'];

/**
 * Index points per grain/m³ for Open-Meteo's pollen concentrations. The measured concentration
 * already reflects the weather that produced it, so it isn't scaled by wind or temperature again.
 */
const GRAINS_TO_INDEX: Record<PollenCategory, number> = {
  tree: 2.5,
  grass: 3.2,
  weed: 2.8,
};

export function grainsToIndex(category: PollenCategory, grains: number | null): number | null {
  if (grains === null || !Number.isFinite(grains)) return null;
  return clamp(Math.round(grains * GRAINS_TO_INDEX[category]), 0, 100);
}

/** Google's Universal Pollen Index runs 0-5. */
export function upiToIndex(upi: number | null | undefined): number | null {
  if (typeof upi !== 'number' || !Number.isFinite(upi)) return null;
  return clamp(Math.round(upi * 20), 0, 100);
}

/**
 * No source reports outdoor mold directly, so it's always an estimate. With live humidity and
 * temperature it follows the conditions that drive spore release; without them it falls back to
 * the seasonal model's figure.
 */
export function estimateMoldFromWeather(humidityPct: number, temperatureF: number): number {
  const humidityFactor = humidityPct > 60 ? (humidityPct - 50) * 0.8 : 10;
  return clamp(Math.round(15 + humidityFactor + (temperatureF > 70 ? 12 : 0)), 5, 90);
}

export const MOLD_FROM_WEATHER_NOTE = 'Estimated from live humidity and temperature';
export const MOLD_FROM_MODEL_NOTE = 'Seasonal estimate';

/**
 * The seasonal/geographic estimate used when no live source covers a point. It is a model, not a
 * measurement, and every caller labels it as one (`pollenIsModeled`, "Atmospheric & Seasonal
 * Pollen Model").
 */
export function seasonalEstimate(
  lat: number,
  lng: number,
  now: Date = new Date()
): Record<ReadingCategory, number> {
  // Seasons invert below the equator: a southern-hemisphere user in October is heading into
  // spring, not autumn.
  const rawMonth = now.getMonth();
  const month = lat < 0 ? (rawMonth + 6) % 12 : rawMonth;

  const springMultiplier = month >= 2 && month <= 5 ? 1.5 : 0.8;
  const summerMultiplier = month >= 4 && month <= 8 ? 1.4 : 0.8;
  const fallMultiplier = month >= 7 && month <= 10 ? 1.6 : 0.7;

  return {
    tree: clamp(Math.round((35 + Math.abs(Math.sin(lat * 5)) * 40) * springMultiplier), 5, 95),
    grass: clamp(Math.round((30 + Math.abs(Math.cos(lng * 4)) * 35) * summerMultiplier), 5, 95),
    weed: clamp(Math.round((28 + Math.abs(Math.sin(lng * 7)) * 42) * fallMultiplier), 5, 95),
    mold: clamp(Math.round(22 + Math.abs(Math.cos(lat * 3)) * 30), 5, 90),
  };
}

export const SEASONAL_MODEL_SOURCE = 'Atmospheric & Seasonal Pollen Model';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
