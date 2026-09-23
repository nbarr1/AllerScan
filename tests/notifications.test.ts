import { describe, expect, it } from 'vitest';
import { generateNotifications, isWithinQuietHours } from '../src/utils/notifications';
import { DEFAULT_SCHEDULE, DEFAULT_SETTINGS } from '../src/utils/storage';
import type { EnvironmentalData } from '../src/types';

const settings = { ...DEFAULT_SETTINGS, quietHoursEnabled: false };

const envData = {
  locationName: 'Austin',
  riskCategory: 'High',
  overallPersonalRiskScore: 62,
  matchedActiveAllergens: [
    { id: 'oak', name: 'Oak Tree', category: 'tree', userSeverity: 'severe', currentLevel: 'High', currentValue: 62 },
  ],
} as unknown as EnvironmentalData;

describe('generateNotifications', () => {
  it('produces each alert once', () => {
    const first = generateNotifications({ envData, schedule: DEFAULT_SCHEDULE, settings, existing: [] });
    expect(first.length).toBeGreaterThan(0);
    const again = generateNotifications({ envData, schedule: DEFAULT_SCHEDULE, settings, existing: first });
    expect(again).toEqual([]);
  });

  it('keeps cleared alerts cleared instead of regenerating them unread', () => {
    const first = generateNotifications({ envData, schedule: DEFAULT_SCHEDULE, settings, existing: [] });
    const afterClear = generateNotifications({
      envData,
      schedule: DEFAULT_SCHEDULE,
      settings,
      existing: [],
      dismissed: first.map((n) => n.id),
    });
    expect(afterClear).toEqual([]);
  });
});

describe('isWithinQuietHours', () => {
  const quiet = { ...DEFAULT_SETTINGS, quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' };
  const at = (h: number, m = 0) => new Date(2026, 8, 23, h, m);

  it('handles a window that wraps past midnight', () => {
    expect(isWithinQuietHours(quiet, at(23))).toBe(true);
    expect(isWithinQuietHours(quiet, at(6, 59))).toBe(true);
    expect(isWithinQuietHours(quiet, at(7))).toBe(false);
    expect(isWithinQuietHours(quiet, at(12))).toBe(false);
  });

  it('is off when disabled', () => {
    expect(isWithinQuietHours({ ...quiet, quietHoursEnabled: false }, at(23))).toBe(false);
  });
});
