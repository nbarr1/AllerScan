import React, { useState } from 'react';
import {
  Settings,
  Bell,
  Moon,
  AlertCircle,
  RotateCcw,
  Smartphone,
  Download,
  ChevronRight,
  Info
} from 'lucide-react';
import { InstallAppModal } from './InstallAppModal';
import { NotificationSettings, SeverityLevel } from '../types';
import { isWithinQuietHours } from '../utils/notifications';

interface SettingsViewProps {
  settings: NotificationSettings;
  onUpdateSettings: (s: NotificationSettings) => void;
  onResetData: () => void;
}

type ToggleKey = 'pollenAlerts' | 'aqiAlerts' | 'shotReminders' | 'dailySummary';

const ALERT_TOGGLES: Array<{ key: ToggleKey; label: string; description: string }> = [
  {
    key: 'pollenAlerts',
    label: 'High pollen alerts',
    description: 'Alert when one of your saved allergens reaches High or Very High',
  },
  {
    key: 'aqiAlerts',
    label: 'Unhealthy air quality alerts',
    description: 'Alert when the local AQI passes 100 (unhealthy for sensitive groups)',
  },
  {
    key: 'shotReminders',
    label: 'Allergy shot reminders',
    description: 'Remind you the day before, the day of, and while a dose is overdue',
  },
  {
    key: 'dailySummary',
    label: 'Daily risk summary',
    description: "One summary of the day's risk score the first time you open the app",
  },
];

const SEVERITY_CHOICES: Array<{ value: SeverityLevel; label: string; description: string }> = [
  { value: 'mild', label: 'Mild and up', description: 'Alert me about every saved trigger' },
  { value: 'moderate', label: 'Moderate and up', description: 'Skip triggers marked mild' },
  { value: 'severe', label: 'Severe only', description: 'Only my worst triggers' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onResetData,
}) => {
  const [showInstallModal, setShowInstallModal] = useState(false);

  const toggleSetting = (key: ToggleKey) => {
    onUpdateSettings({ ...settings, [key]: !settings[key] });
  };

  const quietNow = isWithinQuietHours(settings);

  return (
    <div className="space-y-6 pb-20 md:pb-8">

      {/* Header */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate-700" aria-hidden="true" />
          Settings &amp; App Preferences
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage alert sensitivities, quiet hours, and medical guardrails.
        </p>
      </div>

      {/* NOTIFICATION PREFERENCES */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Environmental Alert Triggers
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
            <span>
              These appear in the app's notification bell when AllerScan refreshes your data. They
              are not push notifications and don't reach you while the app is closed.
            </span>
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {ALERT_TOGGLES.map(({ key, label, description }) => (
            <label
              key={key}
              htmlFor={`setting-${key}`}
              className="flex justify-between items-center gap-4 py-3 cursor-pointer group"
            >
              <span className="min-w-0">
                <span className="text-xs font-bold text-slate-800 block group-hover:text-slate-900">{label}</span>
                <span className="text-[11px] text-slate-500 block">{description}</span>
              </span>
              <input
                id={`setting-${key}`}
                type="checkbox"
                checked={settings[key]}
                onChange={() => toggleSetting(key)}
                className="w-6 h-6 text-emerald-600 rounded shrink-0 cursor-pointer"
              />
            </label>
          ))}
        </div>

        <fieldset className="pt-2 border-t border-slate-100">
          <legend className="text-xs font-bold text-slate-800 mb-1">Alert me about triggers rated</legend>
          <p className="text-[11px] text-slate-500 mb-2">
            Applies to pollen alerts, using the severity you assigned each allergen in My Allergens.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SEVERITY_CHOICES.map((choice) => {
              const isActive = settings.minSeverityTrigger === choice.value;
              return (
                <button
                  type="button"
                  key={choice.value}
                  aria-pressed={isActive}
                  onClick={() => onUpdateSettings({ ...settings, minSeverityTrigger: choice.value })}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    isActive
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-xs font-extrabold block">{choice.label}</span>
                  <span className={`text-[11px] block mt-0.5 ${isActive ? 'text-emerald-50' : 'text-slate-500'}`}>
                    {choice.description}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* QUIET HOURS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <Moon className="w-4 h-4 text-indigo-600" aria-hidden="true" /> Quiet Hours
        </h2>

        <div className="space-y-3">
          <label htmlFor="setting-quiet-hours" className="flex justify-between items-center gap-4 cursor-pointer">
            <span>
              <span className="text-xs font-bold text-slate-800 block">Enable quiet hours</span>
              <span className="text-[11px] text-slate-500 block">
                No new alerts are created during this window
                {settings.quietHoursEnabled && quietNow ? ' — quiet right now' : ''}
              </span>
            </span>
            <input
              id="setting-quiet-hours"
              type="checkbox"
              checked={settings.quietHoursEnabled}
              onChange={() => onUpdateSettings({ ...settings, quietHoursEnabled: !settings.quietHoursEnabled })}
              className="w-6 h-6 text-emerald-600 rounded shrink-0 cursor-pointer"
            />
          </label>

          {settings.quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label htmlFor="quiet-start" className="text-xs font-bold text-slate-700 block mb-1">Start time</label>
                <input
                  id="quiet-start"
                  type="time"
                  value={settings.quietHoursStart}
                  onChange={(e) => onUpdateSettings({ ...settings, quietHoursStart: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label htmlFor="quiet-end" className="text-xs font-bold text-slate-700 block mb-1">End time</label>
                <input
                  id="quiet-end"
                  type="time"
                  value={settings.quietHoursEnd}
                  onChange={(e) => onUpdateSettings({ ...settings, quietHoursEnd: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              {settings.quietHoursStart === settings.quietHoursEnd && (
                <p role="status" className="col-span-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  Start and end are the same, so quiet hours cover no time at all. Set different times
                  to silence a window.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MOBILE APPLICATION & PWA INSTALLATION */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl text-white shadow-md border border-slate-700/80 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Mobile &amp; Native App Setup</h2>
              <p className="text-[11px] text-slate-300">Run on iPhone, iPad, Android &amp; native builds</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Add AllerScan to your home screen to open it full-screen with camera access, or export it
          to Xcode / Android Studio via Capacitor.
        </p>

        <button
          type="button"
          onClick={() => setShowInstallModal(true)}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>View iOS &amp; Android installation guide</span>
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* MEDICAL DISCLAIMER & GUARDRAILS NOTICE */}
      <div className="p-5 bg-amber-50 border border-amber-200 rounded-3xl space-y-2">
        <h2 className="text-xs font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-amber-600" aria-hidden="true" /> Medical Disclaimer &amp; Guardrail Limits
        </h2>
        <p className="text-xs text-amber-900 leading-relaxed">
          AllerScan provides environmental information and pollen predictions for informational tracking purposes only. Identification confidence scores are probabilistic model estimations and should never be used as diagnostic medical proof. Consult a licensed physician or allergist for official allergy diagnostic testing and immunotherapy care.
        </p>
      </div>

      {/* DELETE APP DATA */}
      <div className="p-5 bg-white border border-slate-200 rounded-3xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xs font-bold text-slate-900">Delete all AllerScan data on this device</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Permanently removes your allergen profile, shot schedule and history, symptom journal,
            saved scans and settings. There's no account and no backup, so this can't be undone.
          </p>
        </div>
        <button
          type="button"
          onClick={onResetData}
          className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Delete all data</span>
        </button>
      </div>

      {/* Install App Modal */}
      <InstallAppModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />
    </div>
  );
};
