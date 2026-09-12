import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Map,
  Camera,
  Syringe,
  Activity,
  UserCheck,
  Settings,
  MoreHorizontal,
  X
} from 'lucide-react';

export type TabType = 'dashboard' | 'heatmap' | 'scan' | 'shots' | 'history' | 'profile' | 'settings';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  dueShotsCount?: number;
}

interface TabDef {
  id: TabType;
  label: string;
  /** Shorter label for the narrow mobile bar, where the full one truncates. */
  shortLabel: string;
  icon: React.ElementType;
  highlight?: boolean;
}

const TABS: TabDef[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Today', icon: LayoutDashboard },
  { id: 'heatmap', label: 'Pollen Heatmap', shortLabel: 'Map', icon: Map, highlight: true },
  { id: 'scan', label: 'Scan Plant', shortLabel: 'Scan', icon: Camera },
  { id: 'shots', label: 'Allergy Shots', shortLabel: 'Shots', icon: Syringe },
  { id: 'history', label: 'Insights & Logs', shortLabel: 'Logs', icon: Activity },
  { id: 'profile', label: 'My Allergens', shortLabel: 'Allergens', icon: UserCheck },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

// Seven destinations across a 360px viewport leaves ~48px each and truncates every label. Four
// stay in the bar; the rest move behind "More".
const MOBILE_PRIMARY: TabType[] = ['dashboard', 'heatmap', 'scan', 'shots'];

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  dueShotsCount = 0,
}) => {
  const [showMore, setShowMore] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const badgeFor = (id: TabType) => (id === 'shots' && dueShotsCount > 0 ? dueShotsCount : undefined);

  const primaryTabs = TABS.filter((tab) => MOBILE_PRIMARY.includes(tab.id));
  const overflowTabs = TABS.filter((tab) => !MOBILE_PRIMARY.includes(tab.id));
  const overflowIsActive = overflowTabs.some((tab) => tab.id === activeTab);

  useEffect(() => {
    if (!showMore) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowMore(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(event.target as Node)) setShowMore(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [showMore]);

  const selectTab = (tab: TabType) => {
    onTabChange(tab);
    setShowMore(false);
  };

  return (
    <>
      {/* Desktop / Tablet Sub-Header Bar */}
      <nav className="hidden md:block bg-slate-900 text-slate-100 shadow-md" aria-label="Main">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex space-x-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const badge = badgeFor(tab.id);
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                    isActive
                      ? 'border-emerald-400 text-emerald-400 bg-slate-800/60'
                      : 'border-transparent text-slate-300 hover:text-white hover:bg-slate-800/30'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${tab.highlight ? 'text-emerald-400' : ''}`} aria-hidden="true" />
                  <span>{tab.label}</span>
                  {badge !== undefined && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-900">
                      {badge}
                      <span className="sr-only"> shot due</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Mobile "More" sheet */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs flex items-end">
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More sections"
            className="w-full bg-white rounded-t-3xl border-t border-slate-200 p-4 pb-24 shadow-2xl space-y-1"
          >
            <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-100">
              <h2 className="text-sm font-extrabold text-slate-900">More</h2>
              <button
                type="button"
                onClick={() => setShowMore(false)}
                aria-label="Close more sections"
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {overflowTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-sm font-semibold transition-colors ${
                    isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-lg"
        aria-label="Main"
      >
        <div className="flex justify-around items-stretch">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badge = badgeFor(tab.id);
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex-1 min-h-[44px] flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[11px] font-medium transition-all relative ${
                  isActive ? 'text-emerald-600 font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className={`p-1 rounded-lg ${isActive ? 'bg-emerald-50' : ''}`}>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600' : 'text-slate-500'}`} aria-hidden="true" />
                </span>
                <span className="mt-0.5">{tab.shortLabel}</span>
                {badge !== undefined && (
                  <span className="absolute top-0.5 right-1/4 w-4 h-4 rounded-full bg-amber-500 text-slate-900 text-[10px] font-bold flex items-center justify-center">
                    {badge}
                    <span className="sr-only"> shot due</span>
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowMore((open) => !open)}
            aria-expanded={showMore}
            aria-haspopup="dialog"
            className={`flex-1 min-h-[44px] flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[11px] font-medium transition-all ${
              overflowIsActive || showMore ? 'text-emerald-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className={`p-1 rounded-lg ${overflowIsActive || showMore ? 'bg-emerald-50' : ''}`}>
              <MoreHorizontal
                className={`w-5 h-5 ${overflowIsActive || showMore ? 'text-emerald-600' : 'text-slate-500'}`}
                aria-hidden="true"
              />
            </span>
            <span className="mt-0.5">More</span>
          </button>
        </div>
      </nav>
    </>
  );
};
