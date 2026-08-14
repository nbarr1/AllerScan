import React from 'react';
import {
  LayoutDashboard,
  Map,
  Camera,
  Syringe,
  Activity,
  UserCheck,
  Settings
} from 'lucide-react';

export type TabType = 'dashboard' | 'heatmap' | 'scan' | 'shots' | 'history' | 'profile' | 'settings';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  dueShotsCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  dueShotsCount = 0,
}) => {
  const tabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'heatmap' as TabType, label: 'Pollen Heatmap', icon: Map, highlight: true },
    { id: 'scan' as TabType, label: 'Scan Plant', icon: Camera },
    { id: 'shots' as TabType, label: 'Allergy Shots', icon: Syringe, badge: dueShotsCount > 0 ? dueShotsCount : undefined },
    { id: 'history' as TabType, label: 'Insights & Logs', icon: Activity },
    { id: 'profile' as TabType, label: 'My Allergens', icon: UserCheck },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Desktop / Tablet Sub-Header Bar */}
      <nav className="hidden md:block bg-slate-900 text-slate-100 shadow-md">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex space-x-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                    isActive
                      ? 'border-emerald-400 text-emerald-400 bg-slate-800/60'
                      : 'border-transparent text-slate-300 hover:text-white hover:bg-slate-800/30'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${tab.highlight ? 'text-emerald-400' : ''}`} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-900">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1 shadow-lg">
        <div className="flex justify-around items-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-medium transition-all relative ${
                  isActive
                    ? 'text-emerald-600 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <div
                  className={`p-1 rounded-lg ${
                    isActive ? 'bg-emerald-50' : ''
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600' : 'text-slate-500'}`} />
                </div>
                <span className="mt-0.5 truncate max-w-[64px]">{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-amber-500 text-slate-900 text-[10px] font-bold flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
