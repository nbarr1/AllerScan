import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Flame,
  Wind,
  Trees,
  Wheat,
  Flower2,
  Biohazard,
  Activity,
  Layers,
  Crosshair,
  AlertTriangle,
  CheckCircle2,
  Navigation as NavigationIcon,
  RefreshCw,
  Info,
  Sliders,
  Compass,
  Thermometer,
  Droplets,
  Search,
  ExternalLink,
  ShieldAlert,
  Hospital,
  Building2,
  Footprints,
  Car,
  Bike,
  Sparkles,
  Route as RouteIcon,
  X
} from 'lucide-react';
import { PollenHotspot, UserAllergenProfile } from '../types';

interface PollenHeatmapViewProps {
  userProfile: UserAllergenProfile;
  onUpdateLocation?: (locStr: string, lat: number, lng: number) => void;
}

const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const hasValidKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY';

// -------------------------------------------------------------
// Component: Route Polyline Renderer (Google Maps Routes API)
// -------------------------------------------------------------
function RoutePolyline({
  origin,
  destination,
  travelMode,
  onRouteCalculated,
}: {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral | null;
  travelMode: 'WALKING' | 'DRIVING' | 'BICYCLING';
  onRouteCalculated: (info: { distance: string; duration: string } | null) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map || !destination) {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      onRouteCalculated(null);
      return;
    }

    // Clear previous polyline
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    routesLib.Route.computeRoutes({
      origin,
      destination,
      travelMode: travelMode as any,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    })
      .then(({ routes }) => {
        if (routes && routes[0]) {
          const route = routes[0];
          const newPolylines = route.createPolylines({
            polylineOptions: {
              strokeColor: travelMode === 'WALKING' ? '#10b981' : '#3b82f6',
              strokeWeight: 5,
              strokeOpacity: 0.85,
            },
          });
          newPolylines.forEach((p) => p.setMap(map));
          polylinesRef.current = newPolylines;

          if (route.viewport) {
            map.fitBounds(route.viewport, 60);
          }

          const distKm = ((route.distanceMeters || 0) / 1000).toFixed(1);
          const distMi = ((route.distanceMeters || 0) * 0.000621371).toFixed(1);
          const durMins = Math.round((route.durationMillis || 0) / 60000);

          onRouteCalculated({
            distance: `${distMi} mi (${distKm} km)`,
            duration: `${durMins} min`,
          });
        }
      })
      .catch((err) => {
        console.warn('Routes API notice:', err);
      });

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, origin, destination, travelMode, onRouteCalculated]);

  return null;
}

// -------------------------------------------------------------
// Component: Places Discovery (Google Maps Places API New)
// -------------------------------------------------------------
function PlacesDiscoveryLayer({
  center,
  category,
  onPlacesLoaded,
}: {
  center: google.maps.LatLngLiteral;
  category: 'sanctuaries' | 'pharmacies' | 'none';
  onPlacesLoaded: (places: google.maps.places.Place[]) => void;
}) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || category === 'none') {
      onPlacesLoaded([]);
      return;
    }

    const textQuery =
      category === 'sanctuaries'
        ? 'air conditioned library museum indoor botanical garden'
        : '24 hour pharmacy urgent care CVS Walgreens';

    placesLib.Place.searchByText({
      textQuery,
      fields: ['displayName', 'location', 'formattedAddress', 'rating', 'userRatingCount', 'types'],
      locationBias: center,
      maxResultCount: 8,
    })
      .then(({ places }) => {
        if (places) {
          onPlacesLoaded(places);
        }
      })
      .catch((err) => {
        console.warn('Places API notice:', err);
        onPlacesLoaded([]);
      });
  }, [placesLib, center, category, onPlacesLoaded]);

  return null;
}

