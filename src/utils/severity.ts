// One severity scale for the whole app.
//
// Before this existed, the hero gauge used four thresholds (70/50/30), the pollen tiles used a
// single `>= 50` cut, the map markers used 75/55/35, and the AQI pill was hard-coded green at
// every level. The same reading could carry three different visual severities on one screen.
// Everything that colours a number now reads from here.

export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Very High';

export type AqiCategory =
  | 'Good'
  | 'Moderate'
  | 'Unhealthy for Sensitive'
  | 'Unhealthy'
  | 'Very Unhealthy'
  | 'Hazardous';

export interface SeverityTheme {
  /** Tailwind classes for a filled badge/pill. */
  badge: string;
  /** Tailwind class for a solid bar/fill. */
  bar: string;
  /** Hex, for SVG strokes and Google Maps pins. */
  hex: string;
  /** Tailwind text colour. */
  text: string;
  /** Tailwind background + border pair for light surfaces. */
  surface: string;
}

const THEMES: Record<RiskLevel, SeverityTheme> = {
  Low: {
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    bar: 'bg-emerald-500',
    hex: '#10b981',
    text: 'text-emerald-700',
    surface: 'bg-emerald-50 border-emerald-200',
  },
  Moderate: {
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    bar: 'bg-amber-500',
    hex: '#eab308',
    text: 'text-amber-700',
    surface: 'bg-amber-50 border-amber-200',
  },
  High: {
    badge: 'bg-orange-100 text-orange-900 border-orange-300',
    bar: 'bg-orange-500',
    hex: '#f97316',
    text: 'text-orange-700',
    surface: 'bg-orange-50 border-orange-200',
  },
  'Very High': {
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    bar: 'bg-rose-500',
    hex: '#e11d48',
    text: 'text-rose-700',
    surface: 'bg-rose-50 border-rose-200',
  },
};

/** Shared 0-100 thresholds: Low < 30, Moderate < 50, High < 70, then Very High. */
export function riskLevelForScore(score: number): RiskLevel {
  if (score >= 70) return 'Very High';
  if (score >= 50) return 'High';
  if (score >= 30) return 'Moderate';
  return 'Low';
}

export function themeForLevel(level: RiskLevel): SeverityTheme {
  return THEMES[level] ?? THEMES.Low;
}

export function themeForScore(score: number): SeverityTheme {
  return themeForLevel(riskLevelForScore(score));
}

/**
 * Map the six US AQI bands onto the same four-step ramp, so an "Unhealthy" reading can never
 * render in the same reassuring green as "Good".
 */
export function themeForAqiCategory(category: string): SeverityTheme {
  switch (category) {
    case 'Hazardous':
    case 'Very Unhealthy':
      return THEMES['Very High'];
    case 'Unhealthy':
      return THEMES.High;
    case 'Unhealthy for Sensitive':
    case 'Moderate':
      return THEMES.Moderate;
    default:
      return THEMES.Low;
  }
}

/** Dark-surface variant of the AQI pill (the dashboard's AQI tile sits on slate-900). */
export function aqiPillOnDark(category: string): string {
  switch (category) {
    case 'Hazardous':
    case 'Very Unhealthy':
      return 'bg-rose-950 text-rose-300 border-rose-800';
    case 'Unhealthy':
      return 'bg-orange-950 text-orange-300 border-orange-800';
    case 'Unhealthy for Sensitive':
    case 'Moderate':
      return 'bg-amber-950 text-amber-300 border-amber-800';
    default:
      return 'bg-slate-800 text-emerald-400 border-slate-700';
  }
}

/** Severity ordering, used to compare a user's saved severity against their alert threshold. */
export const SEVERITY_RANK: Record<'mild' | 'moderate' | 'severe', number> = {
  mild: 1,
  moderate: 2,
  severe: 3,
};
