import React, { useState, useEffect } from 'react';
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
import { StorageService } from '../utils/storage';
import { AppNotification } from '../types';

interface HeaderProps {
  locationName: string;
  onLocationChange: (newLocation: string, lat?: number, lng?: number) => void;
  riskScore: number;
  riskCategory: string;
  onOpenNotifications: () => void;
  unreadNotifCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  locationName,
  onLocationChange,
  riskScore,
  riskCategory,
  onOpenNotifications,
  unreadNotifCount,
}) => {
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ cityName: string; region: string; lat?: number; lng?: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([
        { cityName: 'Austin', region: 'Texas, USA', lat: 30.2672, lng: -97.7431 },
        { cityName: 'New York', region: 'New York, USA', lat: 40.7128, lng: -74.0060 },
        { cityName: 'Los Angeles', region: 'California, USA', lat: 34.0522, lng: -118.2437 },
        { cityName: 'Chicago', region: 'Illinois, USA', lat: 41.8781, lng: -87.6298 },
        { cityName: 'Miami', region: 'Florida, USA', lat: 25.7617, lng: -80.1918 },
        { cityName: 'Denver', region: 'Colorado, USA', lat: 39.7392, lng: -104.9903 },
        { cityName: 'Seattle', region: 'Washington, USA', lat: 47.6062, lng: -122.3321 },
        { cityName: 'London', region: 'United Kingdom', lat: 51.5074, lng: -0.1278 },
      ]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const resp = await fetch(`/api/location-search?q=${encodeURIComponent(searchQuery)}`);
        const data = await resp.json();
        setSearchResults(data);
      } catch (err) {
        console.error('Location search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectLocation = (cityStr: string, lat?: number, lng?: number) => {
    onLocationChange(cityStr, lat, lng);
    setShowLocationModal(false);
    setSearchQuery('');
  };

  const getRiskBadgeColor = (category: string) => {
    switch (category) {
      case 'Very High':
        return 'bg-rose-500/10 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      case 'High':
        return 'bg-amber-500/10 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'Moderate':
        return 'bg-amber-500/10 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      default:
        return 'bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 sm:px-6 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xl tracking-tight text-slate-900">
                  Aller<span className="text-emerald-600">Scan</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Sparkles className="w-2.5 h-2.5" /> AI Powered
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Personal Environmental & Allergy Defense</p>
            </div>
          </div>

          {/* Right Action Bar: Location & Notifications & Risk Badge */}
          <div className="flex items-center gap-2.5">
            {/* Location Selector */}
            <button
              onClick={() => setShowLocationModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-medium transition-colors border border-slate-200"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              <span className="max-w-[100px] sm:max-w-[140px] truncate">{locationName}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Risk Badge */}
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${getRiskBadgeColor(riskCategory)}`}>
              <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
              <span>{riskCategory.toUpperCase()} RISK ({riskScore})</span>
            </div>

            {/* Install App Button */}
            <button
              onClick={() => setShowInstallModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-colors border border-emerald-200 shadow-2xs"
              title="Install on iOS & Android"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Install App</span>
            </button>

            {/* Notification Bell */}
            <button
              onClick={onOpenNotifications}
              className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="View Alerts & Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
                  {unreadNotifCount}
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
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-600" /> Select Location
              </h3>
              <button
                onClick={() => setShowLocationModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Search any city worldwide to fetch tailored local pollen counts and air quality data.
            </p>

            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city e.g. Austin, London, Tokyo..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 px-1">
                <span>Photon OpenStreetMap Geocoding</span>
                {isSearching && <span>Searching...</span>}
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 divide-y divide-slate-100">
              {isSearching ? (
                <div className="py-6 text-center text-xs text-slate-400">Searching global locations...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectLocation(`${item.cityName}, ${item.region}`, item.lat, item.lng)}
                    className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 rounded-lg flex items-center justify-between group transition-colors"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-800 group-hover:text-emerald-700">
                        {item.cityName}
                      </div>
                      <div className="text-xs text-slate-400">{item.region}</div>
                    </div>
                    {locationName.startsWith(item.cityName) && (
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    )}
                  </button>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-slate-500">
                  No matching cities found. Try typing a city name or country.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
