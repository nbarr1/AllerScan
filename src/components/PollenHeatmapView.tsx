import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  RefreshCw,
  Info,
  Compass,
  Thermometer,
  Droplets,
  Search,
  ExternalLink,
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
import { riskLevelForScore, themeForLevel, themeForScore } from '../utils/severity';

interface ProfileLocation {
  cityName: string;
  region: string;
  lat: number;
  lng: number;
}

interface PollenHeatmapViewProps {
  userProfile: UserAllergenProfile;
  onUpdateLocation?: (location: ProfileLocation) => void;
}

// Injected at runtime by the Express server (see server.ts) so the key can be rotated
// without a rebuild, rather than baked into the client bundle at build time.
const GOOGLE_MAPS_API_KEY =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const hasValidKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY';

/** Metres between two coordinates (haversine). Used to score routes against hotspots. */
function distanceMeters(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Total pollen exposure along a route: every hotspot within 800 m of the path contributes its
 * risk index, tapering with distance. Purely comparative — it ranks the alternatives Google
 * returns against each other, and means nothing on its own.
 */
function scoreRouteExposure(path: google.maps.LatLngLiteral[], hotspots: PollenHotspot[]): number {
  if (path.length === 0 || hotspots.length === 0) return 0;

  // Sample the path so a long route doesn't cost thousands of distance calculations.
  const step = Math.max(1, Math.floor(path.length / 120));
  let exposure = 0;

  for (const hotspot of hotspots) {
    let nearest = Infinity;
    for (let i = 0; i < path.length; i += step) {
      const d = distanceMeters(path[i], { lat: hotspot.lat, lng: hotspot.lng });
      if (d < nearest) nearest = d;
    }
    if (nearest < 800) {
      exposure += hotspot.overallScore * (1 - nearest / 800);
    }
  }

  return Math.round(exposure);
}

export interface RouteSummary {
  distance: string;
  duration: string;
  /** How many alternatives were compared. 1 means there was nothing to choose between. */
  alternativesConsidered: number;
  /** True when the chosen route had measurably less hotspot exposure than another option. */
  pollenAware: boolean;
}

// -------------------------------------------------------------
// Component: keeps the map camera on the selected coordinates
// -------------------------------------------------------------
function MapCamera({ center }: { center: google.maps.LatLngLiteral }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.panTo(center);
  }, [map, center.lat, center.lng]);

  return null;
}

// -------------------------------------------------------------
// Component: Route Polyline Renderer (Google Maps Routes API)
// -------------------------------------------------------------
function RoutePolyline({
  origin,
  destination,
  travelMode,
  hotspots,
  onRouteCalculated,
  onRouteError,
}: {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral | null;
  travelMode: 'WALKING' | 'DRIVING' | 'BICYCLING';
  hotspots: PollenHotspot[];
  onRouteCalculated: (info: RouteSummary | null) => void;
  onRouteError: (message: string | null) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    const clear = () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };

    if (!routesLib || !map || !destination) {
      clear();
      onRouteCalculated(null);
      onRouteError(null);
      return;
    }

    clear();
    onRouteError(null);
    let cancelled = false;

    routesLib.Route.computeRoutes({
      origin,
      destination,
      travelMode: travelMode as any,
      // Alternatives are what make the pollen comparison possible at all.
      computeAlternativeRoutes: true,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    })
      .then(({ routes }) => {
        if (cancelled) return;
        if (!routes || routes.length === 0) {
          onRouteCalculated(null);
          onRouteError('No route was found between those two points for this travel mode.');
          return;
        }

        // Rank the alternatives by how much hotspot pollen each passes through.
        const scored = routes.map((route: any) => {
          const path: google.maps.LatLngLiteral[] = Array.isArray(route.path)
            ? route.path
                .map((point: any) =>
                  typeof point?.lat === 'function'
                    ? { lat: point.lat(), lng: point.lng() }
                    : point && typeof point.lat === 'number'
                    ? { lat: point.lat, lng: point.lng }
                    : null
                )
                .filter(Boolean)
            : [];
          return { route, exposure: scoreRouteExposure(path, hotspots), hasPath: path.length > 0 };
        });

        const comparable = scored.filter((entry) => entry.hasPath);
        const best = comparable.length > 0
          ? comparable.reduce((a, b) => (b.exposure < a.exposure ? b : a))
          : scored[0];
        const worst = comparable.length > 0
          ? comparable.reduce((a, b) => (b.exposure > a.exposure ? b : a))
          : best;

        // Only claim the route avoids pollen when it actually beat another option.
        const pollenAware =
          comparable.length > 1 && hotspots.length > 0 && worst.exposure > best.exposure;

        const chosen = best.route;
        const newPolylines = chosen.createPolylines({
          polylineOptions: {
            strokeColor: travelMode === 'WALKING' ? '#10b981' : '#3b82f6',
            strokeWeight: 5,
            strokeOpacity: 0.85,
          },
        });
        newPolylines.forEach((p: google.maps.Polyline) => p.setMap(map));
        polylinesRef.current = newPolylines;

        if (chosen.viewport) {
          map.fitBounds(chosen.viewport, 60);
        }

        const distKm = ((chosen.distanceMeters || 0) / 1000).toFixed(1);
        const distMi = ((chosen.distanceMeters || 0) * 0.000621371).toFixed(1);
        const durMins = Math.round((chosen.durationMillis || 0) / 60000);

        onRouteCalculated({
          distance: `${distMi} mi (${distKm} km)`,
          duration: `${durMins} min`,
          alternativesConsidered: routes.length,
          pollenAware,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Routes API error:', err);
        onRouteCalculated(null);
        onRouteError("Couldn't calculate a route. Check that the Routes API is enabled for this key, then try again.");
      });

    return () => {
      cancelled = true;
      clear();
    };
  }, [routesLib, map, origin, destination, travelMode, hotspots, onRouteCalculated, onRouteError]);

  return null;
}