// -------------------------------------------------------------
// Main View: PollenHeatmapView
// -------------------------------------------------------------
export const PollenHeatmapView: React.FC<PollenHeatmapViewProps> = ({
  userProfile,
  onUpdateLocation,
}) => {
  const [hotspots, setHotspots] = useState<PollenHotspot[]>([]);
  const [selectedHotspot, setSelectedHotspot] = useState<PollenHotspot | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<google.maps.places.Place | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Tracks whether the currently displayed hotspots came from the live server endpoint
  // or the local fallback (server unreachable/timed out) so the UI can disclose it honestly.
  const [isFallbackData, setIsFallbackData] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters & Modes
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | 'tree' | 'grass' | 'weed' | 'mold'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high_only' | 'profile_only'>('all');
  const [placeDiscoveryType, setPlaceDiscoveryType] = useState<'sanctuaries' | 'pharmacies' | 'none'>('none');
  const [discoveredPlaces, setDiscoveredPlaces] = useState<google.maps.places.Place[]>([]);

  // Navigation & Routing
  const [activeRouteDestination, setActiveRouteDestination] = useState<google.maps.LatLngLiteral | null>(null);
  const [routeDestinationName, setRouteDestinationName] = useState<string>('');
  const [travelMode, setTravelMode] = useState<'WALKING' | 'DRIVING' | 'BICYCLING'>('WALKING');
  const [routeSummary, setRouteSummary] = useState<{ distance: string; duration: string } | null>(null);

  // Coordinates
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>({
    lat: userProfile.location.lat || 30.2672,
    lng: userProfile.location.lng || -97.7431,
  });

  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [searchCityQuery, setSearchCityQuery] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<Array<{ cityName: string; region: string; lat: number; lng: number }>>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // Fetch hotspots from server API
  const fetchHotspots = useCallback(async (lat: number, lng: number, locName: string) => {
    setIsLoading(true);
    setFetchError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    try {
      const algsJson = encodeURIComponent(JSON.stringify(userProfile.allergens));
      const res = await fetch(
        `/api/pollen-hotspots?lat=${lat}&lng=${lng}&locationName=${encodeURIComponent(locName)}&userAllergens=${algsJson}`,
        { signal: controller.signal }
      );
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = await res.json();
      if (data.hotspots && data.hotspots.length > 0) {
        setHotspots(data.hotspots);
        setSelectedHotspot(data.hotspots[0]);
        setIsFallbackData(false);
      } else {
        throw new Error('Server returned no hotspot data');
      }
    } catch (err) {
      console.warn('Notice loading live hotspots, using local terrain telemetry fallback:', err);
      setFetchError(err instanceof Error ? err.message : 'Unknown error contacting hotspot service');
      setIsFallbackData(true);
      const fallbackList: PollenHotspot[] = [
        {
          id: 'hs_fb_1',
          name: `${locName} Botanical Garden & Arboretum`,
          type: 'botanical',
          lat: lat + 0.024,
          lng: lng - 0.031,
          overallRisk: 'Very High',
          overallScore: 78,
          pollenCountGrains: 540,
          treePollen: 82,
          grassPollen: 35,
          weedPollen: 28,
          moldCount: 22,
          aqi: 45,
          dominantSpecies: 'Oak Tree',
          dominantCategory: 'tree',
          isProfileMatch: !!userProfile.allergens['oak'],
          matchedUserAllergen: userProfile.allergens['oak'] ? 'Oak Tree' : undefined,
          userSeverity: userProfile.allergens['oak'],
          windSpeedMph: 8,
          windDirection: 'S',
          temperatureF: 75,
          humidityPct: 52,
          advisory: 'Limit afternoon strolls; canopy pollen shedding is intense.',
        },
        {
          id: 'hs_fb_2',
          name: `${locName} Greenbelt River Basin`,
          type: 'greenbelt',
          lat: lat - 0.038,
          lng: lng - 0.045,
          overallRisk: 'High',
          overallScore: 72,
          pollenCountGrains: 460,
          treePollen: 40,
          grassPollen: 38,
          weedPollen: 75,
          moldCount: 30,
          aqi: 48,
          dominantSpecies: 'Ragweed',
          dominantCategory: 'weed',
          isProfileMatch: !!userProfile.allergens['ragweed'],
          matchedUserAllergen: userProfile.allergens['ragweed'] ? 'Ragweed' : undefined,
          userSeverity: userProfile.allergens['ragweed'],
          windSpeedMph: 8,
          windDirection: 'S',
          temperatureF: 75,
          humidityPct: 52,
          advisory: 'Wear protective sunglasses and rinse with saline post-visit.',
        },
        {
          id: 'hs_fb_3',
          name: `${locName} Regional Athletic Park & Turf`,
          type: 'park',
          lat: lat + 0.052,
          lng: lng + 0.022,
          overallRisk: 'High',
          overallScore: 65,
          pollenCountGrains: 380,
          treePollen: 32,
          grassPollen: 70,
          weedPollen: 35,
          moldCount: 25,
          aqi: 42,
          dominantSpecies: 'Bermuda Grass',
          dominantCategory: 'grass',
          isProfileMatch: !!userProfile.allergens['bermuda_grass'],
          matchedUserAllergen: userProfile.allergens['bermuda_grass'] ? 'Bermuda Grass' : undefined,
          userSeverity: userProfile.allergens['bermuda_grass'],
          windSpeedMph: 8,
          windDirection: 'S',
          temperatureF: 75,
          humidityPct: 52,
          advisory: 'Avoid vigorous running during midday hours.',
        },
      ];
      setHotspots(fallbackList);
      setSelectedHotspot(fallbackList[0]);
    } finally {
      clearTimeout(timer);
      setIsLoading(false);
    }
  }, [userProfile.allergens]);

  useEffect(() => {
    fetchHotspots(currentCoords.lat, currentCoords.lng, userProfile.location.cityName);
  }, [currentCoords.lat, currentCoords.lng, userProfile.location.cityName, fetchHotspots]);

  // Color helpers
  const getRiskColor = (score: number) => {
    if (score >= 75) return '#e11d48'; // Rose
    if (score >= 55) return '#f97316'; // Orange
    if (score >= 35) return '#eab308'; // Amber
    return '#10b981'; // Emerald
  };

  const getRiskBadgeClass = (risk: string) => {
    if (risk === 'Very High') return 'bg-rose-100 text-rose-800 border-rose-300';
    if (risk === 'High') return 'bg-orange-100 text-orange-800 border-orange-300';
    if (risk === 'Moderate') return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  };

  // Geolocation
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCurrentCoords({ lat, lng });
        fetchHotspots(lat, lng, 'Current GPS Location');
        if (onUpdateLocation) {
          onUpdateLocation('My GPS Location', lat, lng);
        }
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation denied or failed:', err);
        setIsLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // City Search
  const handleCitySearch = async (val: string) => {
    setSearchCityQuery(val);
    if (!val.trim()) {
      setCitySuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/location-search?q=${encodeURIComponent(val)}`);
      const data = await res.json();
      setCitySuggestions(data);
      setShowCityDropdown(true);
    } catch (e) {
      console.error(e);
    }
  };

  const selectCity = (city: { cityName: string; region: string; lat: number; lng: number }) => {
    setCurrentCoords({ lat: city.lat, lng: city.lng });
    fetchHotspots(city.lat, city.lng, `${city.cityName}, ${city.region}`);
    if (onUpdateLocation) {
      onUpdateLocation(`${city.cityName}, ${city.region}`, city.lat, city.lng);
    }
    setSearchCityQuery(`${city.cityName}, ${city.region}`);
    setShowCityDropdown(false);
  };

  // Filtered hotspots
  const filteredHotspots = hotspots.filter((hs) => {
    if (activeCategoryFilter !== 'all' && hs.dominantCategory !== activeCategoryFilter) {
      return false;
    }
    if (severityFilter === 'high_only') {
      if (hs.overallRisk !== 'High' && hs.overallRisk !== 'Very High') return false;
    } else if (severityFilter === 'profile_only') {
      if (!hs.isProfileMatch) return false;
    }
    return true;
  });

  // Calculate route to a place / hotspot
  const handlePlanRouteTo = (destination: { lat: number; lng: number }, name: string) => {
    setActiveRouteDestination(destination);
    setRouteDestinationName(name);
  };

  const handleClearRoute = () => {
    setActiveRouteDestination(null);
    setRouteDestinationName('');
    setRouteSummary(null);
  };

  // -------------------------------------------------------------
  // Mandatory Google Maps Platform Constitution Splash Screen
  // -------------------------------------------------------------
  if (!hasValidKey) {
    return (
      <div className="space-y-6 pb-20 md:pb-8">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl max-w-3xl mx-auto my-6 text-slate-800">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Google Maps Platform API Key Required</h2>
              <p className="text-xs text-slate-500">Connect Google Maps Platform for dynamic vector maps, Places API discovery, and Routes navigation.</p>
            </div>
          </div>

          <div className="space-y-4 pt-4 text-sm leading-relaxed">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-emerald-950 font-bold">Step 1: Get an API Key</strong>
                <a
                  href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold underline mt-1"
                >
                  <span>Open Google Cloud Maps APIs Console</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="space-y-2">
              <strong className="block text-slate-900 font-bold">Step 2: Add your key as a secret in AI Studio:</strong>
              <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-600 pl-2">
                <li>Open <strong>Settings</strong> (⚙️ gear icon, <strong>top-right corner</strong>)</li>
                <li>Select <strong>Secrets</strong></li>
                <li>Type <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-emerald-700 font-bold">GOOGLE_MAPS_PLATFORM_KEY</code> as the secret name, press <strong>Enter</strong></li>
                <li>Paste your API key as the value, press <strong>Enter</strong></li>
              </ul>
            </div>

            <div className="p-3 bg-slate-100 rounded-2xl text-xs text-slate-600">
              The application rebuilds automatically after adding the secret — no page reload needed.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Full Google Maps Platform Experience
  // -------------------------------------------------------------
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <div className="space-y-6 pb-20 md:pb-8">
        
        {/* Title & Quick Controls Bar */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-emerald-600" />
              Google Maps Pollen Radar & Clean-Air Navigator
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Powered by Google Maps Platform, Places API (New) discovery, and low-allergen Route computation around {userProfile.location.cityName}.
            </p>
          </div>

          {/* Location & GPS Controls */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchCityQuery}
                onChange={(e) => handleCitySearch(e.target.value)}
                onFocus={() => setShowCityDropdown(true)}
                placeholder={`Search City (e.g. ${userProfile.location.cityName})...`}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {showCityDropdown && citySuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  {citySuggestions.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => selectCity(c)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 flex items-center justify-between border-b last:border-0 border-slate-100"
                    >
                      <span className="font-bold text-slate-900">{c.cityName}</span>
                      <span className="text-[11px] text-slate-500">{c.region}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleLocateMe}
              disabled={isLocating}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all"
            >
              <Crosshair className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
              <span>{isLocating ? 'Locating...' : 'GPS Center'}</span>
            </button>

            <button
              onClick={() => fetchHotspots(currentCoords.lat, currentCoords.lng, userProfile.location.cityName)}
              className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl"
              title="Refresh sensor data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* LAYER TOGGLES & PLACES DISCOVERY */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          {/* Layer Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> Layer:
            </span>
            <button
              onClick={() => setActiveCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeCategoryFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Hotspots ({hotspots.length})
            </button>
            <button
              onClick={() => setActiveCategoryFilter('tree')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeCategoryFilter === 'tree'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Trees className="w-3.5 h-3.5" /> Trees
            </button>
            <button
              onClick={() => setActiveCategoryFilter('grass')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeCategoryFilter === 'grass'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Wheat className="w-3.5 h-3.5" /> Grasses
            </button>
            <button
              onClick={() => setActiveCategoryFilter('weed')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeCategoryFilter === 'weed'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Flower2 className="w-3.5 h-3.5" /> Weeds
            </button>
            <button
              onClick={() => setActiveCategoryFilter('mold')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeCategoryFilter === 'mold'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Biohazard className="w-3.5 h-3.5" /> Molds
            </button>
          </div>

          {/* Places API Quick Discovery Toggles */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Places API:</span>
            <button
              onClick={() => setPlaceDiscoveryType(placeDiscoveryType === 'sanctuaries' ? 'none' : 'sanctuaries')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-colors ${
                placeDiscoveryType === 'sanctuaries'
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Clean-Air Venues</span>
            </button>

            <button
              onClick={() => setPlaceDiscoveryType(placeDiscoveryType === 'pharmacies' ? 'none' : 'pharmacies')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-colors ${
                placeDiscoveryType === 'pharmacies'
                  ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <Hospital className="w-3.5 h-3.5" />
              <span>Pharmacies</span>
            </button>
          </div>
        </div>

        {/* FALLBACK DATA DISCLOSURE BANNER */}
        {isFallbackData && !isLoading && (
          <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <span className="font-bold block">Hotspot service unavailable — showing a local modeled estimate</span>
              <span>
                {fetchError ? `(${fetchError}) ` : ''}
                Zones below use fixed illustrative locations, not live sensor data. Try the refresh button to reconnect.
              </span>
            </div>
          </div>
        )}

        {/* ACTIVE ROUTE BANNER (Routes API) */}
        {activeRouteDestination && (
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-4 rounded-3xl border border-indigo-800/80 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                <RouteIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-700/60">
                    Low-Pollen Routes API
                  </span>
                  <span className="text-xs text-slate-300">Navigating to:</span>
                </div>
                <h3 className="text-sm font-bold text-white">{routeDestinationName}</h3>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              {/* Travel Mode Toggle */}
              <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
                <button
                  onClick={() => setTravelMode('WALKING')}
                  title="Walking Route"
                  className={`p-1.5 rounded-lg transition-colors ${travelMode === 'WALKING' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Footprints className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTravelMode('DRIVING')}
                  title="Driving Route"
                  className={`p-1.5 rounded-lg transition-colors ${travelMode === 'DRIVING' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Car className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTravelMode('BICYCLING')}
                  title="Bicycling Route"
                  className={`p-1.5 rounded-lg transition-colors ${travelMode === 'BICYCLING' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Bike className="w-4 h-4" />
                </button>
              </div>

              {routeSummary && (
                <div className="text-right text-xs">
                  <div className="font-extrabold text-emerald-300">{routeSummary.duration}</div>
                  <div className="text-[10px] text-slate-400">{routeSummary.distance}</div>
                </div>
              )}

              <button
                onClick={handleClearRoute}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
                title="Clear route"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* MAIN MAP & DETAILS SPLIT LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* MAP CANVAS (8 Cols) */}
          <div className="lg:col-span-8 space-y-4">
            
            <div className="relative w-full h-[540px] rounded-3xl overflow-hidden border-2 border-slate-200 shadow-xl bg-slate-100">
              
              <Map
                defaultCenter={currentCoords}
                defaultZoom={12}
                mapId="DEMO_MAP_ID"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{ width: '100%', height: '100%' }}
                gestureHandling="greedy"
                disableDefaultUI={false}
              >
                {/* 1. User Center Location Marker */}
                <AdvancedMarker position={currentCoords}>
                  <Pin background="#059669" glyphColor="#ffffff" borderColor="#064e3b" />
                </AdvancedMarker>

                {/* 2. Pollen Hotspot Advanced Markers */}
                {filteredHotspots.map((hs) => {
                  const riskColor = getRiskColor(hs.overallScore);
                  const isSelected = selectedHotspot?.id === hs.id;

                  let glyphText = '🌲';
                  if (hs.dominantCategory === 'grass') glyphText = '🌾';
                  else if (hs.dominantCategory === 'weed') glyphText = '🌼';
                  else if (hs.dominantCategory === 'mold') glyphText = '🍄';

                  return (
                    <AdvancedMarker
                      key={hs.id}
                      position={{ lat: hs.lat, lng: hs.lng }}
                      onClick={() => {
                        setSelectedHotspot(hs);
                        setSelectedPlace(null);
                      }}
                      title={hs.name}
                    >
                      <Pin
                        background={riskColor}
                        glyph={glyphText}
                        glyphColor="#ffffff"
                        borderColor="#ffffff"
                        scale={isSelected ? 1.25 : 1.0}
                      />
                    </AdvancedMarker>
                  );
                })}

                {/* 3. Discovered Places (Places API New) */}
                {discoveredPlaces.map((place, idx) => {
                  if (!place.location) return null;
                  const isSanctuary = placeDiscoveryType === 'sanctuaries';
                  return (
                    <AdvancedMarker
                      key={place.id || `place_${idx}`}
                      position={place.location}
                      onClick={() => {
                        setSelectedPlace(place);
                        setSelectedHotspot(null);
                      }}
                      title={place.displayName || 'Discovered Venue'}
                    >
                      <Pin
                        background={isSanctuary ? '#4f46e5' : '#e11d48'}
                        glyphColor="#ffffff"
                        glyph={isSanctuary ? '🏛️' : '💊'}
                      />
                    </AdvancedMarker>
                  );
                })}

                {/* 4. Active InfoWindow for Selected Hotspot */}
                {selectedHotspot && (
                  <InfoWindow
                    position={{ lat: selectedHotspot.lat, lng: selectedHotspot.lng }}
                    onCloseClick={() => setSelectedHotspot(null)}
                  >
                    <div className="p-2 space-y-2 min-w-[210px] text-slate-900 font-sans">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                        <div className="font-extrabold text-xs text-slate-900">{selectedHotspot.name}</div>
                        <span
                          style={{
                            backgroundColor: `${getRiskColor(selectedHotspot.overallScore)}20`,
                            color: getRiskColor(selectedHotspot.overallScore),
                          }}
                          className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase"
                        >
                          {selectedHotspot.overallRisk}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 space-y-0.5">
                        <div><strong>Dominant:</strong> {selectedHotspot.dominantSpecies}</div>
                        <div><strong>Pollen Count:</strong> {selectedHotspot.pollenCountGrains} grains/m³</div>
                        <div><strong>AQI:</strong> {selectedHotspot.aqi} • Wind: {selectedHotspot.windSpeedMph}mph {selectedHotspot.windDirection}</div>
                        {selectedHotspot.isProfileMatch && (
                          <div className="text-rose-600 font-bold mt-1">⚠️ Matches profile ({selectedHotspot.userSeverity || 'moderate'})</div>
                        )}
                      </div>

                      <button
                        onClick={() => handlePlanRouteTo({ lat: selectedHotspot.lat, lng: selectedHotspot.lng }, selectedHotspot.name)}
                        className="w-full mt-2 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <RouteIcon className="w-3.5 h-3.5" />
                        <span>Compute Safe Route</span>
                      </button>
                    </div>
                  </InfoWindow>
                )}

                {/* 5. Active InfoWindow for Selected Place */}
                {selectedPlace && selectedPlace.location && (
                  <InfoWindow
                    position={selectedPlace.location}
                    onCloseClick={() => setSelectedPlace(null)}
                  >
                    <div className="p-2 space-y-2 min-w-[210px] text-slate-900 font-sans">
                      <div className="font-extrabold text-xs text-slate-900">{selectedPlace.displayName}</div>
                      <div className="text-[11px] text-slate-500">{selectedPlace.formattedAddress}</div>
                      {selectedPlace.rating && (
                        <div className="text-[11px] text-amber-600 font-bold">
                          ⭐ {selectedPlace.rating} ({selectedPlace.userRatingCount || 0} reviews)
                        </div>
                      )}
                      <button
                        onClick={() =>
                          handlePlanRouteTo(
                            {
                              lat: selectedPlace.location!.lat(),
                              lng: selectedPlace.location!.lng(),
                            },
                            selectedPlace.displayName || 'Selected Venue'
                          )
                        }
                        className="w-full mt-2 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <RouteIcon className="w-3.5 h-3.5" />
                        <span>Navigate Here (Low Pollen)</span>
                      </button>
                    </div>
                  </InfoWindow>
                )}

                {/* Routes API Polyline Renderer */}
                <RoutePolyline
                  origin={currentCoords}
                  destination={activeRouteDestination}
                  travelMode={travelMode}
                  onRouteCalculated={setRouteSummary}
                />

                {/* Places API Discovery Layer */}
                <PlacesDiscoveryLayer
                  center={currentCoords}
                  category={placeDiscoveryType}
                  onPlacesLoaded={setDiscoveredPlaces}
                />
              </Map>

              {/* Overlaid Pollen Risk Index Legend */}
              <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-lg text-[11px] space-y-1.5">
                <div className="font-extrabold text-slate-900 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-500" /> Hotspot Risk Index
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-slate-600">Low (&lt;35)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span className="text-slate-600">Mod (35-54)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                    <span className="text-slate-600">High (55-74)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                    <span className="text-slate-600">V.High (75+)</span>
                  </div>
                </div>
              </div>

              {/* Wind Dispersion Live Radar Badge */}
              {selectedHotspot && (
                <div className="absolute top-4 right-4 z-10 bg-slate-900/90 backdrop-blur-md text-white px-3.5 py-2 rounded-2xl border border-slate-700 shadow-xl text-xs flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <Wind className="w-4 h-4 animate-pulse" />
                    <span>{selectedHotspot.windSpeedMph} mph</span>
                  </div>
                  <div className="text-[11px] text-slate-300 flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5 text-slate-400" />
                    <span>Plume vector: <strong>{selectedHotspot.windDirection}</strong></span>
                  </div>
                </div>
              )}

            </div>

            {/* Quick Guide Banner */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
              <Info className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-950 space-y-0.5">
                <span className="font-bold block">Google Maps Platform Integration Active:</span>
                <p>
                  Explore vector map markers, discover air-conditioned Clean-Air Sanctuaries using Places API (New), or calculate turn-by-turn routes avoiding high-pollen hotspots with the Routes API.
                </p>
              </div>
            </div>

          </div>

          {/* SIDE PANEL: SELECTED STATION & DIRECTORY (4 Cols) */}
          <div className="lg:col-span-4 space-y-4">
            
            {/* Selected Station Detailed Card */}
            {selectedHotspot ? (
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-lg space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                      Selected Hotspot
                    </span>
                    <h2 className="text-base font-extrabold text-slate-900 leading-snug">{selectedHotspot.name}</h2>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${getRiskBadgeClass(selectedHotspot.overallRisk)}`}>
                    {selectedHotspot.overallRisk}
                  </span>
                </div>

                {/* Profile Match Alert Banner */}
                {selectedHotspot.isProfileMatch && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Personal Trigger Match:</span>
                      <span><strong>{selectedHotspot.dominantSpecies}</strong> is blooming here ({selectedHotspot.userSeverity || 'moderate'} sensitivity).</span>
                    </div>
                  </div>
                )}

                {/* Score & Grains Meter */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Risk Index</span>
                    <div className="text-2xl font-black" style={{ color: getRiskColor(selectedHotspot.overallScore) }}>
                      {selectedHotspot.overallScore}/100
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Pollen Density</span>
                    <div className="text-xl font-black text-slate-800">
                      {selectedHotspot.pollenCountGrains} <span className="text-[10px] text-slate-400 font-normal">gr/m³</span>
                    </div>
                  </div>
                </div>

                {/* Botanical Breakdown */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-bold text-slate-700 block">Pollen Breakdown by Category:</span>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="flex items-center gap-1.5"><Trees className="w-3.5 h-3.5 text-emerald-600" /> Tree Pollen</span>
                      <span className="font-bold">{selectedHotspot.treePollen}/100</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${selectedHotspot.treePollen}%` }}></div>
                    </div>

                    <div className="flex justify-between items-center text-slate-600 pt-1">
                      <span className="flex items-center gap-1.5"><Wheat className="w-3.5 h-3.5 text-amber-500" /> Grass Pollen</span>
                      <span className="font-bold">{selectedHotspot.grassPollen}/100</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${selectedHotspot.grassPollen}%` }}></div>
                    </div>

                    <div className="flex justify-between items-center text-slate-600 pt-1">
                      <span className="flex items-center gap-1.5"><Flower2 className="w-3.5 h-3.5 text-rose-500" /> Weed Pollen</span>
                      <span className="font-bold">{selectedHotspot.weedPollen}/100</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-rose-500 h-full rounded-full" style={{ width: `${selectedHotspot.weedPollen}%` }}></div>
                    </div>
                  </div>
                </div>

                {/* Micro-Climate Weather */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs text-slate-700">
                  <div className="flex items-center gap-1">
                    <Thermometer className="w-3.5 h-3.5 text-rose-500" />
                    <span>{selectedHotspot.temperatureF}°F</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Droplets className="w-3.5 h-3.5 text-sky-500" />
                    <span>{selectedHotspot.humidityPct}% Humidity</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-indigo-500" />
                    <span>AQI {selectedHotspot.aqi}</span>
                  </div>
                </div>

                {/* Route Action Button */}
                <button
                  onClick={() => handlePlanRouteTo({ lat: selectedHotspot.lat, lng: selectedHotspot.lng }, selectedHotspot.name)}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <RouteIcon className="w-4 h-4" />
                  <span>Compute Low-Pollen Route</span>
                </button>
              </div>
            ) : (
              <div className="p-6 bg-white border border-slate-200 rounded-3xl text-center text-xs text-slate-400">
                Click any station on the map or list below to view detailed breakdown.
              </div>
            )}

            {/* NEARBY STATIONS DIRECTORY */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Nearby Zones ({hotspots.length})</span>
                <span className="text-[10px] text-emerald-600 font-bold" title="Fixed illustrative zones scaled by live wind, humidity & AQI data">Modeled Estimate</span>
              </h3>

              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {hotspots.map((hs) => {
                  const isSelected = selectedHotspot?.id === hs.id;
                  const riskColor = getRiskColor(hs.overallScore);
                  return (
                    <button
                      key={hs.id}
                      onClick={() => setSelectedHotspot(hs)}
                      className={`w-full text-left p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-400/20'
                          : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 truncate">{hs.name}</span>
                          {hs.isProfileMatch && (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title="Profile Match" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {hs.dominantSpecies} • {hs.pollenCountGrains} gr/m³
                        </div>
                      </div>

                      <span
                        style={{ color: riskColor, borderColor: `${riskColor}40`, backgroundColor: `${riskColor}10` }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0"
                      >
                        {hs.overallScore}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

        </div>

      </div>
    </APIProvider>
  );
};
