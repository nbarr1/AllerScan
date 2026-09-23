import { describe, expect, it } from 'vitest';
import { dominantLabel, resolveAllergen, savedAllergensInCategory, scoreProfile } from '../src/utils/riskScore';
import type { CategoryValues } from '../src/utils/pollenModel';

const values: CategoryValues = { tree: 60, grass: 20, weed: 40, mold: 50 };

describe('scoreProfile', () => {
  it('weights saved allergens by severity', () => {
    // oak (tree 60, severe x3) + bermuda (grass 20, mild x1) = 200 / 4 = 50
    const result = scoreProfile(values, { allergens: { oak: 'severe', bermuda_grass: 'mild' } });
    expect(result.basis).toBe('profile');
    expect(result.score).toBe(50);
    expect(result.riskLevel).toBe('High');
    expect(result.matched.map((m) => m.id)).toEqual(['oak']); // grass at 20 is below "active"
  });

  it('never scores indoor allergens against a made-up reading', () => {
    const result = scoreProfile(values, { allergens: { pet_dander_cat: 'severe' } });
    expect(result.matched).toEqual([]);
    expect(result.unscored).toEqual([
      { id: 'pet_dander_cat', name: 'Cat Dander (Fel d 1)', category: 'indoor', reason: 'indoor' },
    ]);
    expect(result.basis).toBe('general');
  });

  it('reports a category with no reading as unscored rather than scoring it as zero', () => {
    const result = scoreProfile({ ...values, grass: null }, { allergens: { oak: 'mild', timothy_grass: 'severe' } });
    expect(result.score).toBe(60); // oak alone
    expect(result.unscored.map((u) => [u.id, u.reason])).toEqual([['timothy_grass', 'no-reading']]);
  });

  it('falls back to the general outdoor average, labelled as such, with nothing saved', () => {
    const result = scoreProfile(values, { allergens: {} });
    expect(result.basis).toBe('general');
    expect(result.score).toBe(Math.round((60 + 20 + 40 + 50) / 4));
  });

  it('applies the sensitivity setting', () => {
    const neutral = scoreProfile(values, { allergens: { oak: 'moderate' }, sensitivityFactor: 2 }).score;
    const reactive = scoreProfile(values, { allergens: { oak: 'moderate' }, sensitivityFactor: 3 }).score;
    expect(neutral).toBe(60);
    expect(reactive).toBe(69);
  });

  it('ignores unknown ids, inherited property names and invalid severities', () => {
    const allergens = JSON.parse('{"constructor":"severe","toString":"severe","nope":"severe","oak":"extreme"}');
    const result = scoreProfile(values, { allergens });
    expect(result.basis).toBe('general');
    expect(result.matched).toEqual([]);
    expect(result.unscored).toEqual([]);
  });

  it('scores custom allergens by their category', () => {
    const result = scoreProfile(values, {
      allergens: { custom_juniper: 'moderate' },
      customAllergens: { custom_juniper: { name: 'Juniper', category: 'tree' } },
    });
    expect(result.score).toBe(60);
    expect(result.matched[0]).toMatchObject({ id: 'custom_juniper', name: 'Juniper', category: 'tree' });
  });
});

describe('resolveAllergen', () => {
  it('rejects a custom entry with an invalid category', () => {
    expect(resolveAllergen('c1', { c1: { name: 'x', category: 'toString' as any } })).toBeNull();
    expect(resolveAllergen('c1', { c1: null as any })).toBeNull();
  });
});

describe('savedAllergensInCategory / dominantLabel', () => {
  const profile = {
    allergens: { oak: 'mild' as const, birch: 'severe' as const, ragweed: 'moderate' as const },
  };

  it('lists saved allergens in a category, most severe first', () => {
    expect(savedAllergensInCategory('tree', profile).map((a) => a.id)).toEqual(['birch', 'oak']);
  });

  it("names the user's own trigger in the highest category, or the category", () => {
    expect(dominantLabel({ tree: 70, grass: 10, weed: 20 }, profile)).toBe('Birch Tree');
    expect(dominantLabel({ tree: 10, grass: 70, weed: 20 }, profile)).toBe('Grass pollen');
    expect(dominantLabel({ tree: null, grass: null, weed: null }, profile)).toBeNull();
  });
});
