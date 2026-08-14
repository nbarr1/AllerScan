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
  sensitivityFactor: number; // 1 to 3 modifier
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
  dataSource?: string;
  weather?: LiveWeatherData;
  overallPersonalRiskScore: number; // 0 - 100
  riskCategory: 'Low' | 'Moderate' | 'High' | 'Very High';
  aqi: AirQualityData;
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
  timestamp: string;
  imageUrl: string;
  speciesName: string;
  scientificName: string;
  category: AllergenCategory | 'non_allergen';
  confidence: number; // 0 - 100 percentage
  isUserAllergen: boolean;
  matchedAllergenId?: string;
  userSeverity?: SeverityLevel;
  details: string;
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
  type: 'park' | 'urban' | 'botanical' | 'suburban' | 'greenbelt' | 'sensor_station';
  lat: number;
  lng: number;
  overallRisk: 'Low' | 'Moderate' | 'High' | 'Very High';
  overallScore: number; // 0 - 100
  pollenCountGrains: number; // grains/m3
  treePollen: number;
  grassPollen: number;
  weedPollen: number;
  moldCount: number;
  aqi: number;
  dominantSpecies: string;
  dominantCategory: AllergenCategory;
  isProfileMatch: boolean;
  matchedUserAllergen?: string;
  userSeverity?: SeverityLevel;
  windSpeedMph: number;
  windDirection: string;
  temperatureF: number;
  humidityPct: number;
  advisory: string;
}

