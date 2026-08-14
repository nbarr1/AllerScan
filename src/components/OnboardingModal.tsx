import React, { useState } from 'react';
import {
  ShieldAlert,
  Check,
  ChevronRight,
  Sparkles,
  AlertCircle,
  Trees,
  Wheat,
  Flower2,
  Biohazard,
  Home
} from 'lucide-react';
import { MASTER_ALLERGENS, ALLERGEN_CATEGORIES } from '../data/allergensDatabase';
import { UserAllergenProfile, SeverityLevel, AllergenCategory } from '../types';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (profile: UserAllergenProfile) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedIds, setSelectedIds] = useState<string[]>(['ragweed', 'oak', 'bermuda_grass', 'dust_mites']);
  const [severities, setSeverities] = useState<Record<string, SeverityLevel>>({
    ragweed: 'severe',
    oak: 'moderate',
    bermuda_grass: 'moderate',
    dust_mites: 'mild',
  });
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<AllergenCategory>('tree');

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

  const handleFinish = () => {
    const newProfile: UserAllergenProfile = {
      allergens: severities,
      location: {
        cityName: 'Austin',
        region: 'Texas, USA',
        lat: 30.2672,
        lng: -97.7431,
      },
      sensitivityFactor: 2,
      onboarded: true,
    };
    onComplete(newProfile);
  };

  const categoryIcons: Record<AllergenCategory, React.ElementType> = {
    tree: Trees,
    grass: Wheat,
    weed: Flower2,
    mold: Biohazard,
    indoor: Home,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Step Indicator Header */}
        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Welcome to AllerScan</h2>
              <p className="text-xs text-slate-500">Step {step} of 3: {step === 1 ? 'Guardrails & Disclaimer' : step === 2 ? 'Select Allergens' : 'Set Severities'}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-6 h-2 rounded-full transition-all ${
                  step >= s ? 'bg-emerald-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* STEP 1: Medical Disclaimer & Guardrails */}
        {step === 1 && (
          <div className="space-y-5 overflow-y-auto pr-1">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 space-y-1.5">
                <p className="font-bold text-sm">Medical Disclaimer & Purpose</p>
                <p>
                  AllerScan provides environmental information, local air quality & pollen index estimations, plant species identification, and personal logging tools.
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
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span><strong>AI Camera Plant Identification:</strong> Identify trees, weeds, and grass species from photos using Gemini Vision AI.</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span><strong>Personalized Risk Gauge:</strong> Real-time pollen & AQI matching your unique profile.</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span><strong>Allergy Shot Reminders:</strong> Track immunotherapy schedules and local reactions safely.</span>
                </li>
              </ul>
            </div>

            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={disclaimerAccepted}
                onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
              <span className="text-xs font-medium text-slate-800">
                I understand that AllerScan is for environmental tracking only and is not medical advice.
              </span>
            </label>

            <button
              disabled={!disclaimerAccepted}
              onClick={() => setStep(2)}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              <span>Continue to Profile Setup</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: Select Allergens from Categorized List */}
        {step === 2 && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Category Filter Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-2 border-b border-slate-100 mb-3">
              {ALLERGEN_CATEGORIES.map((cat) => {
                const Icon = categoryIcons[cat.key as AllergenCategory];
                const isActive = activeCategoryFilter === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => setActiveCategoryFilter(cat.key as AllergenCategory)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* List of Allergens in Category */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-4">
              {MASTER_ALLERGENS.filter((a) => a.category === activeCategoryFilter).map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleAllergen(item.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                        isSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                      <div>
                        <div className="text-sm font-bold">{item.name}</div>
                        <div className="text-[11px] text-slate-500 italic">{item.scientificName} • {item.season}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="text-xs font-medium text-slate-500">
                {selectedIds.length} allergen{selectedIds.length === 1 ? '' : 's'} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-semibold text-xs rounded-xl hover:bg-slate-100"
                >
                  Back
                </button>
                <button
                  disabled={selectedIds.length === 0}
                  onClick={() => setStep(3)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1"
                >
                  <span>Next: Set Severities</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Severity Weighting per Selected Allergen */}
        {step === 3 && (
          <div className="flex-1 flex flex-col min-h-0">
            <p className="text-xs text-slate-500 mb-3">
              Assign severity ratings to weight your daily environmental risk score:
            </p>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
              {selectedIds.map((id) => {
                const meta = MASTER_ALLERGENS.find((m) => m.id === id);
                if (!meta) return null;
                const currentSev = severities[id] || 'moderate';

                return (
                  <div key={id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-900">{meta.name}</span>
                      <span className="text-[10px] text-slate-500 italic">{meta.scientificName}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {(['mild', 'moderate', 'severe'] as SeverityLevel[]).map((sev) => {
                        const isSelected = currentSev === sev;
                        return (
                          <button
                            key={sev}
                            onClick={() => handleSeverityChange(id, sev)}
                            className={`py-1.5 text-xs font-bold capitalize rounded-lg border transition-all ${
                              isSelected
                                ? sev === 'severe'
                                  ? 'bg-rose-600 border-rose-600 text-white'
                                  : sev === 'moderate'
                                  ? 'bg-amber-500 border-amber-500 text-white'
                                  : 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {sev}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 border border-slate-200 text-slate-600 font-semibold text-xs rounded-xl hover:bg-slate-100"
              >
                Back
              </button>
              <button
                onClick={handleFinish}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Launch AllerScan Dashboard</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
