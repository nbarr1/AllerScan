// Assembles the dashboard payload (`EnvironmentalData`) from category readings.
//
// The live route, its error branch and the offline estimate all build the same shape. Each used to
// build it by hand, which is how the forecast came to be today's value plus fixed offsets in all
// three, and how the "trend" arrows came to be a threshold on today's value. They share this now,
// and it only reports what its inputs actually contain: a forecast only from forecast data, a trend
// only from two forecast days.
//
// Kept dependency-free because server.ts imports it too.

import type {
  AirQualityData,
  DailyPollenForecast,
  EnvironmentalData,
  LiveWeatherData,
  PollenCategoryScore,
} from '../types.js';
import { POLLEN_CATEGORIES, SEASONAL_MODEL_SOURCE } from './pollenModel.js';
import type { CategoryValues, PollenCategory, ReadingCategory } from './pollenModel.js';
import { dominantLabel, scoreProfile } from './riskScore.js';
import type { ProfileScore, ScoringProfile } from './riskScore.js';
import { riskLevelForScore } from './severity.js';

/** One forecast day's peak index per pollen category, keyed by the location's local date. */
export interface ForecastDayValues {
  dateKey: string; // YYYY-MM-DD
  tree: number | null;
  grass: number | null;
  weed: number | null;
}

export interface ReportInput {
  locationName: string;
  updatedAt: string;
  timeZoneAbbr?: string;
  timeZoneNote?: string;
  dataSource: string;
  pollenSource: string;
  pollenIsModeled: boolean;
  values: CategoryValues;
  moldNote: string;
  /** Overrides the regional defaults per category. An empty list means "none to name". */
  topSpecies?: Partial<Record<PollenCategory, string[]>>;
  forecastDays: ForecastDayValues[];
  forecastSource?: string;
  weather?: LiveWeatherData;
  aqi?: AirQualityData;
  profile: ScoringProfile;
}

const DEFAULT_TOP_SPECIES: Record<ReadingCategory, string[]> = {
  tree: ['Oak Tree', 'Birch Tree', 'Cedar Tree'],
  grass: ['Bermuda Grass', 'Kentucky Bluegrass'],
  weed: ['Ragweed', 'Sagebrush'],
  mold: ['Alternaria', 'Cladosporium'],
};

/** Points of change between today's and tomorrow's peak before it counts as a trend. */
const TREND_THRESHOLD = 5;

export function buildEnvironmentalReport(input: ReportInput): EnvironmentalData {
  const scored = scoreProfile(input.values, input.profile);
  const forecast = buildForecast(input.forecastDays, input.profile);

  const trendFor = (category: PollenCategory): PollenCategoryScore['trend'] => {
    const [today, tomorrow] = input.forecastDays;
    const a = today?.[category];
    const b = tomorrow?.[category];
    if (a === null || a === undefined || b === null || b === undefined) return undefined;
    if (b - a > TREND_THRESHOLD) return 'rising';
    if (a - b > TREND_THRESHOLD) return 'falling';
    return 'stable';
  };

  const categoryScore = (category: ReadingCategory): PollenCategoryScore => {
    const value = input.values[category];
    const isPollen = category !== 'mold';
    return {
      level: value === null ? null : riskLevelForScore(value),
      value,
      trend: isPollen ? trendFor(category) : undefined,
      topSpecies: (isPollen ? input.topSpecies?.[category] : undefined) ?? DEFAULT_TOP_SPECIES[category],
      estimateNote: !isPollen ? input.moldNote : input.pollenIsModeled ? 'Seasonal estimate' : undefined,
    };
  };

  return {
    locationName: input.locationName,
    updatedAt: input.updatedAt,
    timeZoneAbbr: input.timeZoneAbbr,
    timeZoneNote: input.timeZoneNote,
    dataSource: input.dataSource,
    pollenDataSource: input.pollenSource,
    pollenIsModeled: input.pollenIsModeled,
    weather: input.weather,
    aqi: input.aqi,
    overallPersonalRiskScore: scored.score,
    riskCategory: scored.riskLevel,
    scoreBasis: scored.basis,
    pollen: {
      tree: categoryScore('tree'),
      grass: categoryScore('grass'),
      weed: categoryScore('weed'),
      mold: categoryScore('mold'),
    },
    matchedActiveAllergens: scored.matched,
    unscoredAllergens: scored.unscored,
    recommendations: buildRecommendations(scored, input),
    forecast,
    forecastSource: forecast.length > 0 ? input.forecastSource : undefined,
  };
}

/**
 * Scores each forecast day the same way as today's headline — weighted by the saved allergens,
 * with the sensitivity setting applied — so "Today" in the list can't contradict the gauge for any
 * reason other than the forecast peak differing from the current reading.
 */
function buildForecast(days: ForecastDayValues[], profile: ScoringProfile): DailyPollenForecast[] {
  const rows: DailyPollenForecast[] = [];
  days.slice(0, 5).forEach((day, index) => {
    const pollen = { tree: day.tree, grass: day.grass, weed: day.weed };
    if (POLLEN_CATEGORIES.every((category) => pollen[category] === null)) return;

    const scored = scoreProfile({ ...pollen, mold: null }, profile);
    rows.push({
      dayName: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : formatDateKey(day.dateKey, { weekday: 'long' }),
      date: formatDateKey(day.dateKey, { month: 'short', day: 'numeric' }),
      riskLevel: scored.riskLevel,
      overallScore: scored.score,
      basis: scored.basis,
      tree: day.tree,
      grass: day.grass,
      weed: day.weed,
      dominantAllergen: dominantLabel(pollen, profile) ?? 'No reading',
    });
  });
  return rows;
}

/** Formats a location-local `YYYY-MM-DD` key without letting the server's own time zone shift it. */
function formatDateKey(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return date.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

function buildRecommendations(scored: ProfileScore, input: ReportInput): string[] {
  const recommendations: string[] = [];
  const { weather } = input;

  if (weather && weather.windSpeedMph >= 12) {
    recommendations.push(
      `Breezy winds (${weather.windSpeedMph} mph ${weather.windDirection}) are carrying pollen further than usual today.`
    );
  }
  if (weather && weather.humidityPct > 70) {
    recommendations.push(
      `High humidity (${weather.humidityPct}%) promotes outdoor mold spore release along damp soils and foliage.`
    );
  }

  const subject = scored.basis === 'profile' ? 'for your allergens' : 'across outdoor pollen and mold';
  const lead = input.pollenIsModeled ? 'Estimated risk' : 'Risk';

  if (scored.riskLevel === 'Very High' || scored.riskLevel === 'High') {
    recommendations.push(
      `${lead} is ${scored.riskLevel.toLowerCase()} ${subject}. Keep windows closed today and use air conditioning on recirculate.`
    );
    recommendations.push('Shower and change clothes after returning from prolonged outdoor exposure.');
    recommendations.push('Consider wearing a protective mask for lawn mowing or gardening.');
  } else if (scored.riskLevel === 'Moderate') {
    recommendations.push(`${lead} is moderate ${subject}. Limit intense midday outdoor exercise.`);
    recommendations.push('Use saline nasal rinse following outdoor walks.');
  } else {
    recommendations.push(`${lead} is low ${subject} today.`);
  }

  if (input.pollenIsModeled) {
    recommendations.push(
      `Pollen figures here come from the ${SEASONAL_MODEL_SOURCE.toLowerCase()}, not a live reading — treat them as a rough guide.`
    );
  }
  return recommendations;
}
