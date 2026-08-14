export interface ScanPresetSample {
  id: string;
  title: string;
  categoryName: string;
  imageUrl: string;
  speciesName: string;
  scientificName: string;
  confidence: number;
  matchedAllergenId: string;
  category: 'tree' | 'grass' | 'weed' | 'mold' | 'indoor' | 'non_allergen';
  details: string;
  identifyingFeatures: string[];
}

export const SCAN_PRESET_SAMPLES: ScanPresetSample[] = [
  {
    id: 'sample_ragweed',
    title: 'Ragweed Leaf & Spike',
    categoryName: 'Weeds',
    imageUrl: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=80',
    speciesName: 'Common Ragweed',
    scientificName: 'Ambrosia artemisiifolia',
    confidence: 94,
    matchedAllergenId: 'ragweed',
    category: 'weed',
    details: 'Fern-like deeply lobed leaves with small green floral spikes at stem tips. High pollen emission season active.',
    identifyingFeatures: ['Deeply dissected fern-like leaves', 'Greenish yellow flower spikes', 'Branching hairy stems']
  },
  {
    id: 'sample_bermuda',
    title: 'Bermuda Grass Turf',
    categoryName: 'Grasses',
    imageUrl: 'https://images.unsplash.com/photo-1533460004989-acf010683158?auto=format&fit=crop&w=800&q=80',
    speciesName: 'Bermuda Grass',
    scientificName: 'Cynodon dactylon',
    confidence: 91,
    matchedAllergenId: 'bermuda_grass',
    category: 'grass',
    details: 'Coarse dense stoloniferous turfgrass with finger-like whorled flower spikes emitting summer pollen.',
    identifyingFeatures: ['Fine wire-like runners (stolons)', '3-7 finger-like seed heads', 'Short grey-green blades']
  },
  {
    id: 'sample_oak',
    title: 'White Oak Foliage',
    categoryName: 'Trees',
    imageUrl: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=800&q=80',
    speciesName: 'White Oak Tree',
    scientificName: 'Quercus alba',
    confidence: 88,
    matchedAllergenId: 'oak',
    category: 'tree',
    details: 'Deeply lobed leaves with rounded tips. Yellow hanging catkins shed windborne tree pollen during spring.',
    identifyingFeatures: ['Rounded lobed leaf margins', 'Hanging yellowish floral catkins', 'Fissured grey bark']
  },
  {
    id: 'sample_mold',
    title: 'Outdoor Leaf Mold',
    categoryName: 'Molds',
    imageUrl: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=800&q=80',
    speciesName: 'Alternaria / Cladosporium Mold',
    scientificName: 'Alternaria alternata',
    confidence: 85,
    matchedAllergenId: 'alternaria',
    category: 'mold',
    details: 'Dark velvety fungal colonies visible on decaying plant matter and damp organic surfaces.',
    identifyingFeatures: ['Dark olive-black powdery spots', 'Spores on leaf surfaces', 'High humidity association']
  },
  {
    id: 'sample_maple',
    title: 'Sugar Maple Leaf',
    categoryName: 'Trees',
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
    speciesName: 'Sugar Maple',
    scientificName: 'Acer saccharum',
    confidence: 93,
    matchedAllergenId: 'maple',
    category: 'tree',
    details: 'Palmate 5-lobed leaves with U-shaped notches between lobes. Early spring pollen producer.',
    identifyingFeatures: ['Classic 5-pointed palmate shape', 'Smooth leaf notches', 'Paired winged seeds (samaras)']
  }
];
