import { EnvironmentalData, SeverityLevel, CustomAllergenMeta } from '../types';

export function generateFallbackEnvData(
  locationName: string,
  userAllergens: Record<string, SeverityLevel> = {},
  lat = 30.2672,
  lng = -97.7431,
  customAllergens: Record<string, CustomAllergenMeta> = {}
): EnvironmentalData {
  // Deterministic calculation based on latitude/longitude and user allergens
  const now = new Date();
  const month = now.getMonth(); // 0 to 11

  // Seasonal multipliers
  const springMultiplier = (month >= 2 && month <= 5) ? 1.5 : 0.8;
  const fallMultiplier = (month >= 7 && month <= 10) ? 1.6 : 0.7;
  const summerMultiplier = (month >= 4 && month <= 8) ? 1.4 : 0.8;

  const rawTree = Math.min(95, Math.max(15, Math.round((35 + Math.abs(Math.sin(lat * 5)) * 40) * springMultiplier)));
  const rawGrass = Math.min(95, Math.max(15, Math.round((30 + Math.abs(Math.cos(lng * 4)) * 35) * summerMultiplier)));
  const rawWeed = Math.min(95, Math.max(15, Math.round((28 + Math.abs(Math.sin(lng * 7)) * 42) * fallMultiplier)));
  const rawMold = Math.min(90, Math.max(12, Math.round(22 + Math.abs(Math.cos(lat * 3)) * 30)));

  const getPollenLevel = (val: number): 'Low' | 'Moderate' | 'High' | 'Very High' => {
    if (val >= 70) return 'Very High';
    if (val >= 50) return 'High';
    if (val >= 30) return 'Moderate';
    return 'Low';
  };

  const allergenCategoryMap: Record<string, { val: number; level: 'Low' | 'Moderate' | 'High' | 'Very High'; name: string; cat: 'tree' | 'grass' | 'weed' | 'mold' | 'indoor' }> = {
    oak: { val: rawTree, level: getPollenLevel(rawTree), name: 'Oak Tree', cat: 'tree' },
    birch: { val: rawTree, level: getPollenLevel(rawTree), name: 'Birch Tree', cat: 'tree' },
    cedar: { val: rawTree, level: getPollenLevel(rawTree), name: 'Mountain Cedar', cat: 'tree' },
    pine: { val: rawTree, level: getPollenLevel(rawTree), name: 'Pine Tree', cat: 'tree' },
    maple: { val: rawTree, level: getPollenLevel(rawTree), name: 'Maple Tree', cat: 'tree' },
    elm: { val: rawTree, level: getPollenLevel(rawTree), name: 'Elm Tree', cat: 'tree' },
    ash: { val: rawTree, level: getPollenLevel(rawTree), name: 'Ash Tree', cat: 'tree' },
    bermuda_grass: { val: rawGrass, level: getPollenLevel(rawGrass), name: 'Bermuda Grass', cat: 'grass' },
    timothy_grass: { val: rawGrass, level: getPollenLevel(rawGrass), name: 'Timothy Grass', cat: 'grass' },
    kentucky_bluegrass: { val: rawGrass, level: getPollenLevel(rawGrass), name: 'Kentucky Bluegrass', cat: 'grass' },
    ryegrass: { val: rawGrass, level: getPollenLevel(rawGrass), name: 'Perennial Ryegrass', cat: 'grass' },
    ragweed: { val: rawWeed, level: getPollenLevel(rawWeed), name: 'Ragweed', cat: 'weed' },
    sagebrush: { val: rawWeed, level: getPollenLevel(rawWeed), name: 'Sagebrush', cat: 'weed' },
    pigweed: { val: rawWeed, level: getPollenLevel(rawWeed), name: 'Pigweed', cat: 'weed' },
    english_plantain: { val: rawWeed, level: getPollenLevel(rawWeed), name: 'English Plantain', cat: 'weed' },
    alternaria: { val: rawMold, level: getPollenLevel(rawMold), name: 'Alternaria Mold', cat: 'mold' },
    cladosporium: { val: rawMold, level: getPollenLevel(rawMold), name: 'Cladosporium Mold', cat: 'mold' },
    aspergillus: { val: rawMold, level: getPollenLevel(rawMold), name: 'Aspergillus Mold', cat: 'mold' },
    dust_mites: { val: 35, level: 'Moderate', name: 'Dust Mites', cat: 'indoor' },
    pet_dander_cat: { val: 40, level: 'Moderate', name: 'Cat Dander', cat: 'indoor' },
    pet_dander_dog: { val: 40, level: 'Moderate', name: 'Dog Dander', cat: 'indoor' },
  };

  // Custom user-added allergens have no species-level reading; approximate them using
  // their chosen category's aggregate index, same as the live /api/pollen-aqi endpoint.
  const categoryLevelMap: Record<'tree' | 'grass' | 'weed' | 'mold' | 'indoor', { val: number; level: 'Low' | 'Moderate' | 'High' | 'Very High' }> = {
    tree: { val: rawTree, level: getPollenLevel(rawTree) },
    grass: { val: rawGrass, level: getPollenLevel(rawGrass) },
    weed: { val: rawWeed, level: getPollenLevel(rawWeed) },
    mold: { val: rawMold, level: getPollenLevel(rawMold) },
    indoor: { val: 35, level: 'Moderate' },
  };

  Object.entries(customAllergens).forEach(([algId, meta]) => {
    const catVal = categoryLevelMap[meta.category] || categoryLevelMap.indoor;
    allergenCategoryMap[algId] = { ...catVal, name: meta.name, cat: meta.category };
  });

  const matchedActiveAllergens: Array<{
    id: string;
    name: string;
    category: 'tree' | 'grass' | 'weed' | 'mold' | 'indoor';
    userSeverity: SeverityLevel;
    currentLevel: 'Low' | 'Moderate' | 'High' | 'Very High';
    currentValue: number;
  }> = [];

  let totalWeightedScore = 0;
  let totalWeight = 0;

  Object.entries(userAllergens).forEach(([algId, severity]) => {
    const meta = allergenCategoryMap[algId];
    if (meta) {
      const severityWeight = severity === 'severe' ? 3 : severity === 'moderate' ? 2 : 1;
      totalWeightedScore += meta.val * severityWeight;
      totalWeight += severityWeight;

      if (meta.val >= 30) {
        matchedActiveAllergens.push({
          id: algId,
          name: meta.name,
          category: meta.cat,
          userSeverity: severity,
          currentLevel: meta.level,
          currentValue: meta.val,
        });
      }
    }
  });

  const overallScore = totalWeight > 0
    ? Math.round(totalWeightedScore / totalWeight)
    : Math.round((rawTree + rawGrass + rawWeed + rawMold) / 4);

  let riskCategory: 'Low' | 'Moderate' | 'High' | 'Very High' = 'Low';
  if (overallScore >= 70) riskCategory = 'Very High';
  else if (overallScore >= 50) riskCategory = 'High';
  else if (overallScore >= 30) riskCategory = 'Moderate';

  const aqiVal = Math.round(35 + Math.abs(Math.sin(lat * 10)) * 30);

  // This fallback runs entirely offline in the browser, so there's no way to look up the
  // selected location's real time zone. Be honest about it: show the device's own local time
  // (what Date/toLocaleTimeString already use by default) and label it as such, rather than
  // silently implying it reflects the selected location.
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzParts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(now);
  const timeZoneAbbr = tzParts.find((p) => p.type === 'timeZoneName')?.value || deviceTimeZone;

  const forecast = [];
  for (let i = 0; i < 5; i++) {
    const dateObj = new Date(Date.now() + i * 86400000);
    const dayName = i === 0 ? "Today" : i === 1 ? "Tomorrow" : dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const dayTree = Math.min(95, Math.max(10, Math.round(rawTree + (i * 2 - 3))));
    const dayGrass = Math.min(95, Math.max(10, Math.round(rawGrass + (i * 3 - 4))));
    const dayWeed = Math.min(95, Math.max(10, Math.round(rawWeed - (i * 2))));
    const dayMold = Math.min(90, Math.max(10, Math.round(rawMold + (i * 2 - 2))));
    const dayOverall = Math.round((dayTree + dayGrass + dayWeed + dayMold) / 4);

    forecast.push({
      dayName,
      date: dateStr,
      riskLevel: getPollenLevel(dayOverall),
      overallScore: dayOverall,
      tree: dayTree,
      grass: dayGrass,
      weed: dayWeed,
      mold: dayMold,
      dominantAllergen: rawWeed > rawTree && rawWeed > rawGrass ? "Ragweed" : rawTree > rawGrass ? "Oak Tree" : "Bermuda Grass",
    });
  }

  return {
    locationName: locationName.split(',')[0] || "Austin",
    updatedAt: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timeZoneAbbr,
    timeZoneNote: `Live time zone data for ${locationName.split(',')[0] || 'this location'} is unavailable right now — showing your device's local time (${deviceTimeZone}) instead.`,
    dataSource: "Seasonal Atmospheric Model",
    weather: {
      temperatureF: 76,
      humidityPct: 52,
      apparentTempF: 77,
      windSpeedMph: 8,
      windDirection: "SSE",
      weatherDescription: "Partly cloudy",
    },
    overallPersonalRiskScore: overallScore,
    riskCategory,
    aqi: {
      aqi: aqiVal,
      category: aqiVal > 100 ? 'Unhealthy for Sensitive' : aqiVal > 50 ? 'Moderate' : 'Good',
      pm25: Number((aqiVal * 0.28).toFixed(1)),
      pm10: Number((aqiVal * 0.45).toFixed(1)),
      ozone: Number((aqiVal * 0.32).toFixed(1)),
    },
    pollen: {
      tree: {
        level: getPollenLevel(rawTree),
        value: rawTree,
        trend: rawTree > 50 ? 'rising' : 'stable',
        topSpecies: ['Oak Tree', 'Birch Tree', 'Cedar Tree'],
      },
      grass: {
        level: getPollenLevel(rawGrass),
        value: rawGrass,
        trend: rawGrass > 50 ? 'rising' : 'falling',
        topSpecies: ['Bermuda Grass', 'Kentucky Bluegrass'],
      },
      weed: {
        level: getPollenLevel(rawWeed),
        value: rawWeed,
        trend: rawWeed > 60 ? 'rising' : 'stable',
        topSpecies: ['Ragweed', 'Sagebrush'],
      },
      mold: {
        level: getPollenLevel(rawMold),
        value: rawMold,
        trend: 'stable',
        topSpecies: ['Alternaria', 'Cladosporium'],
      },
    },
    matchedActiveAllergens,
    recommendations: [
      riskCategory === 'High' || riskCategory === 'Very High'
        ? "Keep windows closed today and use air conditioning on recirculate."
        : "Moderate allergen risk today. Check forecast before planning long outdoor runs.",
      "Shower and change clothes after returning from prolonged outdoor exposure.",
      "Use saline nasal rinse following outdoor walks to clear settled allergens.",
    ],
    forecast,
  };
}
