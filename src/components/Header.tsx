import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert,
  Bell,
  MapPin,
  Search,
  Sparkles,
  ChevronDown,
  CheckCircle,
  AlertTriangle,
  Smartphone
} from 'lucide-react';
import { InstallAppModal } from './InstallAppModal';
import { Modal } from './Modal';
import { DEFAULT_CITY_OPTIONS } from '../data/defaultCities';
import { RiskLevel, themeForLevel } from '../utils/severity';

interface CityResult {
  cityName: string;
  region: string;
  lat?: number;
  lng?: number;
}

interface HeaderProps {
  locationName: string;
  onLocationChange: (cityName: string, region: string, lat?: number, lng?: number) => void;
  /** Null until real data has loaded — the badge never invents a score. */
  riskScore: number | null;
  riskCategory: RiskLevel | null;
  isRiskLoading: boolean;
  onOpenNotifications: () => void;
  unreadNotifCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  locationName,
  onLocationChange,
  riskScore,
  riskCategory,
  isRiskLoading,
  onOpenNotifications,
  unreadNotifCount,
}) => {
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CityResult[]>(DEFAULT_CITY_OPTIONS);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // Identifies the newest search. Without this, a slow early response can land after a faster
  // later one and repaint results for a query the user has already moved past.
  const searchId = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!showLocationModal) return;

    if (!searchQuery.trim()) {
      searchAbort.current?.abort();
      searchId.current += 1;
      setSearchResults(DEFAULT_CITY_OPTIONS);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      const requestId = ++searchId.current;
      searchAbort.current?.abort();
      const controller = new AbortController();
      searchAbort.current = controller;

      try {
        const resp = await fetch(`/api/location-search?q=${encodeURIComponent(searchQuery)}`, {
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error(`Search returned ${resp.status}`);
        const data = await resp.json();
        if (requestId !== searchId.current) return;
        if (!Array.isArray(data)) throw new Error('Unexpected response from the location service');
        setSearchResults(data);
        setSearchError(null);
      } catch (err) {
        if (controller.signal.aborted || requestId !== searchId.current) return;
        console.error('Location search error:', err);
        setSearchResults([]);
        setSearchError("Couldn't reach the location service. Check your connection and try again.");
      } finally {
        if (requestId === searchId.current) setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, showLocationModal, retryToken]);

  useEffect(() => () => searchAbort.current?.abort(), []);

  const handleSelectLocation = (item: CityResult) => {
    onLocationChange(item.cityName, item.region, item.lat, item.lng);
    setShowLocationModal(false);
    setSearchQuery('');
  };

  const riskTheme = riskCategory ? themeForLevel(riskCategory) : null;

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 sm:px-6 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">

          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xl tracking-tight text-slate-900">
                  Aller<span className="text-emerald-600">Scan</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Sparkles className="w-2.5 h-2.5" aria-hidden="true" /> AI Powered
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Personal Environmental &amp; Allergy Defense</p>
            </div>
          </div>

          {/* Right Action Bar: Location & Notifications & Risk Badge */}
          <div className="flex items-center gap-2.5">
            {/* Location Selector */}
            <button
              type="button"
              onClick={() => setShowLocationModal(true)}
              aria-label={`Change location. Currently ${locationName}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-medium transition-colors border border-slate-200"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span className="max-w-[100px] sm:max-w-[140px] truncate">{locationName}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" aria-hidden="true" />
            </button>

            {/* Risk Badge — only rendered once a real score exists. */}
            {riskCategory && riskScore !== null && riskTheme ? (
              <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${riskTheme.badge}`}>
                <span className="w-2 h-2 rounded-full bg-current" aria-hidden="true"></span>
                <span>{riskCategory.toUpperCase()} RISK ({riskScore})</span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border bg-slate-100 text-slate-400 border-slate-200">
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" aria-hidden="true"></span>
                <span>{isRiskLoading ? 'CALCULATING RISK' : 'RISK UNAVAILABLE'}</span>
              </div>
            )}

            {/* Install App Button */}
            <button
              type="button"
              onClick={() => setShowInstallModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-colors border border-emerald-200 shadow-2xs"
              aria-label="Install AllerScan on iOS or Android"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span className="hidden sm:inline">Install App</span>
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              onClick={onOpenNotifications}
              className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              aria-label={
                unreadNotifCount > 0
                  ? `Alerts and notifications, ${unreadNotifCount} unread`
                  : 'Alerts and notifications'
              }
            >
              <Bell className="w-5 h-5" aria-hidden="true" />
              {unreadNotifCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center"
                >
                  {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Install App on iOS & Android Modal */}
      <InstallAppModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />

      {/* Location Picker Modal */}
      <Modal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        title="Select location"
        header={
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-600" aria-hidden="true" /> Select Location
          </h2>
        }
      >
        <p className="text-xs text-slate-500 mb-3">
          Search any city worldwide to fetch tailored local pollen counts and air quality data.
        </p>

        <div className="mb-3">
          <label htmlFor="location-search" className="sr-only">
            Search for a city
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" aria-hidden="true" />
            <input
              id="location-search"
              data-autofocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city e.g. Austin, London, Tokyo..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 px-1">
            <span>{searchQuery.trim() ? 'Worldwide geocoding' : 'Popular cities'}</span>
            {isSearching && <span>Searching…</span>}
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1 divide-y divide-slate-100" aria-live="polite">
          {isSearching ? (
            <div className="py-6 text-center text-xs text-slate-400">Searching global locations…</div>
          ) : searchError ? (
            <div className="py-6 px-3 text-center text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl flex flex-col items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden="true" />
              <span>{searchError}</span>
              <button
                type="button"
                onClick={() => setRetryToken((t) => t + 1)}
                className="font-bold text-emerald-700 hover:underline"
              >
                Retry search
              </button>
            </div>
          ) : searchResults.length > 0 ? (
            searchResults.map((item, idx) => {
              const isCurrent = locationName.toLowerCase() === item.cityName.toLowerCase();
              return (
                <button
                  type="button"
                  key={`${item.cityName}-${item.region}-${idx}`}
                  onClick={() => handleSelectLocation(item)}
                  aria-current={isCurrent ? 'true' : undefined}
                  className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 rounded-lg flex items-center justify-between group transition-colors"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800 group-hover:text-emerald-700">
                      {item.cityName}
                    </div>
                    <div className="text-xs text-slate-400">{item.region}</div>
                  </div>
                  {isCurrent && <CheckCircle className="w-4 h-4 text-emerald-600" aria-hidden="true" />}
                </button>
              );
            })
          ) : (
            <div className="py-6 text-center text-xs text-slate-500">
              No matching cities found. Try typing a city name or country.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
