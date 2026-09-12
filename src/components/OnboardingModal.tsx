import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert,
  Check,
  ChevronRight,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  MapPin,
  Search,
  Trees,
  Wheat,
  Flower2,
  Biohazard,
  Home
} from 'lucide-react';
import { Modal } from './Modal';
import { MASTER_ALLERGENS, ALLERGEN_CATEGORIES } from '../data/allergensDatabase';
import { DEFAULT_CITY_OPTIONS } from '../data/defaultCities';
import { UserAllergenProfile, SeverityLevel, AllergenCategory } from '../types';

interface OnboardingLocation {
  cityName: string;
  region: string;
  lat: number;
  lng: number;
}

interface OnboardingModalProps {
  isOpen: boolean;
  initialLocation: OnboardingLocation;
  onComplete: (profile: UserAllergenProfile) => void;
}

type Step = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<Step, string> = {
  1: 'Guardrails & Disclaimer',
  2: 'Your Location',
  3: 'Select Allergens',
  4: 'Set Severities',
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  initialLocation,
  onComplete,
}) => {
  const [step, setStep] = useState<Step>(1);

  // Nothing is pre-selected. Seeding a new user with ragweed marked "severe" hands them a
  // medical profile they never entered, and every risk score after that is scored against it.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [severities, setSeverities] = useState<Record<string, SeverityLevel>>({});

  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<AllergenCategory>('tree');

  // Location step — the app is entirely location-driven, so this can't be left to a default.
  const [location, setLocation] = useState<OnboardingLocation>(initialLocation);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<Array<{ cityName: string; region: string; lat?: number; lng?: number }>>(DEFAULT_CITY_OPTIONS);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const cityRequestId = useRef(0);

  useEffect(() => {
    if (step !== 2) return;

    if (!cityQuery.trim()) {
      cityRequestId.current += 1;
      setCityResults(DEFAULT_CITY_OPTIONS);
      setCityError(null);
      setIsSearchingCity(false);
      return;
    }

    setIsSearchingCity(true);
    const timer = setTimeout(async () => {
      const requestId = ++cityRequestId.current;
      try {
        const resp = await fetch(`/api/location-search?q=${encodeURIComponent(cityQuery)}`);
        if (!resp.ok) throw new Error(`Search returned ${resp.status}`);
        const data = await resp.json();
        if (requestId !== cityRequestId.current) return;
        if (!Array.isArray(data)) throw new Error('Unexpected response');
        setCityResults(data);
        setCityError(null);
      } catch (err) {
        if (requestId !== cityRequestId.current) return;
        console.error('Onboarding city search failed:', err);
        setCityResults([]);
        setCityError("Couldn't reach the location service. Pick a city from the list or try again.");
      } finally {
        if (requestId === cityRequestId.current) setIsSearchingCity(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [cityQuery, step]);

  if (!isOpen) return null;

  const toggleAllergen = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
      const copy = { ...severities };
      delete copy[id];
      setSeverities(copy);
    } else {
      setSelectedIds([...selectedIds, id]);
      setSeverities({ ...severities, [id]: 'moderate' });
    }
  };

  const handleSeverityChange = (id: string, sev: SeverityLevel) => {
    setSeverities({ ...severities, [id]: sev });
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('This browser cannot share your location. Search for your city instead.');
      return;
    }
    setIsLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const resp = await fetch(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`);
          if (resp.ok) {
            const place = await resp.json();
            if (place && place.cityName) {
              setLocation({ cityName: place.cityName, region: place.region || '', lat: latitude, lng: longitude });
              setLocationConfirmed(true);
              setIsLocating(false);
              return;
            }
          }
          throw new Error('Could not name that place');
        } catch {
          // Coordinates are what the data actually needs; the name is only a label.
          setLocation({ cityName: 'My location', region: '', lat: latitude, lng: longitude });
          setLocationConfirmed(true);
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        console.warn('Onboarding geolocation failed:', err);
        setIsLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was declined. Search for your city instead.'
            : "Couldn't get your location. Search for your city instead."
        );
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleFinish = () => {
    onComplete({
      allergens: severities,
      location,
      sensitivityFactor: 2,
      onboarded: true,
    });
  };

  const categoryIcons: Record<AllergenCategory, React.ElementType> = {
    tree: Trees,
    grass: Wheat,
    weed: Flower2,
    mold: Biohazard,
    indoor: Home,
  };

  const severityButtonClass = (sev: SeverityLevel, isSelected: boolean) => {
    if (!isSelected) return 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100';
    if (sev === 'severe') return 'bg-rose-600 border-rose-600 text-white';
    if (sev === 'moderate') return 'bg-amber-500 border-amber-500 text-white';
    return 'bg-emerald-600 border-emerald-600 text-white';
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Welcome to AllerScan"
      size="max-w-xl"
      header={
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0">
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Welcome to AllerScan</h2>
              <p className="text-xs text-slate-500">Step {step} of 4: {STEP_TITLES[step]}</p>
            </div>
          </div>
          <ol className="flex gap-1.5" aria-label={`Setup progress: step ${step} of 4`}>
            {([1, 2, 3, 4] as Step[]).map((s) => (
              <li
                key={s}
                aria-current={s === step ? 'step' : undefined}
                className={`w-6 h-2 rounded-full transition-all ${step >= s ? 'bg-emerald-600' : 'bg-slate-200'}`}
              />
            ))}
          </ol>
        </div>
      }
    >
      {/* STEP 1: Medical Disclaimer & Guardrails */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-amber-900 space-y-1.5">
              <p className="font-bold text-sm">Medical Disclaimer &amp; Purpose</p>
              <p>
                AllerScan provides environmental information, local air quality &amp; pollen index estimations, plant species identification, and personal logging tools.
              </p>
              <p className="font-medium">
                ⚠️ AllerScan is NOT a medical device and does NOT provide medical diagnosis or treatment advice. Consult a certified allergist or physician for diagnostic testing and immunotherapy management.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Key Features You'll Get:</h3>
            <ul className="space-y-2 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span><strong>AI Camera Plant Identification:</strong> Identify trees, weeds, and grass species from photos using Gemini Vision AI.</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span><strong>Personalized Risk Gauge:</strong> Live pollen &amp; AQI matched against your own profile.</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span><strong>Allergy Shot Tracking:</strong> Track immunotherapy schedules and local reactions.</span>
              </li>
            </ul>
          </div>

          <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              id="onboarding-disclaimer"
              type="checkbox"
              checked={disclaimerAccepted}
              onChange={(e) => setDisclaimerAccepted(e.target.checked)}
              className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 shrink-0"
            />
            <span className="text-xs font-medium text-slate-800">
              I understand that AllerScan is for environmental tracking only and is not medical advice.
            </span>
          </label>

          <button
            type="button"
            disabled={!disclaimerAccepted}
            onClick={() => setStep(2)}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
          >
            <span>Continue to Profile Setup</span>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* STEP 2: Location */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Every pollen count, air quality reading and forecast in AllerScan is specific to one place. Pick yours.
          </p>

          <div className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
            locationConfirmed ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'
          }`}>
            <MapPin className={`w-5 h-5 shrink-0 ${locationConfirmed ? 'text-emerald-600' : 'text-slate-400'}`} aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {locationConfirmed ? 'Selected location' : 'No location selected yet'}
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {locationConfirmed ? [location.cityName, location.region].filter(Boolean).join(', ') : 'Search below, or use your device location'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={isLocating}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2"
          >
            <MapPin className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>{isLocating ? 'Finding your location…' : 'Use my current location'}</span>
          </button>

          {geoError && (
            <p role="status" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{geoError}</span>
            </p>
          )}

          <div>
            <label htmlFor="onboarding-city" className="text-xs font-bold text-slate-700 block mb-1">
              Or search for your city
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" aria-hidden="true" />
              <input
                id="onboarding-city"
                type="text"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="e.g. Austin, London, Tokyo…"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl" aria-live="polite">
            {isSearchingCity ? (
              <div className="py-6 text-center text-xs text-slate-400">Searching…</div>
            ) : cityError ? (
              <div className="py-5 px-3 text-center text-xs text-amber-800">{cityError}</div>
            ) : cityResults.length > 0 ? (
              cityResults.map((city, idx) => (
                <button
                  type="button"
                  key={`${city.cityName}-${idx}`}
                  onClick={() => {
                    setLocation({
                      cityName: city.cityName,
                      region: city.region,
                      lat: city.lat ?? location.lat,
                      lng: city.lng ?? location.lng,
                    });
                    setLocationConfirmed(true);
                    setGeoError(null);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 flex items-center justify-between transition-colors"
                >
                  <span className="text-sm font-semibold text-slate-800">{city.cityName}</span>
                  <span className="text-xs text-slate-400">{city.region}</span>
                </button>
              ))
            ) : (
              <div className="py-5 text-center text-xs text-slate-500">No matching cities found.</div>
            )}
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-2 border border-slate-200 text-slate-600 font-semibold text-xs rounded-xl hover:bg-slate-100"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!locationConfirmed}
              onClick={() => setStep(3)}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1"
            >
              <span>Next: Select Allergens</span>
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Select Allergens from Categorized List */}
      {step === 3 && (
        <div className="flex flex-col">
          <div className="flex gap-1 overflow-x-auto pb-2 border-b border-slate-100 mb-3" role="tablist" aria-label="Allergen categories">
            {ALLERGEN_CATEGORIES.map((cat) => {
              const Icon = categoryIcons[cat.key as AllergenCategory];
              const isActive = activeCategoryFilter === cat.key;
              const selectedInCategory = MASTER_ALLERGENS.filter(
                (a) => a.category === cat.key && selectedIds.includes(a.id)
              ).length;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  key={cat.key}
                  onClick={() => setActiveCategoryFilter(cat.key as AllergenCategory)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    isActive ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{cat.label}</span>
                  {selectedInCategory > 0 && (
                    <span className={`px-1.5 rounded-full text-[10px] ${isActive ? 'bg-white/25' : 'bg-emerald-600 text-white'}`}>
                      {selectedInCategory}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-2 mb-4">
            {MASTER_ALLERGENS.filter((a) => a.category === activeCategoryFilter).map((item) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => toggleAllergen(item.id)}
                  aria-pressed={isSelected}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                    isSelected
                      ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </span>
                  <span>
                    <span className="text-sm font-bold block">{item.name}</span>
                    <span className="text-[11px] text-slate-500 italic">{item.scientificName} • {item.season}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <span className="text-xs font-medium text-slate-500">
              {selectedIds.length} allergen{selectedIds.length === 1 ? '' : 's'} selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 border border-slate-200 text-slate-600 font-semibold text-xs rounded-xl hover:bg-slate-100"
              >
                Back
              </button>
              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => setStep(4)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1"
              >
                <span>Next: Set Severities</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Severity Weighting per Selected Allergen */}
      {step === 4 && (
        <div className="flex flex-col">
          <p className="text-xs text-slate-500 mb-3">
            Assign severity ratings to weight your daily environmental risk score:
          </p>

          <div className="space-y-3 mb-4">
            {selectedIds.map((id) => {
              const meta = MASTER_ALLERGENS.find((m) => m.id === id);
              if (!meta) return null;
              const currentSev = severities[id] || 'moderate';

              return (
                <fieldset key={id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <legend className="sr-only">Severity for {meta.name}</legend>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-900">{meta.name}</span>
                    <span className="text-[10px] text-slate-500 italic">{meta.scientificName}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {(['mild', 'moderate', 'severe'] as SeverityLevel[]).map((sev) => (
                      <button
                        type="button"
                        key={sev}
                        onClick={() => handleSeverityChange(id, sev)}
                        aria-pressed={currentSev === sev}
                        className={`py-1.5 text-xs font-bold capitalize rounded-lg border transition-all ${severityButtonClass(sev, currentSev === sev)}`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-4 py-2 border border-slate-200 text-slate-600 font-semibold text-xs rounded-xl hover:bg-slate-100"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleFinish}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Launch AllerScan Dashboard</span>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
