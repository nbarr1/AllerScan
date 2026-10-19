import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, StorageService } from '../src/utils/storage';

// A minimal in-memory localStorage, since these tests run under Node.
function installLocalStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  (globalThis as any).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

describe('StorageService loading', () => {
  beforeEach(() => installLocalStorage({}));
  afterEach(() => delete (globalThis as any).localStorage);

  it('returns the defaults when nothing is stored', () => {
    expect(StorageService.getProfile()).toEqual(DEFAULT_PROFILE);
    expect(StorageService.getSymptoms()).toEqual([]);
  });

  it.each(['null', '42', '"text"', '[]', '{not json'])('falls back to the defaults for a stored %s', (raw) => {
    installLocalStorage({
      allerscan_profile_v1: raw,
      allerscan_settings_v1: raw,
      allerscan_symptoms_v1: raw,
    });
    expect(StorageService.getProfile()).toEqual(DEFAULT_PROFILE);
    expect(StorageService.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(StorageService.getSymptoms()).toEqual([]);
  });

  it('fills in fields an older or damaged profile is missing', () => {
    installLocalStorage({
      allerscan_profile_v1: JSON.stringify({ onboarded: true, allergens: null, location: { cityName: 'Lyon' } }),
    });
    const profile = StorageService.getProfile();
    expect(profile.onboarded).toBe(true);
    expect(profile.allergens).toEqual({});
    expect(profile.sensitivityFactor).toBe(2);
    expect(profile.location).toMatchObject({ cityName: 'Lyon', lat: DEFAULT_PROFILE.location.lat });
  });

  it('round-trips a saved profile, including its obfuscated coordinates', () => {
    const saved = { ...DEFAULT_PROFILE, onboarded: true, allergens: { oak: 'severe' as const } };
    saved.location = { cityName: 'Lyon', region: 'France', lat: 45.76, lng: 4.84 };
    StorageService.saveProfile(saved);
    expect(StorageService.getProfile()).toEqual(saved);
  });

  it('drops list entries that are not objects', () => {
    installLocalStorage({ allerscan_scans_v1: JSON.stringify([{ id: 'a' }, null, 'b', 3]) });
    expect(StorageService.getScans()).toEqual([{ id: 'a' }]);
  });
});
