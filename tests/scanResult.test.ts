import { describe, expect, it } from 'vitest';
import { normalizeScanResult } from '../server/scanResult';

describe('normalizeScanResult', () => {
  it('keeps a well-formed result', () => {
    expect(
      normalizeScanResult({
        speciesName: 'White Oak',
        scientificName: 'Quercus alba',
        category: 'tree',
        confidence: 92,
        matchedAllergenId: 'oak',
        identifyingFeatures: ['Lobed leaves', 'Acorns'],
        details: 'Heavy spring pollen producer.',
      })
    ).toEqual({
      speciesName: 'White Oak',
      scientificName: 'Quercus alba',
      category: 'tree',
      confidence: 92,
      matchedAllergenId: 'oak',
      identifyingFeatures: ['Lobed leaves', 'Acorns'],
      details: 'Heavy spring pollen producer.',
    });
  });

  it.each([null, undefined, 'oak', [], {}, { speciesName: '   ' }, { speciesName: 42 }])(
    'rejects %j, which names no species',
    (raw) => {
      expect(normalizeScanResult(raw)).toBeNull();
    }
  );

  it('drops fields that would not render as text', () => {
    const result = normalizeScanResult({
      speciesName: 'Ragweed',
      scientificName: { genus: 'Ambrosia' },
      details: { text: 'nested' },
      identifyingFeatures: ['Fern-like leaves', { trait: 'x' }, 7, '  '],
    });
    expect(result).toMatchObject({ scientificName: '', details: '', identifyingFeatures: ['Fern-like leaves'] });
  });

  it('maps an unknown or differently cased category', () => {
    expect(normalizeScanResult({ speciesName: 'Oak', category: 'Tree' })?.category).toBe('tree');
    expect(normalizeScanResult({ speciesName: 'Rock', category: 'mineral' })?.category).toBe('non_allergen');
  });

  it('clamps confidence and omits it when it is not a number', () => {
    expect(normalizeScanResult({ speciesName: 'Oak', confidence: 140 })?.confidence).toBe(100);
    expect(normalizeScanResult({ speciesName: 'Oak', confidence: -3 })?.confidence).toBe(0);
    expect(normalizeScanResult({ speciesName: 'Oak', confidence: '90' })).not.toHaveProperty('confidence');
  });

  it.each(['none', 'constructor', '__proto__', 'Oak Tree', ''])('drops a matched id of %j', (id) => {
    expect(normalizeScanResult({ speciesName: 'Oak', matchedAllergenId: id })).not.toHaveProperty(
      'matchedAllergenId'
    );
  });
});
