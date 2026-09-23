// Reads the location and allergen profile that `/api/pollen-aqi` and `/api/pollen-hotspots` score
// against, from either a JSON body (POST, what the app sends) or a query string (GET, kept for
// older cached clients).
//
// Nothing here is trusted. The routes used to hand these values straight to the scoring code: a
// custom allergen of `null` threw and silently swapped live data for the seasonal estimate, and a
// category of "toString" reached a plain-object lookup and produced a risk score of null. Every
// field is checked here, and anything malformed is dropped rather than passed along.

import type { CustomAllergenMeta, SeverityLevel } from "../src/types.js";
import { isAllergenCategory, isBuiltInAllergen, isSeverityLevel } from "../src/utils/riskScore.js";
import { withSafeKeys } from "../src/utils/safeKeys.js";

export const DEFAULT_LOCATION = { name: "Austin, TX", lat: 30.2672, lng: -97.7431 };

const MAX_ALLERGENS = 100;
const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 80;
const MAX_LOCATION_NAME_LENGTH = 120;

export interface PollenRequest {
  locationName: string;
  /** Null when absent or out of range; the route geocodes `locationName` instead. */
  lat: number | null;
  lng: number | null;
  allergens: Record<string, SeverityLevel>;
  customAllergens: Record<string, CustomAllergenMeta>;
  sensitivityFactor: number;
}

export function readPollenRequest(source: unknown): PollenRequest {
  const input = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  return {
    locationName: readLocationName(input.locationName),
    lat: readCoordinate(input.lat, 90),
    lng: readCoordinate(input.lng, 180),
    allergens: readAllergens(input.userAllergens),
    customAllergens: readCustomAllergens(input.customAllergens),
    sensitivityFactor: readSensitivity(input.sensitivityFactor),
  };
}

function readLocationName(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_LOCATION.name;
  const trimmed = value.trim().slice(0, MAX_LOCATION_NAME_LENGTH);
  return trimmed || DEFAULT_LOCATION.name;
}

function readCoordinate(value: unknown, limit: number): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null;
}

function readSensitivity(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 2;
}

/** A JSON body carries objects; a query string carries the same objects JSON-encoded. */
function readObject(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  // Ids become lookup keys downstream — see utils/safeKeys.
  return withSafeKeys(parsed as Record<string, unknown>);
}

function readAllergens(value: unknown): Record<string, SeverityLevel> {
  const result: Record<string, SeverityLevel> = Object.create(null);
  for (const [id, severity] of Object.entries(readObject(value)).slice(0, MAX_ALLERGENS)) {
    if (id.length <= MAX_ID_LENGTH && isSeverityLevel(severity)) result[id] = severity;
  }
  return result;
}

function readCustomAllergens(value: unknown): Record<string, CustomAllergenMeta> {
  const result: Record<string, CustomAllergenMeta> = Object.create(null);
  for (const [id, meta] of Object.entries(readObject(value)).slice(0, MAX_ALLERGENS)) {
    // A custom entry can't redefine a built-in allergen's name or category.
    if (id.length > MAX_ID_LENGTH || isBuiltInAllergen(id)) continue;
    if (!meta || typeof meta !== "object") continue;
    const { name, category } = meta as Record<string, unknown>;
    if (typeof name !== "string" || !isAllergenCategory(category)) continue;
    const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
    if (trimmed) result[id] = { name: trimmed, category };
  }
  return result;
}
