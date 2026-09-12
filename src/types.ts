export type SeverityLevel = 'mild' | 'moderate' | 'severe';

export type AllergenCategory = 'tree' | 'grass' | 'weed' | 'mold' | 'indoor';

export interface AllergenItem {
  id: string;
  name: string;
  scientificName: string;
  category: AllergenCategory;
  season: string; // e.g., "Spring (March - May)"
  peakMonths: number[]; // 0-indexed months (0 = Jan, 11 = Dec)
  commonLocations: string;
  description: string;
  imageUrl?: string;
  selected?: boolean;
  severity?: SeverityLevel;
}

export interface CustomAllergenMeta {
  name: string;
  category: AllergenCategory;
}

export interface UserAllergenProfile {
  allergens: Record<string, SeverityLevel>; // allergenId -> severity
  // Display name + category for allergen IDs not present in the built-in MASTER_ALLERGENS
  // database (i.e. user-added custom triggers). Required to match and score them.
  customAllergens?: Record<string, CustomAllergenMeta>;
  location: {
    cityName: string;
    region: string;
    lat: number;
    lng: number;
  };
  // 1 (less reactive than typical) to 3 (more reactive). Sent to /api/pollen-aqi and
  // applied to the personal risk score; 2 is neutral.
  sensitivityFactor: number;
  onboarded: boolean;
}

export interface PollenCategoryScore {
  level: 'Low' | 'Moderate' | 'High' | 'Very High';
  value: number; // 0 - 100
  trend: 'rising' | 'stable' | 'falling';
  topSpecies: string[];
}

export interface AirQualityData {
  aqi: number; // 0 - 500
  category: 'Good' | 'Moderate' | 'Unhealthy for Sensitive' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous';
  pm25: number;
  pm10: number;
  ozone: number;
}

export interface DailyPollenForecast {
  dayName: string;
  date: string;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Very High';
  overallScore: number; // 0 - 100
  tree: number;
  grass: number;
  weed: number;
  mold: number;
  dominantAllergen: string;
}

export interface LiveWeatherData {
  temperatureF: number;
  humidityPct: number;
  apparentTempF: number;
  windSpeedMph: number;
  windDirection: string;
  weatherDescription: string;
}

export interface EnvironmentalData {
  locationName: string;
  updatedAt: string;
  // Short label for the time zone `updatedAt` is expressed in (e.g. "CDT", "JST", "UTC").
  timeZoneAbbr?: string;
  // Present only when the displayed time could not be confirmed to match the selected
  // location's actual time zone (e.g. live geocoding/timezone lookup failed), so the UI
  // can disclose exactly what time zone is being shown instead of silently mismatching.
  timeZoneNote?: string;
  // Where the weather/AQI figures came from. Tracked separately from `pollenDataSource`
  // because the two can disagree: Open-Meteo's weather call can succeed for a point its
  // pollen sensors don't cover, and a "Live" label over modelled pollen would be a lie.
  dataSource?: string;
  // Where the tree/grass/weed/mold index numbers actually came from.
  pollenDataSource?: string;
  // True when the pollen numbers are a seasonal/geographic estimate rather than a reading,
  // so the UI can label them without string-matching the source name.
  pollenIsModeled?: boolean;
  weather?: LiveWeatherData;
  overallPersonalRiskScore: number; // 0 - 100
  riskCategory: 'Low' | 'Moderate' | 'High' | 'Very High';
  // Absent when no live air-quality reading was available. The offline estimate omits it rather
  // than deriving a plausible-looking AQI from coordinates.
  aqi?: AirQualityData;
  pollen: {
    tree: PollenCategoryScore;
    grass: PollenCategoryScore;
    weed: PollenCategoryScore;
    mold: PollenCategoryScore;
  };
  matchedActiveAllergens: Array<{
    id: string;
    name: string;
    category: AllergenCategory;
    userSeverity: SeverityLevel;
    currentLevel: 'Low' | 'Moderate' | 'High' | 'Very High';
    currentValue: number;
  }>;
  recommendations: string[];
  forecast: DailyPollenForecast[];
}

