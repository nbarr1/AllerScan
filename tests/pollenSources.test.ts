import { describe, expect, it } from 'vitest';
import {
  parseGoogleDay,
  parseGoogleForecast,
  parseOpenMeteoCurrent,
  parseOpenMeteoHourlyForecast,
} from '../server/pollenSources';

describe('parseGoogleDay', () => {
  it('leaves a pollen type Google omitted as null instead of a stand-in number', () => {
    const snapshot = parseGoogleDay({
      pollenTypeInfo: [
        { code: 'TREE', indexInfo: { value: 3 } },
        { code: 'GRASS' }, // no index value
      ],
    });
    expect(snapshot?.values).toEqual({ tree: 60, grass: null, weed: null });
  });

  it('returns null when no pollen type carries an index', () => {
    expect(parseGoogleDay({ pollenTypeInfo: [{ code: 'TREE' }, { code: 'WEED', indexInfo: {} }] })).toBeNull();
    expect(parseGoogleDay(undefined)).toBeNull();
  });

  it('keeps a real zero', () => {
    const snapshot = parseGoogleDay({ pollenTypeInfo: [{ code: 'WEED', indexInfo: { value: 0 } }] });
    expect(snapshot?.values.weed).toBe(0);
  });

  it('files named plants under their own category', () => {
    const snapshot = parseGoogleDay({
      pollenTypeInfo: [{ code: 'TREE', indexInfo: { value: 1 } }],
      plantInfo: [
        { displayName: 'Ragweed', plantDescription: { type: 'WEED' } },
        { displayName: 'Oak', plantDescription: { type: 'TREE' } },
      ],
    });
    expect(snapshot?.topSpecies).toEqual({ tree: ['Oak'], weed: ['Ragweed'] });
  });
});

describe('parseGoogleForecast', () => {
  it('turns dated daily entries into forecast days', () => {
    const days = parseGoogleForecast({
      dailyInfo: [
        { date: { year: 2026, month: 9, day: 23 }, pollenTypeInfo: [{ code: 'GRASS', indexInfo: { value: 2 } }] },
        { date: { year: 2026, month: 9, day: 24 }, pollenTypeInfo: [{ code: 'GRASS', indexInfo: { value: 4 } }] },
        { pollenTypeInfo: [] }, // undated, skipped
      ],
    });
    expect(days).toEqual([
      { dateKey: '2026-09-23', tree: null, grass: 40, weed: null },
      { dateKey: '2026-09-24', tree: null, grass: 80, weed: null },
    ]);
  });
});

describe('parseOpenMeteoCurrent', () => {
  it('treats zeros as a real reading (winter), not as missing coverage', () => {
    const snapshot = parseOpenMeteoCurrent({
      birch_pollen: 0,
      alder_pollen: 0,
      olive_pollen: 0,
      grass_pollen: 0,
      ragweed_pollen: 0,
      mugwort_pollen: 0,
    });
    expect(snapshot?.values).toEqual({ tree: 0, grass: 0, weed: 0 });
    expect(snapshot?.grains).toEqual({});
  });

  it('returns null outside the pollen model coverage', () => {
    expect(parseOpenMeteoCurrent({ birch_pollen: null, grass_pollen: null, ragweed_pollen: null })).toBeNull();
    expect(parseOpenMeteoCurrent({ us_aqi: 40 })).toBeNull();
  });

  it('converts grains without extra weather multipliers and names the measured species', () => {
    const snapshot = parseOpenMeteoCurrent({ birch_pollen: 10, alder_pollen: 2, grass_pollen: 5, ragweed_pollen: null });
    expect(snapshot?.values).toEqual({ tree: 30, grass: 16, weed: null });
    expect(snapshot?.grains).toEqual({ tree: 12, grass: 5 });
    expect(snapshot?.topSpecies?.tree).toEqual(['Birch', 'Alder']);
  });
});

describe('parseOpenMeteoHourlyForecast', () => {
  it("takes each local day's peak hour per category", () => {
    const days = parseOpenMeteoHourlyForecast({
      time: ['2026-09-23T00:00', '2026-09-23T12:00', '2026-09-24T00:00'],
      grass_pollen: [1, 10, 5],
      birch_pollen: [null, null, null],
      ragweed_pollen: [2, 0, null],
      mugwort_pollen: [1, null, null],
    });
    expect(days).toEqual([
      { dateKey: '2026-09-23', tree: null, grass: 32, weed: 8 },
      { dateKey: '2026-09-24', tree: null, grass: 16, weed: null },
    ]);
  });

  it('handles a missing hourly block', () => {
    expect(parseOpenMeteoHourlyForecast(undefined)).toEqual([]);
  });
});