// -------------------------------------------------------------
// Component: Places Discovery (Google Maps Places API New)
// -------------------------------------------------------------
function PlacesDiscoveryLayer({
  center,
  category,
  onPlacesLoaded,
  onPlacesError,
}: {
  center: google.maps.LatLngLiteral;
  category: 'sanctuaries' | 'pharmacies' | 'none';
  onPlacesLoaded: (places: google.maps.places.Place[]) => void;
  onPlacesError: (message: string | null) => void;
}) {
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || category === 'none') {
      onPlacesLoaded([]);
      onPlacesError(null);
      return;
    }

    let cancelled = false;

    // "Indoor" is the operative word: these are places to be inside, away from outdoor pollen.
    const textQuery =
      category === 'sanctuaries'
        ? 'air conditioned indoor library museum shopping mall'
        : '24 hour pharmacy urgent care';

    placesLib.Place.searchByText({
      textQuery,
      fields: ['displayName', 'location', 'formattedAddress', 'rating', 'userRatingCount', 'types'],
      locationBias: center,
      maxResultCount: 8,
    })
      .then(({ places }) => {
        if (cancelled) return;
        onPlacesLoaded(places || []);
        onPlacesError(places && places.length > 0 ? null : 'No matching places were found near this location.');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Places API error:', err);
        onPlacesLoaded([]);
        onPlacesError("Couldn't load nearby places. Check that the Places API is enabled for this key.");
      });

    return () => {
      cancelled = true;
    };
  }, [placesLib, center, category, onPlacesLoaded, onPlacesError]);

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
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<google.maps.places.Place | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters & Modes
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | 'tree' | 'grass' | 'weed' | 'mold'>('all');
  const [placeDiscoveryType, setPlaceDiscoveryType] = useState<'sanctuaries' | 'pharmacies' | 'none'>('none');
  const [discoveredPlaces, setDiscoveredPlaces] = useState<google.maps.places.Place[]>([]);
  const [placesError, setPlacesError] = useState<string | null>(null);

  // Navigation & Routing
  const [activeRouteDestination, setActiveRouteDestination] = useState<google.maps.LatLngLiteral | null>(null);
  const [routeDestinationName, setRouteDestinationName] = useState<string>('');
  const [travelMode, setTravelMode] = useState<'WALKING' | 'DRIVING' | 'BICYCLING'>('WALKING');
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [searchCityQuery, setSearchCityQuery] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<Array<{ cityName: string; region: string; lat: number; lng: number }>>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const cityRequestId = useRef(0);

  // The map follows the profile's location. Keeping one source of truth means a city change made
  // in the header can't leave the map querying the new city's name with the old coordinates.
  const currentCoords = useMemo(
    () => ({
      lat: userProfile.location.lat || 30.2672,
      lng: userProfile.location.lng || -97.7431,
    }),
    [userProfile.location.lat, userProfile.location.lng]
  );

  const locationLabel = [userProfile.location.cityName, userProfile.location.region]
    .filter(Boolean)
    .join(', ');

  const hotspotsAbort = useRef<AbortController | null>(null);
  const hotspotRequestId = useRef(0);

  const fetchHotspots = useCallback(async (lat: number, lng: number, locName: string) => {
    const requestId = ++hotspotRequestId.current;
    hotspotsAbort.current?.abort();
    const controller = new AbortController();
    hotspotsAbort.current = controller;

    setIsLoading(true);
    setFetchError(null);
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const algsJson = encodeURIComponent(JSON.stringify(userProfile.allergens));
      const res = await fetch(
        `/api/pollen-hotspots?lat=${lat}&lng=${lng}&locationName=${encodeURIComponent(locName)}&userAllergens=${algsJson}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      if (requestId !== hotspotRequestId.current) return;

      if (Array.isArray(data.hotspots) && data.hotspots.length > 0) {
        setHotspots(data.hotspots);
        setSelectedHotspotId(data.hotspots[0].id);
      } else {
        setHotspots([]);
        setSelectedHotspotId(null);
        setFetchError(data.message || 'No verified live hotspot data is currently available for this area.');
      }
    } catch (err) {
      if (requestId !== hotspotRequestId.current) return;
      console.warn('Notice loading live hotspots:', err);
      setHotspots([]);
      setSelectedHotspotId(null);
      setFetchError(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'The hotspot service took too long to respond.'
          : err instanceof Error
          ? err.message
          : 'Unknown error contacting the hotspot service'
      );
    } finally {
      clearTimeout(timer);
      if (requestId === hotspotRequestId.current) setIsLoading(false);
    }
  }, [userProfile.allergens]);

  // The effect is the only thing that fetches. Callers change the coordinates and let it run,
  // rather than each also firing its own duplicate request.
  useEffect(() => {
    fetchHotspots(currentCoords.lat, currentCoords.lng, locationLabel);
  }, [currentCoords.lat, currentCoords.lng, locationLabel, fetchHotspots]);

  useEffect(() => () => hotspotsAbort.current?.abort(), []);

  // City search: debounced and sequenced, matching the header's behaviour.
  useEffect(() => {
    if (!searchCityQuery.trim()) {
      cityRequestId.current += 1;
      setCitySuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const requestId = ++cityRequestId.current;
      try {
        const res = await fetch(`/api/location-search?q=${encodeURIComponent(searchCityQuery)}`);
        if (!res.ok) throw new Error(`Search returned ${res.status}`);
        const data = await res.json();
        if (requestId !== cityRequestId.current) return;
        setCitySuggestions(Array.isArray(data) ? data : []);
        setShowCityDropdown(true);
      } catch (e) {
        if (requestId !== cityRequestId.current) return;
        console.error('City search failed:', e);
        setCitySuggestions([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchCityQuery]);

  // Dismiss the suggestion dropdown on outside click or Escape.
  useEffect(() => {
    if (!showCityDropdown) return;

    const onPointerDown = (event: PointerEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowCityDropdown(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowCityDropdown(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showCityDropdown]);

  // Geolocation
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setGeoError('This browser cannot share your location. Search for a city instead.');
      return;
    }
    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // Name the place properly rather than writing "My GPS Location" in as the city name.
        let cityName = 'My location';
        let region = '';
        try {
          const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
          if (res.ok) {
            const place = await res.json();
            if (place?.cityName) {
              cityName = place.cityName;
              region = place.region || '';
            }
          }
        } catch (err) {
          console.warn('Reverse geocode failed; using coordinates only:', err);
        }

        onUpdateLocation?.({ cityName, region, lat, lng });
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation denied or failed:', err);
        setIsLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was declined. Search for a city instead, or re-enable location access in your browser settings.'
            : "Couldn't get your location. Search for a city instead."
        );
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const selectCity = (city: { cityName: string; region: string; lat: number; lng: number }) => {
    onUpdateLocation?.({ cityName: city.cityName, region: city.region, lat: city.lat, lng: city.lng });
    setSearchCityQuery(`${city.cityName}, ${city.region}`);
    setShowCityDropdown(false);
    setGeoError(null);
  };

  // Filtered hotspots. The list, the counts and the markers all read from this, so the map and
  // the sidebar can never disagree about what's on screen.
  const filteredHotspots = useMemo(
    () =>
      activeCategoryFilter === 'all'
        ? hotspots
        : hotspots.filter((hs) => hs.dominantCategory === activeCategoryFilter),
    [hotspots, activeCategoryFilter]
  );

  // Keep the selection inside the visible set.
  useEffect(() => {
    if (selectedHotspotId && !filteredHotspots.some((hs) => hs.id === selectedHotspotId)) {
      setSelectedHotspotId(filteredHotspots[0]?.id ?? null);
    }
  }, [filteredHotspots, selectedHotspotId]);

  const selectedHotspot = filteredHotspots.find((hs) => hs.id === selectedHotspotId) ?? null;

  // The sidebar badge reflects what the data actually says rather than always claiming "verified".
  const liveCount = hotspots.filter((hs) => /live/i.test(hs.dataSource || '')).length;
  const provenanceLabel =
    hotspots.length === 0
      ? null
      : liveCount === hotspots.length
      ? 'All live readings'
      : liveCount === 0
      ? 'Modelled estimates'
      : `${liveCount} of ${hotspots.length} live`;

  const handlePlanRouteTo = (destination: { lat: number; lng: number }, name: string) => {
    setActiveRouteDestination(destination);
    setRouteDestinationName(name);
    setRouteError(null);
  };

  const handleClearRoute = () => {
    setActiveRouteDestination(null);
    setRouteDestinationName('');
    setRouteSummary(null);
    setRouteError(null);
  };

  const categoryFilters: Array<{ key: typeof activeCategoryFilter; label: string; Icon?: React.ElementType }> = [
    { key: 'all', label: `All hotspots (${hotspots.length})` },
    { key: 'tree', label: 'Trees', Icon: Trees },
    { key: 'grass', label: 'Grasses', Icon: Wheat },
    { key: 'weed', label: 'Weeds', Icon: Flower2 },
    { key: 'mold', label: 'Molds', Icon: Biohazard },
  ];

  // -------------------------------------------------------------
  // Setup screen when no Maps Platform key is configured
  // -------------------------------------------------------------
  if (!hasValidKey) {
    return (
      <div className="space-y-6 pb-20 md:pb-8">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl max-w-3xl mx-auto my-6 text-slate-800">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <MapPin className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Google Maps Platform key required</h1>
              <p className="text-xs text-slate-500">The map, nearby-place discovery and routing all need a Maps Platform key.</p>
            </div>
          </div>

          <div className="space-y-4 pt-4 text-sm leading-relaxed">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <strong className="block text-emerald-950 font-bold">Step 1: Create a key</strong>
                <p className="text-xs text-emerald-900 mt-0.5">
                  Enable Maps JavaScript API, Places API (New) and Routes API on the project, and
                  restrict the key by HTTP referrer for your web origin.
                </p>
                <a
                  href="https://console.cloud.google.com/google/maps-apis/start"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold underline mt-1.5"
                >
                  <span>Open the Google Cloud Maps APIs console</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>

            <div className="space-y-2">
              <strong className="block text-slate-900 font-bold">Step 2: Give it to the server</strong>
              <p className="text-xs text-slate-600">
                Set <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-emerald-700 font-bold">GOOGLE_MAPS_PLATFORM_KEY</code>{' '}
                in the environment the Express server runs in — a <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">.env</code> file
                locally, your host's environment variables in a deployment, or the Secrets panel if
                you're running this in Google AI Studio. The server injects it into the page at
                request time, so rotating it needs a restart but no rebuild.
              </p>
            </div>

            <div className="p-3 bg-slate-100 rounded-2xl text-xs text-slate-600">
              Reload this page once the key is set. Everything else in AllerScan works without it.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Full map experience
  // -------------------------------------------------------------
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <div className="space-y-6 pb-20 md:pb-8">

        {/* Title & Quick Controls Bar */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-emerald-600" aria-hidden="true" />
              Pollen Radar &amp; Clean-Air Navigator
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Real nearby locations with their own pollen readings around {userProfile.location.cityName},
              plus indoor places to shelter and directions between them.
            </p>
          </div>

          {/* Location & GPS Controls */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-64" ref={searchBoxRef}>
              <label htmlFor="heatmap-city-search" className="sr-only">Search for a city</label>
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" aria-hidden="true" />
              <input
                id="heatmap-city-search"
                type="text"
                value={searchCityQuery}
                onChange={(e) => setSearchCityQuery(e.target.value)}
                onFocus={() => citySuggestions.length > 0 && setShowCityDropdown(true)}
                placeholder={`Search city (e.g. ${userProfile.location.cityName})…`}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {showCityDropdown && citySuggestions.length > 0 && (
                <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  {citySuggestions.map((c, i) => (
                    <li key={`${c.cityName}-${i}`}>
                      <button
                        type="button"
                        onClick={() => selectCity(c)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 flex items-center justify-between border-b last:border-0 border-slate-100"
                      >
                        <span className="font-bold text-slate-900">{c.cityName}</span>
                        <span className="text-[11px] text-slate-500">{c.region}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={handleLocateMe}
              disabled={isLocating}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all"
            >
              <Crosshair className={`w-3.5 h-3.5 text-emerald-400 ${isLocating ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{isLocating ? 'Locating…' : 'GPS Center'}</span>
            </button>

            <button
              type="button"
              onClick={() => fetchHotspots(currentCoords.lat, currentCoords.lng, locationLabel)}
              disabled={isLoading}
              className="p-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 rounded-xl"
              aria-label="Refresh hotspot data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        {geoError && (
          <div role="status" className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-amber-900">{geoError}</p>
          </div>
        )}

        {/* LAYER TOGGLES & PLACES DISCOVERY */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" aria-hidden="true" /> Layer:
            </span>
            {categoryFilters.map(({ key, label, Icon }) => (
              <button
                type="button"
                key={key}
                onClick={() => setActiveCategoryFilter(key)}
                aria-pressed={activeCategoryFilter === key}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  activeCategoryFilter === key
                    ? key === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nearby:</span>
            <button
              type="button"
              onClick={() => setPlaceDiscoveryType(placeDiscoveryType === 'sanctuaries' ? 'none' : 'sanctuaries')}
              aria-pressed={placeDiscoveryType === 'sanctuaries'}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-colors ${
                placeDiscoveryType === 'sanctuaries'
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Indoor venues</span>
            </button>

            <button
              type="button"
              onClick={() => setPlaceDiscoveryType(placeDiscoveryType === 'pharmacies' ? 'none' : 'pharmacies')}
              aria-pressed={placeDiscoveryType === 'pharmacies'}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-colors ${
                placeDiscoveryType === 'pharmacies'
                  ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <Hospital className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Pharmacies</span>
            </button>
          </div>
        </div>

        {/* LIVE DATA UNAVAILABLE DISCLOSURE BANNER */}
        {fetchError && !isLoading && (
          <div role="status" className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-amber-900">
              <span className="font-bold block">Live pollen hotspot data unavailable</span>
              <span>
                {fetchError} AllerScan only shows real locations with their own pollen readings — no
                illustrative or placeholder zones. Use the refresh button to try again.
              </span>
            </div>
          </div>
        )}

        {placesError && placeDiscoveryType !== 'none' && (
          <div role="status" className="p-3.5 bg-slate-100 border border-slate-200 rounded-2xl flex items-start gap-3">
            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-slate-600">{placesError}</p>
          </div>
        )}

        {/* ACTIVE ROUTE BANNER */}
        {activeRouteDestination && (
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-4 rounded-3xl border border-indigo-800/80 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                <RouteIcon className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Only claims pollen awareness when an alternative was actually compared and beaten. */}
                  <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-700/60">
                    {routeSummary?.pollenAware
                      ? `Lowest pollen of ${routeSummary.alternativesConsidered} routes`
                      : 'Directions'}
                  </span>
                  <span className="text-xs text-slate-300">Navigating to:</span>
                </div>
                <h2 className="text-sm font-bold text-white">{routeDestinationName}</h2>
                {routeSummary && !routeSummary.pollenAware && (
                  <p className="text-[11px] text-slate-400">
                    {routeSummary.alternativesConsidered > 1
                      ? 'Alternatives passed the same hotspots, so this is simply the fastest.'
                      : 'Only one route available for this trip.'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700" role="group" aria-label="Travel mode">
                {([
                  { mode: 'WALKING' as const, Icon: Footprints, label: 'Walking' },
                  { mode: 'DRIVING' as const, Icon: Car, label: 'Driving' },
                  { mode: 'BICYCLING' as const, Icon: Bike, label: 'Bicycling' },
                ]).map(({ mode, Icon, label }) => (
                  <button
                    type="button"
                    key={mode}
                    onClick={() => setTravelMode(mode)}
                    aria-pressed={travelMode === mode}
                    aria-label={`${label} route`}
                    className={`p-1.5 rounded-lg transition-colors ${
                      travelMode === mode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </button>
                ))}
              </div>

              {routeSummary && (
                <div className="text-right text-xs">
                  <div className="font-extrabold text-emerald-300">{routeSummary.duration}</div>
                  <div className="text-[10px] text-slate-400">{routeSummary.distance}</div>
                </div>
              )}

              <button
                type="button"
                onClick={handleClearRoute}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
                aria-label="Clear route"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {routeError && (
          <div role="status" className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-amber-900">{routeError}</p>
          </div>
        )}

        {/* MAIN MAP & DETAILS SPLIT LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* MAP CANVAS */}
          <div className="lg:col-span-8 space-y-4">

            <div className="relative w-full h-[420px] sm:h-[540px] rounded-3xl overflow-hidden border-2 border-slate-200 shadow-xl bg-slate-100">

              <Map
                defaultCenter={currentCoords}
                defaultZoom={12}
                mapId="DEMO_MAP_ID"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{ width: '100%', height: '100%' }}
                gestureHandling="greedy"
                disableDefaultUI={false}
              >
                {/* Keeps the camera on the selected place — `defaultCenter` alone only applies once. */}
                <MapCamera center={currentCoords} />

                <AdvancedMarker position={currentCoords} title={userProfile.location.cityName}>
                  <Pin background="#059669" glyphColor="#ffffff" borderColor="#064e3b" />
                </AdvancedMarker>

                {filteredHotspots.map((hs) => {
                  const riskColor = themeForScore(hs.overallScore).hex;
                  const isSelected = selectedHotspotId === hs.id;

                  let glyphText = '🌲';
                  if (hs.dominantCategory === 'grass') glyphText = '🌾';
                  else if (hs.dominantCategory === 'weed') glyphText = '🌼';
                  else if (hs.dominantCategory === 'mold') glyphText = '🍄';

                  return (
                    <AdvancedMarker
                      key={hs.id}
                      position={{ lat: hs.lat, lng: hs.lng }}
                      onClick={() => {
                        setSelectedHotspotId(hs.id);
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

                {discoveredPlaces.map((place, idx) => {
                  if (!place.location) return null;
                  const isSanctuary = placeDiscoveryType === 'sanctuaries';
                  return (
                    <AdvancedMarker
                      key={place.id || `place_${idx}`}
                      position={place.location}
                      onClick={() => {
                        setSelectedPlace(place);
                        setSelectedHotspotId(null);
                      }}
                      title={place.displayName || 'Discovered venue'}
                    >
                      <Pin
                        background={isSanctuary ? '#4f46e5' : '#e11d48'}
                        glyphColor="#ffffff"
                        glyph={isSanctuary ? '🏛️' : '💊'}
                      />
                    </AdvancedMarker>
                  );
                })}

                {selectedHotspot && (
                  <InfoWindow
                    position={{ lat: selectedHotspot.lat, lng: selectedHotspot.lng }}
                    onCloseClick={() => setSelectedHotspotId(null)}
                  >
                    <div className="p-2 space-y-2 min-w-[210px] text-slate-900 font-sans">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                        <div className="font-extrabold text-xs text-slate-900">{selectedHotspot.name}</div>
                        <span
                          style={{
                            backgroundColor: `${themeForScore(selectedHotspot.overallScore).hex}20`,
                            color: themeForScore(selectedHotspot.overallScore).hex,
                          }}
                          className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase"
                        >
                          {selectedHotspot.overallRisk}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 space-y-0.5">
                        <div>
                          <strong>Highest here:</strong> {selectedHotspot.dominantCategory} pollen
                        </div>
                        {typeof selectedHotspot.pollenCountGrains === 'number' && (
                          <div><strong>Pollen count:</strong> {selectedHotspot.pollenCountGrains} grains/m³</div>
                        )}
                        {(typeof selectedHotspot.aqi === 'number' || typeof selectedHotspot.windSpeedMph === 'number') && (
                          <div>
                            {typeof selectedHotspot.aqi === 'number' && <><strong>AQI:</strong> {selectedHotspot.aqi}</>}
                            {typeof selectedHotspot.aqi === 'number' && typeof selectedHotspot.windSpeedMph === 'number' && ' • '}
                            {typeof selectedHotspot.windSpeedMph === 'number' && (
                              <>Wind: {selectedHotspot.windSpeedMph}mph {selectedHotspot.windDirection}</>
                            )}
                          </div>
                        )}
                        <div className="text-slate-400">{selectedHotspot.dataSource}</div>
                        {selectedHotspot.isProfileMatch && selectedHotspot.matchedUserAllergen && (
                          <div className="text-rose-600 font-bold mt-1">
                            Matches your {selectedHotspot.matchedUserAllergen} ({selectedHotspot.userSeverity || 'moderate'})
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePlanRouteTo({ lat: selectedHotspot.lat, lng: selectedHotspot.lng }, selectedHotspot.name)}
                        className="w-full mt-2 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <RouteIcon className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Get directions</span>
                      </button>
                    </div>
                  </InfoWindow>
                )}

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
                          {selectedPlace.rating} ★ ({selectedPlace.userRatingCount || 0} reviews)
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          handlePlanRouteTo(
                            {
                              lat: selectedPlace.location!.lat(),
                              lng: selectedPlace.location!.lng(),
                            },
                            selectedPlace.displayName || 'Selected venue'
                          )
                        }
                        className="w-full mt-2 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <RouteIcon className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Get directions</span>
                      </button>
                    </div>
                  </InfoWindow>
                )}

                <RoutePolyline
                  origin={currentCoords}
                  destination={activeRouteDestination}
                  travelMode={travelMode}
                  hotspots={hotspots}
                  onRouteCalculated={setRouteSummary}
                  onRouteError={setRouteError}
                />

                <PlacesDiscoveryLayer
                  center={currentCoords}
                  category={placeDiscoveryType}
                  onPlacesLoaded={setDiscoveredPlaces}
                  onPlacesError={setPlacesError}
                />
              </Map>

              {/* Overlaid Pollen Risk Index Legend. Swatches are the same values the markers use. */}
              <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-lg text-[11px] space-y-1.5">
                <div className="font-extrabold text-slate-900 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-500" aria-hidden="true" /> Hotspot risk index
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {([
                    { label: 'Low (<30)', level: 'Low' as const },
                    { label: 'Mod (30-49)', level: 'Moderate' as const },
                    { label: 'High (50-69)', level: 'High' as const },
                    { label: 'V.High (70+)', level: 'Very High' as const },
                  ]).map(({ label, level }) => (
                    <div key={level} className="flex items-center gap-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: themeForLevel(level).hex }}
                        aria-hidden="true"
                      />
                      <span className="text-slate-600">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedHotspot && typeof selectedHotspot.windSpeedMph === 'number' && (
                <div className="absolute top-4 right-4 z-10 bg-slate-900/90 backdrop-blur-md text-white px-3.5 py-2 rounded-2xl border border-slate-700 shadow-xl text-xs flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <Wind className="w-4 h-4" aria-hidden="true" />
                    <span>{selectedHotspot.windSpeedMph} mph</span>
                  </div>
                  {selectedHotspot.windDirection && (
                    <div className="text-[11px] text-slate-300 flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      <span>Wind from <strong>{selectedHotspot.windDirection}</strong></span>
                    </div>
                  )}
                </div>
              )}

            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
              <Info className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-xs text-emerald-950 space-y-0.5">
                <span className="font-bold block">How this map works:</span>
                <p>
                  Each pin is a real nearby location with its own pollen reading. Turn on indoor
                  venues or pharmacies to find somewhere to shelter, then get directions — when more
                  than one route exists, AllerScan picks the one passing the fewest high-pollen
                  hotspots and says so.
                </p>
              </div>
            </div>

          </div>

          {/* SIDE PANEL */}
          <div className="lg:col-span-4 space-y-4">

            {selectedHotspot ? (
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-lg space-y-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                      Selected hotspot
                    </span>
                    <h2 className="text-base font-extrabold text-slate-900 leading-snug">{selectedHotspot.name}</h2>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black border shrink-0 ${themeForScore(selectedHotspot.overallScore).badge}`}>
                    {selectedHotspot.overallRisk}
                  </span>
                </div>

                {/* Names the allergen the user actually saved, not the category's default species. */}
                {selectedHotspot.isProfileMatch && selectedHotspot.matchedUserAllergen && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <span className="font-bold block">Matches one of your triggers</span>
                      <span>
                        {selectedHotspot.dominantCategory} pollen is the highest reading here, and you've
                        saved <strong>{selectedHotspot.matchedUserAllergen}</strong> as a{' '}
                        {selectedHotspot.userSeverity || 'moderate'} {selectedHotspot.dominantCategory} trigger.
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Risk index</span>
                    <div className="text-2xl font-black" style={{ color: themeForScore(selectedHotspot.overallScore).hex }}>
                      {selectedHotspot.overallScore}/100
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Pollen density</span>
                    <div className="text-xl font-black text-slate-800">
                      {typeof selectedHotspot.pollenCountGrains === 'number' ? (
                        <>{selectedHotspot.pollenCountGrains} <span className="text-[10px] text-slate-400 font-normal">gr/m³</span></>
                      ) : (
                        <span className="text-sm text-slate-400 font-semibold">Not measured</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-bold text-slate-700 block">Pollen breakdown by category:</span>
                  <div className="space-y-1.5 text-xs">
                    {([
                      { label: 'Tree pollen', value: selectedHotspot.treePollen, Icon: Trees, iconClass: 'text-emerald-600' },
                      { label: 'Grass pollen', value: selectedHotspot.grassPollen, Icon: Wheat, iconClass: 'text-amber-500' },
                      { label: 'Weed pollen', value: selectedHotspot.weedPollen, Icon: Flower2, iconClass: 'text-rose-500' },
                      { label: 'Mold spores', value: selectedHotspot.moldCount, Icon: Biohazard, iconClass: 'text-purple-500' },
                    ]).map(({ label, value, Icon, iconClass }) => (
                      <div key={label}>
                        <div className="flex justify-between items-center text-slate-600 pt-1">
                          <span className="flex items-center gap-1.5">
                            <Icon className={`w-3.5 h-3.5 ${iconClass}`} aria-hidden="true" /> {label}
                          </span>
                          <span className="font-bold">{value}/100</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${themeForScore(value).bar}`}
                            style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  {selectedHotspot.advisory}
                </p>

                {/* Only rendered for figures the live feed actually returned. */}
                {(typeof selectedHotspot.temperatureF === 'number' ||
                  typeof selectedHotspot.humidityPct === 'number' ||
                  typeof selectedHotspot.aqi === 'number') && (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs text-slate-700">
                    {typeof selectedHotspot.temperatureF === 'number' && (
                      <span className="flex items-center gap-1">
                        <Thermometer className="w-3.5 h-3.5 text-rose-500" aria-hidden="true" />
                        {selectedHotspot.temperatureF}°F
                      </span>
                    )}
                    {typeof selectedHotspot.humidityPct === 'number' && (
                      <span className="flex items-center gap-1">
                        <Droplets className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
                        {selectedHotspot.humidityPct}% humidity
                      </span>
                    )}
                    {typeof selectedHotspot.aqi === 'number' && (
                      <span className="flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
                        AQI {selectedHotspot.aqi}
                      </span>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handlePlanRouteTo({ lat: selectedHotspot.lat, lng: selectedHotspot.lng }, selectedHotspot.name)}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <RouteIcon className="w-4 h-4" aria-hidden="true" />
                  <span>Get directions here</span>
                </button>
              </div>
            ) : (
              <p className="p-6 bg-white border border-slate-200 rounded-3xl text-center text-xs text-slate-400">
                Choose a location on the map or in the list to see its full breakdown.
              </p>
            )}

            {/* NEARBY STATIONS DIRECTORY */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center justify-between gap-2">
                <span>
                  Nearby zones ({filteredHotspots.length}
                  {activeCategoryFilter !== 'all' && hotspots.length !== filteredHotspots.length
                    ? ` of ${hotspots.length}`
                    : ''}
                  )
                </span>
                {provenanceLabel && (
                  <span
                    className={`text-[10px] font-bold ${liveCount === hotspots.length ? 'text-emerald-600' : 'text-amber-600'}`}
                    title="Each location's reading comes from the source named on its detail card"
                  >
                    {provenanceLabel}
                  </span>
                )}
              </h3>

              {filteredHotspots.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  {hotspots.length === 0
                    ? 'No verified hotspot data available right now.'
                    : 'No hotspots match this layer. Choose a different layer to see the rest.'}
                </p>
              ) : (
                <ul className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {filteredHotspots.map((hs) => {
                    const isSelected = selectedHotspotId === hs.id;
                    const riskColor = themeForScore(hs.overallScore).hex;
                    return (
                      <li key={hs.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedHotspotId(hs.id);
                            setSelectedPlace(null);
                          }}
                          aria-current={isSelected ? 'true' : undefined}
                          className={`w-full text-left p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-400/20'
                              : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">
                            <span className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900 truncate">{hs.name}</span>
                              {hs.isProfileMatch && (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" aria-hidden="true" />
                                  <span className="sr-only">Matches your profile.</span>
                                </>
                              )}
                            </span>
                            <span className="text-[11px] text-slate-500 truncate block capitalize">
                              {hs.dominantCategory} pollen highest
                              {typeof hs.pollenCountGrains === 'number' ? ` • ${hs.pollenCountGrains} gr/m³` : ''}
                            </span>
                          </span>

                          <span
                            style={{ color: riskColor, borderColor: `${riskColor}40`, backgroundColor: `${riskColor}10` }}
                            className="px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0"
                          >
                            {hs.overallScore}
                            <span className="sr-only"> out of 100, {riskLevelForScore(hs.overallScore)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

          </div>

        </div>

      </div>
    </APIProvider>
  );
};
