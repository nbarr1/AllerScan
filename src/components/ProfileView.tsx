import React, { useState } from 'react';
import {
  UserCheck,
  Plus,
  Check,
  Trash2,
  Trees,
  Wheat,
  Flower2,
  Biohazard,
  Home,
  Sliders,
  Download
} from 'lucide-react';
import { MASTER_ALLERGENS, ALLERGEN_CATEGORIES } from '../data/allergensDatabase';
import { UserAllergenProfile, SeverityLevel, AllergenCategory, CustomAllergenMeta } from '../types';

interface ProfileViewProps {
  userProfile: UserAllergenProfile;
  onUpdateProfile: (p: UserAllergenProfile) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userProfile,
  onUpdateProfile,
}) => {
  const [activeCategory, setActiveCategory] = useState<AllergenCategory>('tree');
  const [customName, setCustomName] = useState('');
  const [customCat, setCustomCat] = useState<AllergenCategory>('indoor');

  const categoryIcons: Record<AllergenCategory, React.ElementType> = {
    tree: Trees,
    grass: Wheat,
    weed: Flower2,
    mold: Biohazard,
    indoor: Home,
  };

  const handleToggleAllergen = (id: string) => {
    const copy = { ...userProfile.allergens };
    if (copy[id]) {
      delete copy[id];
    } else {
      copy[id] = 'moderate';
    }
    onUpdateProfile({ ...userProfile, allergens: copy });
  };

  const handleSeverityChange = (id: string, sev: SeverityLevel) => {
    const copy = { ...userProfile.allergens, [id]: sev };
    onUpdateProfile({ ...userProfile, allergens: copy });
  };

  const handleAddCustom = () => {
    if (!customName.trim()) return;
    const cleanId = 'custom_' + customName.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!cleanId || cleanId === 'custom_') return;

    const allergensCopy = { ...userProfile.allergens, [cleanId]: 'moderate' as SeverityLevel };
    const customCopy: Record<string, CustomAllergenMeta> = {
      ...(userProfile.customAllergens || {}),
      [cleanId]: { name: customName.trim(), category: customCat },
    };
    onUpdateProfile({ ...userProfile, allergens: allergensCopy, customAllergens: customCopy });
    setCustomName('');
  };

  const handleRemoveCustom = (id: string) => {
    const allergensCopy = { ...userProfile.allergens };
    delete allergensCopy[id];
    const customCopy = { ...(userProfile.customAllergens || {}) };
    delete customCopy[id];
    onUpdateProfile({ ...userProfile, allergens: allergensCopy, customAllergens: customCopy });
  };

  const exportProfileJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userProfile, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "allerscan_profile.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const customAllergenEntries: [string, CustomAllergenMeta][] = Object.entries(userProfile.customAllergens || {});

  return (
    <div className="space-y-6 pb-20 md:pb-8">

      {/* Title & Export */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-emerald-600" />
            My Personal Allergen Profile & Severity Ratings
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure known triggers to weight your daily environmental risk gauge and camera scan alerts.
          </p>
        </div>

        <button
          onClick={exportProfileJson}
          className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5"
        >
          <Download className="w-4 h-4 text-emerald-600" />
          <span>Export Profile JSON</span>
        </button>
      </div>

      {/* CATEGORY SELECTOR TABS */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ALLERGEN_CATEGORIES.map((cat) => {
          const Icon = categoryIcons[cat.key as AllergenCategory];
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key as AllergenCategory)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all border ${
                isActive
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* ALLERGEN SELECTION GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MASTER_ALLERGENS.filter((item) => item.category === activeCategory).map((item) => {
          const isSelected = Boolean(userProfile.allergens[item.id]);
          const currentSev = userProfile.allergens[item.id] || 'moderate';

          return (
            <div
              key={item.id}
              className={`p-4 rounded-3xl border transition-all ${
                isSelected
                  ? 'bg-white border-emerald-400 shadow-sm ring-1 ring-emerald-400/20'
                  : 'bg-slate-50 border-slate-200 opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">{item.name}</h3>
                  <p className="text-[11px] text-slate-400 italic">{item.scientificName}</p>
                </div>

                <button
                  onClick={() => handleToggleAllergen(item.id)}
                  className={`px-3 py-1 text-xs font-bold rounded-xl border transition-colors ${
                    isSelected
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {isSelected ? 'Selected ✓' : '+ Add Trigger'}
                </button>
              </div>

              {isSelected && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Assigned Severity Urgency:
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['mild', 'moderate', 'severe'] as SeverityLevel[]).map((sev) => (
                      <button
                        key={sev}
                        onClick={() => handleSeverityChange(item.id, sev)}
                        className={`py-1 text-xs font-bold capitalize rounded-lg border transition-all ${
                          currentSev === sev
                            ? sev === 'severe'
                              ? 'bg-rose-600 border-rose-600 text-white'
                              : sev === 'moderate'
                              ? 'bg-amber-500 border-amber-500 text-white'
                              : 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MY CUSTOM TRIGGERS */}
      {customAllergenEntries.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-600" /> My Custom Triggers
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customAllergenEntries.map(([id, meta]) => {
              const currentSev = userProfile.allergens[id] || 'moderate';
              const CatIcon = categoryIcons[meta.category];

              return (
                <div
                  key={id}
                  className="p-4 rounded-3xl border border-emerald-400 bg-white shadow-sm ring-1 ring-emerald-400/20"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                        <CatIcon className="w-3.5 h-3.5 text-emerald-600" />
                        {meta.name}
                      </h3>
                      <p className="text-[11px] text-slate-400 italic capitalize">Custom {meta.category} trigger</p>
                    </div>

                    <button
                      onClick={() => handleRemoveCustom(id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors"
                      title="Remove custom trigger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Assigned Severity Urgency:
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['mild', 'moderate', 'severe'] as SeverityLevel[]).map((sev) => (
                        <button
                          key={sev}
                          onClick={() => handleSeverityChange(id, sev)}
                          className={`py-1 text-xs font-bold capitalize rounded-lg border transition-all ${
                            currentSev === sev
                              ? sev === 'severe'
                                ? 'bg-rose-600 border-rose-600 text-white'
                                : sev === 'moderate'
                                ? 'bg-amber-500 border-amber-500 text-white'
                                : 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {sev}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CUSTOM ALLERGEN ENTRY FORM */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-600" /> Add Custom Environmental Trigger
        </h3>
        <p className="text-[11px] text-slate-400 -mt-2">
          Custom triggers are estimated using their category's regional pollen index (e.g. a custom tree trigger uses the local tree pollen level) since AllerScan has no species-specific data for them.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="e.g. Cedar Elm, Mountain Pine, Cedar Fever..."
            className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <select
            value={customCat}
            onChange={(e: any) => setCustomCat(e.target.value)}
            className="px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="tree">Tree</option>
            <option value="grass">Grass</option>
            <option value="weed">Weed</option>
            <option value="mold">Mold</option>
            <option value="indoor">Indoor / Other</option>
          </select>
          <button
            onClick={handleAddCustom}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs"
          >
            Add Trigger
          </button>
        </div>
      </div>

    </div>
  );
};
