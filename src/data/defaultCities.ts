export interface CityOption {
  cityName: string;
  region: string;
  lat: number;
  lng: number;
}

// Shared fallback/starter city list used by the location search UI (Header) and the
// server's /api/location-search endpoint (as its empty-query default and final fallback
// when live geocoding is unavailable). Keep this as the single source of truth.
export const DEFAULT_CITY_OPTIONS: CityOption[] = [
  { cityName: 'Austin', region: 'Texas, USA', lat: 30.2672, lng: -97.7431 },
  { cityName: 'New York', region: 'New York, USA', lat: 40.7128, lng: -74.0060 },
  { cityName: 'Los Angeles', region: 'California, USA', lat: 34.0522, lng: -118.2437 },
  { cityName: 'Chicago', region: 'Illinois, USA', lat: 41.8781, lng: -87.6298 },
  { cityName: 'Miami', region: 'Florida, USA', lat: 25.7617, lng: -80.1918 },
  { cityName: 'Denver', region: 'Colorado, USA', lat: 39.7392, lng: -104.9903 },
  { cityName: 'Seattle', region: 'Washington, USA', lat: 47.6062, lng: -122.3321 },
  { cityName: 'London', region: 'United Kingdom', lat: 51.5074, lng: -0.1278 },
];
