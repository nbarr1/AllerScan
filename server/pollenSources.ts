// Parsers for the two live pollen sources. Pure functions over the upstream JSON, so the rules
// about what counts as a reading are testable without a network.
//
// The rule both sources follow: a category the source didn't report is `null`, never a stand-in
// number. The dashboard route used to keep hard-coded 20/25/20 defaults for any type Google left
// out and label them live; the hotspot helper used 15 and turned "no value" into 0. Real zeros —
// Open-Meteo reporting 0 grains/m³ in winter — are readings and are kept.

import type { ForecastDayValues } from "../src/utils/envReport.js";
import { grainsToIndex, POLLEN_CATEGORIES, upiToIndex } from "../src/utils/pollenModel.js";
import type { PollenCategory } from "../src/utils/pollenModel.js";

export interface PollenSnapshot {
  values: Record<PollenCategory, number | null>;
  /** Measured grains/m³ per category, only where a sensor model reported a non-zero figure. */
  grains?: Partial<Record<PollenCategory, number>>;
  /** Species the source itself names, per category. */
  topSpecies?: Partial<Record<PollenCategory, string[]>>;
}

function emptyValues(): Record<PollenCategory, number | null> {
  return { tree: null, grass: null, weed: null };
}

function hasAnyValue(values: Record<PollenCategory, number | null>): boolean {
  return POLLEN_CATEGORIES.some((category) => values[category] !== null);
}

// ------------------------------------------------------------------------------------------------
// Google Pollen API (forecast:lookup)
// ------------------------------------------------------------------------------------------------

function googleCategory(code: unknown): PollenCategory | null {
  if (typeof code !== "string") return null;
  const lower = code.toLowerCase();
  return lower === "tree" || lower === "grass" || lower === "weed" ? lower : null;
}

function googleDayValues(dayInfo: any): Record<PollenCategory, number | null> {
  const values = emptyValues();
  const types: unknown[] = Array.isArray(dayInfo?.pollenTypeInfo) ? dayInfo.pollenTypeInfo : [];
  for (const type of types as any[]) {
    const category = googleCategory(type?.code);
    if (!category) continue;
    const index = upiToIndex(type?.indexInfo?.value);
    if (index !== null) values[category] = index;
  }
  return values;
}

/**
 * Google's plantInfo mixes trees, grasses and weeds in one array. Filing all of it under "tree"
 * once put ragweed in the Tree Pollen card, so it's split by the plant's own type.
 */
function googleTopSpecies(dayInfo: any): Partial<Record<PollenCategory, string[]>> {
  const plants: any[] = Array.isArray(dayInfo?.plantInfo) ? dayInfo.plantInfo : [];
  const result: Partial<Record<PollenCategory, string[]>> = {};
  for (const category of POLLEN_CATEGORIES) {
    const names = plants
      .filter((plant) => googleCategory(plant?.plantDescription?.type) === category)
      .map((plant) => plant?.displayName || plant?.code)
      .filter((name): name is string => typeof name === "string" && name.length > 0)
      .slice(0, 3);
    if (names.length > 0) result[category] = names;
  }
  return result;
}

/** Today's reading from one `dailyInfo` entry, or null when no pollen type carries an index. */
export function parseGoogleDay(dayInfo: unknown): PollenSnapshot | null {
  const values = googleDayValues(dayInfo);
  if (!hasAnyValue(values)) return null;
  return { values, topSpecies: googleTopSpecies(dayInfo) };
}

/** Every dated `dailyInfo` entry, as forecast days. */
export function parseGoogleForecast(data: unknown): ForecastDayValues[] {
  const days: unknown[] = Array.isArray((data as any)?.dailyInfo) ? (data as any).dailyInfo : [];
  const result: ForecastDayValues[] = [];
  for (const day of days as any[]) {
    const { year, month, day: dayOfMonth } = day?.date ?? {};
    if (![year, month, dayOfMonth].every((n) => Number.isInteger(n))) continue;
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
    result.push({ dateKey, ...googleDayValues(day) });
  }
  return result;
}

// ------------------------------------------------------------------------------------------------
// Open-Meteo Air Quality API (pollen fields, grains/m³)
// ------------------------------------------------------------------------------------------------

const OPEN_METEO_SPECIES: Record<PollenCategory, Array<{ field: string; name: string }>> = {
  tree: [
    { field: "birch_pollen", name: "Birch" },
    { field: "alder_pollen", name: "Alder" },
    { field: "olive_pollen", name: "Olive" },
  ],
  grass: [{ field: "grass_pollen", name: "Grasses" }],
  weed: [
    { field: "ragweed_pollen", name: "Ragweed" },
    { field: "mugwort_pollen", name: "Mugwort" },
  ],
};

/** Every pollen field this app reads, for building the request's `current`/`hourly` lists. */
export const OPEN_METEO_POLLEN_FIELDS = POLLEN_CATEGORIES.flatMap((category) =>
  OPEN_METEO_SPECIES[category].map((species) => species.field)
);

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Sum of a category's species, or null when none of them reported (outside the model's coverage). */
function sumCategory(category: PollenCategory, read: (field: string) => number | null): number | null {
  let total: number | null = null;
  for (const { field } of OPEN_METEO_SPECIES[category]) {
    const value = read(field);
    if (value !== null) total = (total ?? 0) + value;
  }
  return total;
}

/** The `current` block, or null when no pollen field reported — Open-Meteo's pollen model covers Europe only. */
export function parseOpenMeteoCurrent(current: unknown): PollenSnapshot | null {
  if (!current || typeof current !== "object") return null;
  const read = (field: string) => finiteOrNull((current as Record<string, unknown>)[field]);

  const values = emptyValues();
  const grains: Partial<Record<PollenCategory, number>> = {};
  const topSpecies: Partial<Record<PollenCategory, string[]>> = {};

  for (const category of POLLEN_CATEGORIES) {
    const total = sumCategory(category, read);
    values[category] = grainsToIndex(category, total);
    if (total !== null && total > 0) grains[category] = Math.round(total);

    // Name what was actually measured, largest first, rather than a regional default list.
    topSpecies[category] = OPEN_METEO_SPECIES[category]
      .map(({ field, name }) => ({ name, value: read(field) ?? 0 }))
      .filter((species) => species.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((species) => species.name);
  }

  if (!hasAnyValue(values)) return null;
  return { values, grains, topSpecies };
}

/**
 * The `hourly` block as one entry per local date: each category's highest hourly index that day.
 * Dates come from Open-Meteo's own `time` strings, which are already in the location's time zone
 * when the request sets `timezone=auto`.
 */
export function parseOpenMeteoHourlyForecast(hourly: unknown): ForecastDayValues[] {
  if (!hourly || typeof hourly !== "object") return [];
  const series = hourly as Record<string, unknown>;
  const times: unknown[] = Array.isArray(series.time) ? series.time : [];

  const byDay = new Map<string, Record<PollenCategory, number | null>>();
  times.forEach((time, hour) => {
    if (typeof time !== "string") return;
    const dateKey = time.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;

    const day = byDay.get(dateKey) ?? emptyValues();
    byDay.set(dateKey, day);

    const read = (field: string) => {
      const values = series[field];
      return Array.isArray(values) ? finiteOrNull(values[hour]) : null;
    };
    for (const category of POLLEN_CATEGORIES) {
      const index = grainsToIndex(category, sumCategory(category, read));
      if (index === null) continue;
      const previous = day[category];
      day[category] = previous === null ? index : Math.max(previous, index);
    }
  });

  return [...byDay.entries()].map(([dateKey, values]) => ({ dateKey, ...values }));
}
