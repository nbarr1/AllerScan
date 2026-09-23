import { describe, expect, it } from 'vitest';
import { addDaysToKey, parseClockTime, parseLocalDateKey, toLocalDateKey } from '../src/utils/dates';
import { withSafeKeys } from '../src/utils/safeKeys';
import { applySensitivity } from '../src/utils/sensitivity';
import { riskLevelForScore } from '../src/utils/severity';

describe('local date keys', () => {
  it('formats and parses local calendar days', () => {
    expect(toLocalDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(parseLocalDateKey('2026-01-05')?.getDate()).toBe(5);
    expect(parseLocalDateKey('2026-1-5')).toBeNull();
    expect(parseLocalDateKey('')).toBeNull();
  });

  it('adds days across month and year boundaries', () => {
    expect(addDaysToKey('2026-01-30', 7)).toBe('2026-02-06');
    expect(addDaysToKey('2026-12-29', 7)).toBe('2027-01-05');
  });

  it('parses clock times', () => {
    expect(parseClockTime('07:30')).toBe(450);
    expect(parseClockTime('24:00')).toBeNull();
    expect(parseClockTime('7pm')).toBeNull();
  });
});

describe('shared helpers', () => {
  it('uses one set of severity thresholds', () => {
    expect([29, 30, 49, 50, 69, 70].map(riskLevelForScore)).toEqual([
      'Low',
      'Moderate',
      'Moderate',
      'High',
      'High',
      'Very High',
    ]);
  });

  it('clamps the sensitivity factor', () => {
    expect(applySensitivity(50, 2)).toBe(50);
    expect(applySensitivity(40, 10)).toBe(46); // clamped to 3, so x1.15
    expect(applySensitivity(90, 3)).toBe(100);
  });

  it('drops keys that would reach the prototype', () => {
    const safe = withSafeKeys(JSON.parse('{"__proto__":{"x":1},"constructor":1,"oak":"mild"}'));
    expect(Object.keys(safe)).toEqual(['oak']);
    expect((safe as any).constructor).toBeUndefined();
  });
});
