// Normalizes the vision model's JSON before `/api/scan` returns it. Kept apart from server.ts so it
// can be tested without starting the server.
//
// The response schema asks Gemini for strings and an integer, but a schema is a request, not a
// guarantee. The route used to forward whatever came back: a `details` object or a feature list
// of objects reached React as a child and blanked the scan screen, and a `category` of "Tree"
// matched none of the app's categories. Every field is checked here, and anything malformed is
// dropped or replaced with the field's "unknown" value rather than passed along.

import type { AllergenCategory } from "../src/types.js";
import { isAllergenCategory } from "../src/utils/riskScore.js";
import { isSafeObjectKey } from "../src/utils/safeKeys.js";

export interface ScanIdentification {
  speciesName: string;
  scientificName: string;
  category: AllergenCategory | "non_allergen";
  /** 0-100, omitted when the model didn't report a usable number. */
  confidence?: number;
  /** A built-in allergen id, omitted for "none" or anything that isn't a plain id. */
  matchedAllergenId?: string;
  identifyingFeatures: string[];
  details: string;
}

const MAX_NAME_LENGTH = 120;
const MAX_FEATURES = 6;
const MAX_FEATURE_LENGTH = 200;
const MAX_DETAILS_LENGTH = 2000;

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** The model's result in the shape the app stores, or null when it didn't name a species. */
export function normalizeScanResult(raw: unknown): ScanIdentification | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;

  const speciesName = text(input.speciesName, MAX_NAME_LENGTH);
  if (!speciesName) return null;

  const rawCategory = typeof input.category === "string" ? input.category.trim().toLowerCase() : "";
  const category = isAllergenCategory(rawCategory) ? rawCategory : "non_allergen";

  const result: ScanIdentification = {
    speciesName,
    scientificName: text(input.scientificName, MAX_NAME_LENGTH),
    category,
    identifyingFeatures: (Array.isArray(input.identifyingFeatures) ? input.identifyingFeatures : [])
      .map((feature) => text(feature, MAX_FEATURE_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_FEATURES),
    details: text(input.details, MAX_DETAILS_LENGTH),
  };

  if (typeof input.confidence === "number" && Number.isFinite(input.confidence)) {
    result.confidence = Math.round(Math.min(100, Math.max(0, input.confidence)));
  }

  const matched = typeof input.matchedAllergenId === "string" ? input.matchedAllergenId.trim() : "";
  if (matched && matched !== "none" && /^[a-z0-9_]{1,64}$/.test(matched) && isSafeObjectKey(matched)) {
    result.matchedAllergenId = matched;
  }

  return result;
}
