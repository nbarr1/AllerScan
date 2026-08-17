import { AllergenItem } from '../types';

export const MASTER_ALLERGENS: AllergenItem[] = [
  // TREES
  {
    id: 'oak',
    name: 'Oak Tree',
    scientificName: 'Quercus spp.',
    category: 'tree',
    season: 'Spring (March – May)',
    peakMonths: [2, 3, 4],
    commonLocations: 'Widespread across North America, Europe, East Asia. Parks, suburban streets, forests.',
    description: 'Oak trees produce vast quantities of fine, yellow pollen carried long distances by wind. A major spring allergen.',
    imageUrl: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'birch',
    name: 'Birch Tree',
    scientificName: 'Betula spp.',
    category: 'tree',
    season: 'Spring (April – May)',
    peakMonths: [3, 4],
    commonLocations: 'Cooler temperate regions, northern US, Canada, Northern Europe.',
    description: 'Birch pollen is extremely potent and strongly associated with Oral Allergy Syndrome (OAS) to apples, carrots, and celery.',
    imageUrl: 'https://images.unsplash.com/photo-1508873696983-2df515122519?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'cedar',
    name: 'Mountain Cedar / Juniper',
    scientificName: 'Juniperus ashei',
    category: 'tree',
    season: 'Winter (December – February)',
    peakMonths: [11, 0, 1],
    commonLocations: 'Texas, Southwestern US, Mediterranean regions.',
    description: 'Causes "Cedar Fever". Known for sudden intense winter pollen surges that coat cars and buildings in thick dust.',
    imageUrl: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'pine',
    name: 'Pine Tree',
    scientificName: 'Pinus spp.',
    category: 'tree',
    season: 'Late Spring (May – June)',
    peakMonths: [4, 5],
    commonLocations: 'Pine forests, coastal plains, mountain belts globally.',
    description: 'Produces large yellow pollen grains. Though visually dramatic, pine pollen is moderately allergenic compared to oak or birch.',
    imageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'maple',
    name: 'Maple Tree',
    scientificName: 'Acer spp.',
    category: 'tree',
    season: 'Early Spring (March – April)',
    peakMonths: [2, 3],
    commonLocations: 'Deciduous forests, residential avenues across Eastern US, Canada, Europe.',
    description: 'Blooms before leafing out. Wind-borne pollen causes early spring rhinitis.',
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'elm',
    name: 'Elm Tree',
    scientificName: 'Ulmus spp.',
    category: 'tree',
    season: 'Early Spring & Fall',
    peakMonths: [1, 2, 8, 9],
    commonLocations: 'Urban parks, riverbanks, roadside rows.',
    description: 'Some species pollinate in late winter/early spring while others bloom in late summer/fall.',
    imageUrl: 'https://images.unsplash.com/photo-1511497584788-876761c11969?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'ash',
    name: 'Ash Tree',
    scientificName: 'Fraxinus spp.',
    category: 'tree',
    season: 'Spring (April – May)',
    peakMonths: [3, 4],
    commonLocations: 'Wet woodlands, city shade trees, Midwest and Eastern US.',
    description: 'Cross-reactive with olive and privet pollen. High allergenicity during peak spring bloom.'
    // No imageUrl: the previous photo (a river landscape) did not actually depict an Ash Tree
    // and was removed rather than guessed at without a verified replacement.
  },

  // GRASSES
  {
    id: 'bermuda_grass',
    name: 'Bermuda Grass',
    scientificName: 'Cynodon dactylon',
    category: 'grass',
    season: 'Late Spring to Autumn (May – October)',
    peakMonths: [4, 5, 6, 7, 8, 9],
    commonLocations: 'Lawns, golf courses, pastures in warm, sunny climates (Southern US, Australia, S. Europe).',
    description: 'Extremely resilient warm-season grass with heavy pollen shedding during hot summer months.',
    imageUrl: 'https://images.unsplash.com/photo-1533460004989-acf010683158?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'timothy_grass',
    name: 'Timothy Grass',
    scientificName: 'Phleum pratense',
    category: 'grass',
    season: 'Early Summer (June – July)',
    peakMonths: [5, 6],
    commonLocations: 'Cooler northern regions, hay meadows, agricultural fields.',
    description: 'Major cause of hay fever in temperate zones. Distinctive cylindrical flower spikes.',
    imageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'kentucky_bluegrass',
    name: 'Kentucky Bluegrass',
    scientificName: 'Poa pratensis',
    category: 'grass',
    season: 'Late Spring (May – June)',
    peakMonths: [4, 5],
    commonLocations: 'Widely planted suburban lawns and athletic fields throughout US and Europe.',
    description: 'Cool-season turfgrass producing abundant airborne pollen in late spring.',
    imageUrl: 'https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'ryegrass',
    name: 'Perennial Ryegrass',
    scientificName: 'Lolium perenne',
    category: 'grass',
    season: 'Spring to Early Summer',
    peakMonths: [4, 5, 6],
    commonLocations: 'Lawns, pastures, roadside verges.',
    description: 'Fast-growing grass used in seed mixes. Strong allergen cross-reactivity with timothy and meadow grass.',
    imageUrl: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=600&q=80'
  },

  // WEEDS
  {
    id: 'ragweed',
    name: 'Ragweed',
    scientificName: 'Ambrosia artemisiifolia',
    category: 'weed',
    season: 'Late Summer to Fall (August – October)',
    peakMonths: [7, 8, 9],
    commonLocations: 'Vacant lots, roadsides, farmland, disturbed soils across North America and Eastern Europe.',
    description: 'The #1 cause of autumn hay fever. A single plant can produce up to 1 billion light pollen grains capable of traveling hundreds of miles.',
    imageUrl: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'sagebrush',
    name: 'Sagebrush / Mugwort',
    scientificName: 'Artemisia spp.',
    category: 'weed',
    season: 'Late Summer & Fall (August – September)',
    peakMonths: [7, 8],
    commonLocations: 'Arid western plains, dry hillsides, urban scrubland.',
    description: 'Highly aromatic weed with small wind-pollinated flowers. Cross-reactive with celery, spices, and chamomile.'
    // No imageUrl: the previous photo (a field of orange poppies) did not actually depict
    // Sagebrush/Mugwort and was removed rather than guessed at without a verified replacement.
  },
  {
    id: 'pigweed',
    name: 'Pigweed / Amaranth',
    scientificName: 'Amaranthus spp.',
    category: 'weed',
    season: 'Summer to Autumn (July – October)',
    peakMonths: [6, 7, 8, 9],
    commonLocations: 'Agricultural crops, gardens, open fields.',
    description: 'Coarse upright weed blooming throughout warm summer and fall months.',
    imageUrl: 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'english_plantain',
    name: 'English Plantain',
    scientificName: 'Plantago lanceolata',
    category: 'weed',
    season: 'May to September',
    peakMonths: [4, 5, 6, 7],
    commonLocations: 'Lawns, footpaths, meadows, disturbed grounds.',
    description: 'Common lawn weed with spike-like flower heads that shed pollen all summer long.',
    imageUrl: 'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?auto=format&fit=crop&w=600&q=80'
  },

  // MOLDS
  {
    id: 'alternaria',
    name: 'Alternaria Mold',
    scientificName: 'Alternaria alternata',
    category: 'mold',
    season: 'Summer & Autumn (July – October)',
    peakMonths: [6, 7, 8, 9],
    commonLocations: 'Decaying vegetation, outdoor soil, damp window sills, carpets.',
    description: 'One of the most common outdoor mold spores, peaking on dry, windy summer afternoons after rain.',
    imageUrl: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'cladosporium',
    name: 'Cladosporium Mold',
    scientificName: 'Cladosporium herbarum',
    category: 'mold',
    season: 'Year-round (Peaks in Summer)',
    peakMonths: [5, 6, 7, 8],
    commonLocations: 'Dead leaves, plants, damp bathrooms, air conditioning ducts.',
    description: 'The most abundant airborne fungus worldwide. Spore counts skyrocket in warm, humid weather.',
    imageUrl: 'https://images.unsplash.com/photo-1541689592655-f5f52825a3b8?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'aspergillus',
    name: 'Aspergillus Mold',
    scientificName: 'Aspergillus fumigatus',
    category: 'mold',
    season: 'Year-round (Highest in Autumn/Winter indoors)',
    peakMonths: [9, 10, 11, 0],
    commonLocations: 'Compost piles, indoor dust, heating vents, stored grain.',
    description: 'Ubiquitous indoor/outdoor mold. Can trigger allergic bronchopulmonary reactions in sensitive individuals.',
    imageUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80'
  },

  // INDOOR / OTHER
  {
    id: 'dust_mites',
    name: 'Dust Mites',
    scientificName: 'Dermatophagoides pteronyssinus',
    category: 'indoor',
    season: 'Year-round (Peaks in humid seasons)',
    peakMonths: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    commonLocations: 'Mattresses, pillows, upholstered furniture, plush toys, carpets.',
    description: 'Microscopic arthropods thriving in household dust and high humidity (>50% RH). Major indoor trigger.',
    imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'pet_dander_cat',
    name: 'Cat Dander (Fel d 1)',
    scientificName: 'Felis catus allergen',
    category: 'indoor',
    season: 'Year-round',
    peakMonths: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    commonLocations: 'Indoor homes with cats, public transit, school classrooms via clothing transfer.',
    description: 'Sticky protein secreted by cat skin and saliva. Remains airborne for hours and clings to fabrics.',
    imageUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'pet_dander_dog',
    name: 'Dog Dander (Can f 1)',
    scientificName: 'Canis lupus familiaris allergen',
    category: 'indoor',
    season: 'Year-round',
    peakMonths: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    commonLocations: 'Indoor homes with dogs, dog parks, pet grooming facilities.',
    description: 'Proteins shed in skin flakes, dander, and dried saliva. Shedding varies by breed and season.',
    imageUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80'
  }
];

export const ALLERGEN_CATEGORIES = [
  { key: 'tree', label: 'Trees', icon: 'Trees', description: 'Spring bloomers with lightweight windborne pollen' },
  { key: 'grass', label: 'Grasses', icon: 'Wheat', description: 'Late spring & summer turfgrass shedding' },
  { key: 'weed', label: 'Weeds', icon: 'Flower2', description: 'Late summer & fall heavy hay-fever triggers' },
  { key: 'mold', label: 'Molds & Fungi', icon: 'Biohazard', description: 'Spores thriving in warmth, humidity & decomposing organic matter' },
  { key: 'indoor', label: 'Indoor / Other', icon: 'Home', description: 'Dust mites, pet proteins, and indoor environmental factors' }
] as const;