export interface ScanResult {
  id: string;
  // ISO 8601 instant. Formatted for display at render time — an entry stored as
  // "10:42 AM Today" still claims to be from today a week later.
  timestamp: string;
  imageUrl: string;
  speciesName: string;
  scientificName: string;
  category: AllergenCategory | 'non_allergen';
  // Omitted when the identifying model didn't report one. Never substitute a plausible
  // default: a made-up "88%" reads as a measurement.
  confidence?: number; // 0 - 100 percentage
  isUserAllergen: boolean;
  matchedAllergenId?: string;
  userSeverity?: SeverityLevel;
  details: string;
  // Empty when the model didn't report any; the UI omits the section rather than
  // inventing generic botanical filler.
  identifyingFeatures: string[];
  locationStr: string;
  isSimulatedResult?: boolean; // true when Gemini vision was unavailable and a fallback example was returned instead of real analysis
}

export interface ShotLog {
  id: string;
  date: string;
  time: string;
  arm: 'Left Arm' | 'Right Arm' | 'Both';
  dosage: string;
  reactionSeverity: 'None' | 'Mild Local' | 'Moderate Local' | 'Systemic';
  reactionDetails?: string;
  completed: boolean;
}

export interface ImmunotherapySchedule {
  enabled: boolean;
  phase: 'build-up' | 'maintenance';
  intervalDays: number; // e.g. 7 for weekly, 14, 21, 28
  nextShotDate: string; // ISO string YYYY-MM-DD
  defaultArm: 'Left Arm' | 'Right Arm' | 'Alternating';
  allergistInfo: {
    doctorName: string;
    clinicName: string;
    phone: string;
    email: string;
    address: string;
  };
  shotHistory: ShotLog[];
}

export interface SymptomLog {
  id: string;
  date: string; // YYYY-MM-DD
  severityScore: number; // 0 (none) to 4 (severe)
  sneezing: boolean;
  wateryEyes: boolean;
  congestion: boolean;
  itchyThroat: boolean;
  fatigue: boolean;
  notes?: string;
}

export interface NotificationSettings {
  pollenAlerts: boolean;
  aqiAlerts: boolean;
  shotReminders: boolean;
  dailySummary: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string; // "07:00"
  minSeverityTrigger: SeverityLevel;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'pollen' | 'aqi' | 'shot' | 'scan';
  timestamp: string;
  read: boolean;
  severity: 'info' | 'warning' | 'alert';
}

export interface PollenHotspot {
  id: string;
  name: string;
  address?: string;
  type: 'park' | 'urban' | 'botanical' | 'suburban' | 'greenbelt' | 'sensor_station';
  lat: number;
  lng: number;
  overallRisk: 'Low' | 'Moderate' | 'High' | 'Very High';
  overallScore: number; // 0 - 100
  // Real grains/m3 reading, only present when a live sensor actually reported one for the
  // dominant category at this exact point — never a computed/illustrative estimate.
  pollenCountGrains?: number;
  treePollen: number;
  grassPollen: number;
  weedPollen: number;
  moldCount: number;
  // Omitted when the live weather/air-quality feed didn't answer for this area. Absent is
  // honest; a default 75 °F reads as a measurement.
  aqi?: number;
  // A regional default name for the dominant category, not a measured species — live
  // sources report a category index, not per-point species. The UI must present it as a
  // category-level label, and name `matchedUserAllergen` when calling something a match.
  dominantSpecies: string;
  dominantCategory: AllergenCategory;
  // Where this location's pollen reading actually came from (e.g. "Live Google Maps Pollen
  // API", "Live Open-Meteo Pollen Sensors", or a clearly-labeled seasonal model as last resort).
  dataSource: string;
  isProfileMatch: boolean;
  matchedUserAllergen?: string;
  userSeverity?: SeverityLevel;
  windSpeedMph?: number;
  windDirection?: string;
  temperatureF?: number;
  humidityPct?: number;
  advisory: string;
}

