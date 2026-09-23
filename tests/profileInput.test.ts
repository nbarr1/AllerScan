import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCATION, readPollenRequest } from '../server/profileInput';

describe('readPollenRequest', () => {
  it('drops malformed custom allergens instead of passing them to scoring', () => {
    const request = readPollenRequest({
      userAllergens: { c1: 'severe', c2: 'mild', c3: 'moderate', oak: 'moderate' },
      customAllergens: {
        c1: null,
        c2: { name: 'x', category: 'toString' },
        c3: { name: '  Juniper  ', category: 'tree' },
        oak: { name: 'Not oak', category: 'indoor' }, // can't redefine a built-in
      },
    });
    expect({ ...request.customAllergens }).toEqual({ c3: { name: 'Juniper', category: 'tree' } });
    expect({ ...request.allergens }).toEqual({ c1: 'severe', c2: 'mild', c3: 'moderate', oak: 'moderate' });
  });

  it('drops invalid severities and prototype keys', () => {
    const request = readPollenRequest({
      userAllergens: JSON.parse('{"__proto__":"severe","constructor":"severe","oak":"extreme","birch":"mild"}'),
    });
    expect({ ...request.allergens }).toEqual({ birch: 'mild' });
    expect(Object.getPrototypeOf(request.allergens)).toBeNull();
  });

  it('reads the JSON-encoded query-string form', () => {
    const request = readPollenRequest({
      lat: '51.5',
      lng: '-0.12',
      locationName: 'London',
      userAllergens: '{"grass":"mild","timothy_grass":"severe"}',
      sensitivityFactor: '3',
    });
    expect(request).toMatchObject({ lat: 51.5, lng: -0.12, locationName: 'London', sensitivityFactor: 3 });
    expect({ ...request.allergens }).toEqual({ grass: 'mild', timothy_grass: 'severe' });
  });

  it('treats missing, empty or out-of-range coordinates as absent, but keeps zero', () => {
    expect(readPollenRequest({ lat: '', lng: 'abc' })).toMatchObject({ lat: null, lng: null });
    expect(readPollenRequest({ lat: 95, lng: 200 })).toMatchObject({ lat: null, lng: null });
    expect(readPollenRequest({ lat: 0, lng: 0 })).toMatchObject({ lat: 0, lng: 0 });
  });

  it('survives a missing or broken body', () => {
    for (const source of [undefined, null, 'nonsense', { userAllergens: '{not json' }]) {
      const request = readPollenRequest(source);
      expect(request.locationName).toBe(DEFAULT_LOCATION.name);
      expect(request.sensitivityFactor).toBe(2);
      expect({ ...request.allergens }).toEqual({});
    }
  });
});
