import React, { useState } from 'react';
import {
  Settings,
  Bell,
  Moon,
  ShieldAlert,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  Smartphone,
  Apple,
  Download,
  ChevronRight
} from 'lucide-react';
import { InstallAppModal } from './InstallAppModal';
import { NotificationSettings, SeverityLevel } from '../types';

interface SettingsViewProps {
  settings: NotificationSettings;
  onUpdateSettings: (s: NotificationSettings) => void;
  onResetData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onResetData,
}) => {
  const [showInstallModal, setShowInstallModal] = useState(false);

  const toggleSetting = (key: keyof NotificationSettings) => {
    onUpdateSettings({ ...settings, [key]: !settings[key] });
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      
      {/* Header */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate-700" />
          Settings & App Preferences
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage alert sensitivities, quiet hours, and medical guardrails.
        </p>
      </div>

      {/* NOTIFICATION PREFERENCES */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <Bell className="w-4 h-4 text-emerald-600" /> Environmental Alert Triggers
        </h2>

        <div className="space-y-3 divide-y divide-slate-100">
          <div className="flex justify-between items-center pt-2">
            <div>
              <div className="text-xs font-bold text-slate-800">High Pollen Threshold Alerts</div>
              <div className="text-[11px] text-slate-500">Notify when matched profile allergens cross high risk index</div>
            </div>
            <input
              type="checkbox"
              checked={settings.pollenAlerts}
              onChange={() => toggleSetting('pollenAlerts')}
              className="w-4 h-4 text-emerald-600 rounded"
            />
          </div>

          <div className="flex justify-between items-center pt-3">
            <div>
              <div className="text-xs font-bold text-slate-800">Unhealthy Air Quality (AQI) Alerts</div>
              <div className="text-[11px] text-slate-500">Notify when PM2.5 or Ozone reaches unhealthy levels</div>
            </div>
            <input
              type="checkbox"
              checked={settings.aqiAlerts}
              onChange={() => toggleSetting('aqiAlerts')}
              className="w-4 h-4 text-emerald-600 rounded"
            />
          </div>

          <div className="flex justify-between items-center pt-3">
            <div>
              <div className="text-xs font-bold text-slate-800">Allergy Shot Reminders</div>
              <div className="text-[11px] text-slate-500">Day-before and day-of reminders for scheduled shots</div>
            </div>
            <input
              type="checkbox"
              checked={settings.shotReminders}
              onChange={() => toggleSetting('shotReminders')}
              className="w-4 h-4 text-emerald-600 rounded"
            />
          </div>

          <div className="flex justify-between items-center pt-3">
            <div>
              <div className="text-xs font-bold text-slate-800">Daily Morning Risk Briefing</div>
              <div className="text-[11px] text-slate-500">Send 8:00 AM summary of daily pollen risk score</div>
            </div>
            <input
              type="checkbox"
              checked={settings.dailySummary}
              onChange={() => toggleSetting('dailySummary')}
              className="w-4 h-4 text-emerald-600 rounded"
            />
          </div>
        </div>
      </div>

      {/* QUIET HOURS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <Moon className="w-4 h-4 text-indigo-600" /> Quiet Hours Configuration
        </h2>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-800">Enable Quiet Hours</span>
            <input
              type="checkbox"
              checked={settings.quietHoursEnabled}
              onChange={() => toggleSetting('quietHoursEnabled')}
              className="w-4 h-4 text-emerald-600 rounded"
            />
          </div>

          {settings.quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Start Time</label>
                <input
                  type="time"
                  value={settings.quietHoursStart}
                  onChange={(e) => onUpdateSettings({ ...settings, quietHoursStart: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">End Time</label>
                <input
                  type="time"
                  value={settings.quietHoursEnd}
                  onChange={(e) => onUpdateSettings({ ...settings, quietHoursEnd: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MOBILE APPLICATION & PWA INSTALLATION */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl text-white shadow-md border border-slate-700/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                Mobile & Native App Setup
              </h2>
              <p className="text-[11px] text-slate-300">Run on iPhone, iPad, Android & App Store builds</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            iOS & Android Ready
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Install AllerScan as a native full-screen PWA on your mobile home screen with camera access and local data persistence, or export to Xcode / Android Studio via Capacitor.
        </p>

        <button
          onClick={() => setShowInstallModal(true)}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          <span>View iOS & Android Installation Guide</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* MEDICAL DISCLAIMER & GUARDRAILS NOTICE */}
      <div className="p-5 bg-amber-50 border border-amber-200 rounded-3xl space-y-2">
        <h3 className="text-xs font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-amber-600" /> Medical Disclaimer & Guardrail Limits
        </h3>
        <p className="text-xs text-amber-900 leading-relaxed">
          AllerScan provides environmental information and pollen predictions for informational tracking purposes only. Identification confidence scores are probabilistic model estimations and should never be used as diagnostic medical proof. Consult a licensed physician or allergist for official allergy diagnostic testing and immunotherapy care.
        </p>
      </div>

      {/* RESET APP DATA */}
      <div className="p-5 bg-white border border-slate-200 rounded-3xl flex justify-between items-center">
        <div>
          <div className="text-xs font-bold text-slate-900">Reset Local Storage & Seed Data</div>
          <div className="text-[11px] text-slate-500">Restore default sample profile, shot schedule, and scan logs</div>
        </div>
        <button
          onClick={onResetData}
          className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset All Data</span>
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
