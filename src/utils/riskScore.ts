// Turns a set of category readings into the user's personal risk score.
//
// The live route, its error branch and the offline estimate each used to carry their own copy of
// this, with their own allergen name tables. They agreed on the arithmetic but not on the rules:
// indoor triggers were scored against a fixed 35-40 "reading" that nothing measured, so anyone
// with a cat allergy was told it was active every day. The rules now live here once:
//
//   - Indoor allergens aren't scored. Outdoor pollen data says nothing about dust mites or dander.
//   - A category with no reading isn't scored as zero. Its allergens are reported as unscored.
//   - When none of the saved allergens can be scored, the score is the plain average of the outdoor
//     categories and is labelled `general`, so the UI never calls it "your" risk.
//
// Kept dependency-free (bar the static allergen list) because server.ts imports it too.

import { ALLERGEN_CATEGORIES as CATEGORY_INFO, MASTER_ALLERGENS } from '../data/allergensDatabase.js';
import type {
  AllergenCategory,
  CustomAllergenMeta,
  MatchedAllergen,
  ScoreBasis,
  SeverityLevel,
  UnscoredAllergen,
} from '../types.js';
import { POLLEN_CATEGORIES, READING_CATEGORIES } from './pollenModel.js';
import type { CategoryValues, PollenCategory } from './pollenModel.js';
import { emptySafeTable } from './safeKeys.js';
import { applySensitivity } from './sensitivity.js';
import { riskLevelForScore } from './severity.js';
import type { RiskLevel } from './severity.js';

/** A saved allergen counts as "active" from the bottom of the Moderate band. */
export const ACTIVE_THRESHOLD = 30;

const ALLERGEN_CATEGORIES: readonly AllergenCategory[] = CATEGORY_INFO.map((c) => c.key);

export const CATEGORY_LABEL: Record<PollenCategory, string> = {
  tree: 'Tree pollen',
  grass: 'Grass pollen',
  weed: 'Weed pollen',
};

// Null-prototype: indexed with ids that came from a request or from localStorage.
const BUILT_IN_ALLERGENS = Object.assign(
  emptySafeTable<{ name: string; category: AllergenCategory }>(),
  Object.fromEntries(MASTER_ALLERGENS.map((a) => [a.id, { name: a.name, category: a.category }]))
);

export function isAllergenCategory(value: unknown): value is AllergenCategory {
  return typeof value === 'string' && (ALLERGEN_CATEGORIES as readonly string[]).includes(value);
}

export function isSeverityLevel(value: unknown): value is SeverityLevel {
  return value === 'mild' || value === 'moderate' || value === 'severe';
}

export function isBuiltInAllergen(id: string): boolean {
  return Boolean(BUILT_IN_ALLERGENS[id]);
}

/** 1-3; used both as a score weight and to rank which saved trigger to name first. */
function severityWeight(severity: SeverityLevel): number {
  return severity === 'severe' ? 3 : severity === 'moderate' ? 2 : 1;
}

export interface ScoringProfile {
  allergens: Record<string, SeverityLevel>;
  customAllergens?: Record<string, CustomAllergenMeta>;
  sensitivityFactor?: number;
}

/** Name and category for a built-in id, or for a custom trigger with valid metadata. */
export function resolveAllergen(
  id: string,
  customAllergens?: Record<string, CustomAllergenMeta>
): { name: string; category: AllergenCategory } | null {
  const builtIn = BUILT_IN_ALLERGENS[id];
  if (builtIn) return builtIn;

  const custom =
    customAllergens && Object.prototype.hasOwnProperty.call(customAllergens, id)
      ? customAllergens[id]
      : undefined;
  if (custom && typeof custom.name === 'string' && isAllergenCategory(custom.category)) {
    return { name: custom.name, category: custom.category };
  }
  return null;
}

/** The user's saved allergens in one category, most severe first. */
export function savedAllergensInCategory(
  category: AllergenCategory,
  profile: ScoringProfile
): Array<{ id: string; name: string; severity: SeverityLevel }> {
  const found: Array<{ id: string; name: string; severity: SeverityLevel }> = [];
  for (const [id, severity] of Object.entries(profile.allergens)) {
    if (!isSeverityLevel(severity)) continue;
    const meta = resolveAllergen(id, profile.customAllergens);
    if (meta && meta.category === category) found.push({ id, name: meta.name, severity });
  }
  return found.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
}

export interface ProfileScore {
  score: number;
  riskLevel: RiskLevel;
  basis: ScoreBasis;
  matched: MatchedAllergen[];
  unscored: UnscoredAllergen[];
}

export function scoreProfile(values: CategoryValues, profile: ScoringProfile): ProfileScore {
  const matched: MatchedAllergen[] = [];
  const unscored: UnscoredAllergen[] = [];
  let weighted = 0;
  let totalWeight = 0;

  for (const [id, severity] of Object.entries(profile.allergens)) {
    if (!isSeverityLevel(severity)) continue;
    const meta = resolveAllergen(id, profile.customAllergens);
    if (!meta) continue;

    if (meta.category === 'indoor') {
      unscored.push({ id, name: meta.name, category: meta.category, reason: 'indoor' });
      continue;
    }

    const value = values[meta.category];
    if (value === null) {
      unscored.push({ id, name: meta.name, category: meta.category, reason: 'no-reading' });
      continue;
    }

    const weight = severityWeight(severity);
    weighted += value * weight;
    totalWeight += weight;

    if (value >= ACTIVE_THRESHOLD) {
      matched.push({
        id,
        name: meta.name,
        category: meta.category,
        userSeverity: severity,
        currentLevel: riskLevelForScore(value),
        currentValue: value,
      });
    }
  }

  let basis: ScoreBasis;
  let base: number;
  if (totalWeight > 0) {
    basis = 'profile';
    base = Math.round(weighted / totalWeight);
  } else {
    basis = 'general';
    const available = READING_CATEGORIES.map((c) => values[c]).filter((v): v is number => v !== null);
    base = available.length > 0 ? Math.round(available.reduce((a, b) => a + b, 0) / available.length) : 0;
  }

  const score = applySensitivity(base, profile.sensitivityFactor ?? 2);
  return { score, riskLevel: riskLevelForScore(score), basis, matched, unscored };
}

/**
 * Names the highest pollen category in a set of readings: the user's own saved trigger in that
 * category when there is one, otherwise the category. Returns null when nothing has a reading.
 */
export function dominantLabel(
  values: Record<PollenCategory, number | null>,
  profile: ScoringProfile
): string | null {
  let best: PollenCategory | null = null;
  for (const category of POLLEN_CATEGORIES) {
    const value = values[category];
    if (value === null) continue;
    if (best === null || value > (values[best] as number)) best = category;
  }
  if (best === null) return null;

  const saved = savedAllergensInCategory(best, profile);
  return saved.length > 0 ? saved[0].name : CATEGORY_LABEL[best];
}
