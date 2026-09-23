import { describe, expect, it } from 'vitest';
import { buildEnvironmentalReport } from '../src/utils/envReport';
import type { ReportInput } from '../src/utils/envReport';
import { generateFallbackEnvData } from '../src/utils/fallbackData';

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    locationName: 'Paris',
    updatedAt: '10:00 AM',
    dataSource: 'Live Open-Meteo Air Quality & Weather API',
    pollenSource: 'Live Open-Meteo Pollen Sensors',
    pollenIsModeled: false,
    values: { tree: 40, grass: 60, weed: 10, mold: 30 },
    moldNote: 'Estimated from live humidity and temperature',
    forecastDays: [],
    profile: { allergens: { timothy_grass: 'severe' } },
    ...overrides,
  };
}

describe('buildEnvironmentalReport', () => {
  it('has no forecast and no trend without forecast data', () => {
    const report = buildEnvironmentalReport(input());
    expect(report.forecast).toEqual([]);
    expect(report.forecastSource).toBeUndefined();
    expect(report.pollen.grass.trend).toBeUndefined();
  });

  it('builds forecast rows from forecast data only, scored like the headline', () => {
    const report = buildEnvironmentalReport(
      input({
        forecastDays: [
          { dateKey: '2026-09-23', tree: 40, grass: 60, weed: 10 },
          { dateKey: '2026-09-24', tree: 40, grass: 80, weed: 10 },
          { dateKey: '2026-09-25', tree: null, grass: null, weed: null }, // nothing to show
          { dateKey: '2026-09-26', tree: 5, grass: 0, weed: 0 },
        ],
        forecastSource: 'Open-Meteo pollen forecast',
      })
    );

    expect(report.forecast.map((d) => [d.dayName, d.date, d.overallScore, d.basis])).toEqual([
      ['Today', 'Sep 23', 60, 'profile'],
      ['Tomorrow', 'Sep 24', 80, 'profile'],
      ['Saturday', 'Sep 26', 0, 'profile'],
    ]);
    expect(report.forecast[0].dominantAllergen).toBe('Timothy Grass');
    expect(report.forecast[2].dominantAllergen).toBe('Tree pollen');
    expect(report.forecastSource).toBe('Open-Meteo pollen forecast');
    expect(report.pollen.grass.trend).toBe('rising');
    expect(report.pollen.tree.trend).toBe('stable');
  });

  it('reports a missing category as null and labels mold as an estimate', () => {
    const report = buildEnvironmentalReport(input({ values: { tree: null, grass: 60, weed: 10, mold: 30 } }));
    expect(report.pollen.tree).toMatchObject({ value: null, level: null });
    expect(report.pollen.mold.estimateNote).toBe('Estimated from live humidity and temperature');
    expect(report.pollen.grass.estimateNote).toBeUndefined();
  });
});

describe('generateFallbackEnvData', () => {
  it('is labelled as an estimate and invents no weather, air quality or forecast', () => {
    const data = generateFallbackEnvData('Austin, Texas', { oak: 'severe', pet_dander_dog: 'mild' });
    expect(data.pollenIsModeled).toBe(true);
    expect(data.weather).toBeUndefined();
    expect(data.aqi).toBeUndefined();
    expect(data.forecast).toEqual([]);
    expect(data.pollen.tree.estimateNote).toBe('Seasonal estimate');
    expect(data.unscoredAllergens.map((a) => a.id)).toEqual(['pet_dander_dog']);
    expect(data.matchedActiveAllergens.every((m) => m.category !== 'indoor')).toBe(true);
  });
});
