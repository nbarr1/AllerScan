import React, { useState, useEffect, useCallback, useRef, lazy } from 'react';
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { DashboardView } from './components/DashboardView';
import { ScanView } from './components/ScanView';
import { ShotsView } from './components/ShotsView';
import { ProfileView } from './components/ProfileView';
import { SettingsView } from './components/SettingsView';
import { OnboardingModal } from './components/OnboardingModal';
import { NotificationDrawer } from './components/NotificationDrawer';
import { ConfirmDialog } from './components/Modal';
import { LazyView } from './components/LazyView';
import { StorageService, DEFAULT_PROFILE, DEFAULT_SCHEDULE, DEFAULT_SETTINGS, INITIAL_NOTIFICATIONS, INITIAL_SYMPTOMS, INITIAL_SCANS, MAX_STORED_SCANS, MAX_DISMISSED_NOTIFICATIONS } from './utils/storage';
import { generateFallbackEnvData } from './utils/fallbackData';
import { generateNotifications, MAX_NOTIFICATIONS } from './utils/notifications';
import { daysFromToday } from './utils/dates';
import { coarseCoordinate } from './utils/coords';
import { UserAllergenProfile, ImmunotherapySchedule, SymptomLog, ScanResult, NotificationSettings, AppNotification, EnvironmentalData, SeverityLevel, CustomAllergenMeta } from './types';
import { ShieldAlert, AlertCircle, X } from 'lucide-react';

// The map (Google Maps) and the symptom chart (Recharts) are most of the bundle, and most visits
// never open either tab. Loading them on demand took the initial bundle from 822 kB.
const PollenHeatmapView = lazy(() =>
  import('./components/PollenHeatmapView').then((m) => ({ default: m.PollenHeatmapView }))
);
const HistoryView = lazy(() => import('./components/HistoryView').then((m) => ({ default: m.HistoryView })));

/**
 * How long the app waits for /api/pollen-aqi before showing the offline estimate. The server's
 * own worst case is about 4.5 s (2 s geocoding, then 2.5 s for its parallel data fetches).
 */
const ENV_REQUEST_TIMEOUT_MS = 8000;

export default function App() {
  const [userProfile, setUserProfile] = useState<UserAllergenProfile>(StorageService.getProfile);
  const [schedule, setSchedule] = useState<ImmunotherapySchedule>(StorageService.getSchedule);
  const [symptomLogs, setSymptomLogs] = useState<SymptomLog[]>(StorageService.getSymptoms);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>(StorageService.getScans);
  const [settings, setSettings] = useState<NotificationSettings>(StorageService.getSettings);
  const [notifications, setNotifications] = useState<AppNotification[]>(StorageService.getNotifications);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>(
    StorageService.getDismissedNotificationIds
  );

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(!userProfile.onboarded);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [envData, setEnvData] = useState<EnvironmentalData | null>(null);
  const [isEnvLoading, setIsEnvLoading] = useState(false);

  // Surfaced when a localStorage write fails (quota exhausted, private browsing). Silently
  // swallowing these used to leave people looking at data the app had already failed to keep.
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  // Identifies the newest in-flight environmental request. Responses that aren't the latest are
  // discarded, so switching city twice in quick succession can't leave the slower first response
  // painted over the newer one.
  const envRequestId = useRef(0);
  const envAbort = useRef<AbortController | null>(null);

  const reportSaveFailure = useCallback((what: string) => {
    setStorageWarning(
      `Couldn't save your ${what} — this device's storage for AllerScan is full. Delete a few saved photo scans to free space; everything else is unaffected.`
    );
  }, []);

  // Fetch real-time environmental pollen & AQI data from the Express backend, with a timeout and
  // an offline estimate as a labelled fallback.
  const fetchEnvironmentalData = useCallback(async (
    locationStr: string,
    allergensMap: Record<string, SeverityLevel>,
    lat?: number,
    lng?: number,
    customAllergens?: Record<string, CustomAllergenMeta>,
    sensitivityFactor?: number
  ) => {
    const requestId = ++envRequestId.current;
    envAbort.current?.abort();

    const controller = new AbortController();
    envAbort.current = controller;
    setIsEnvLoading(true);
    const timer = setTimeout(() => controller.abort(), ENV_REQUEST_TIMEOUT_MS);

    try {
      // A POST body rather than a query string: the allergen profile and position used to be in
      // the URL, which hosting platforms write to their request logs.
      const hasCoords = lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng);
      const resp = await fetch('/api/pollen-aqi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationName: locationStr,
          lat: hasCoords ? coarseCoordinate(lat) : undefined,
          lng: hasCoords ? coarseCoordinate(lng) : undefined,
          userAllergens: allergensMap,
          customAllergens,
          sensitivityFactor,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}`);
      }
      const data = await resp.json();
      if (requestId !== envRequestId.current) return; // A newer request has superseded this one.
      if (data && data.pollen) {
        setEnvData(data);
      } else {
        throw new Error('Invalid payload structure');
      }
    } catch (err) {
      if (requestId !== envRequestId.current) return;
      if (err instanceof DOMException && err.name === 'AbortError' && requestId !== envRequestId.current) return;
      console.warn('Live environmental data unavailable, using the offline seasonal estimate:', err);
      // Clearly labelled as an estimate by `dataSource` / `pollenIsModeled`, which the dashboard
      // renders rather than presenting these figures as a live reading.
      const fallback = generateFallbackEnvData(locationStr, allergensMap, lat, lng, customAllergens, sensitivityFactor);
      setEnvData(fallback);
    } finally {
      clearTimeout(timer);
      if (requestId === envRequestId.current) {
        setIsEnvLoading(false);
      }
    }
  }, []);

  const refreshEnvironmentalData = useCallback(() => {
    const locStr = [userProfile.location.cityName, userProfile.location.region]
      .filter(Boolean)
      .join(', ');
    fetchEnvironmentalData(
      locStr,
      userProfile.allergens,
      userProfile.location.lat,
      userProfile.location.lng,
      userProfile.customAllergens,
      userProfile.sensitivityFactor
    );
  }, [
    fetchEnvironmentalData,
    userProfile.location.cityName,
    userProfile.location.region,
    userProfile.location.lat,
    userProfile.location.lng,
    userProfile.allergens,
    userProfile.customAllergens,
    userProfile.sensitivityFactor,
  ]);

  useEffect(() => {
    refreshEnvironmentalData();
  }, [refreshEnvironmentalData]);

  useEffect(() => () => envAbort.current?.abort(), []);

  // Produce the in-app alerts the notification settings describe. Deterministic ids mean this can
  // run on every refresh without ever duplicating an alert, and cleared ids stay cleared.
  useEffect(() => {
    const fresh = generateNotifications({
      envData,
      schedule,
      settings,
      existing: notifications,
      dismissed: dismissedNotificationIds,
    });
    if (fresh.length === 0) return;
    const merged = [...fresh, ...notifications].slice(0, MAX_NOTIFICATIONS);
    setNotifications(merged);
    StorageService.saveNotifications(merged);
  }, [envData, schedule, settings, notifications, dismissedNotificationIds]);

  // Update profile
  const handleUpdateProfile = (updated: UserAllergenProfile) => {
    setUserProfile(updated);
    if (!StorageService.saveProfile(updated)) reportSaveFailure('allergen profile');
  };

  // Update shot schedule
  const handleUpdateSchedule = (updated: ImmunotherapySchedule) => {
    setSchedule(updated);
    if (!StorageService.saveSchedule(updated)) reportSaveFailure('shot schedule');
  };

  // Add symptom log. One entry per day: logging again replaces that day's entry rather than
  // stacking a second one with the same date.
  const handleAddSymptomLog = (log: SymptomLog) => {
    const withoutSameDay = symptomLogs.filter((entry) => entry.date !== log.date);
    const updated = [log, ...withoutSameDay].sort((a, b) => b.date.localeCompare(a.date));
    setSymptomLogs(updated);
    if (!StorageService.saveSymptoms(updated)) reportSaveFailure('symptom entry');
  };

  const handleDeleteSymptomLog = (id: string) => {
    const updated = symptomLogs.filter((entry) => entry.id !== id);
    setSymptomLogs(updated);
    if (!StorageService.saveSymptoms(updated)) reportSaveFailure('symptom journal');
  };

  // Add scan result
  const handleAddScan = (scan: ScanResult) => {
    const updated = [scan, ...scanHistory].slice(0, MAX_STORED_SCANS);
    setScanHistory(updated);
    if (!StorageService.saveScans(updated)) reportSaveFailure('scan history');
  };

  const handleDeleteScan = (id: string) => {
    const updated = scanHistory.filter((scan) => scan.id !== id);
    setScanHistory(updated);
    if (!StorageService.saveScans(updated)) reportSaveFailure('scan history');
  };

  // Update settings
  const handleUpdateSettings = (updated: NotificationSettings) => {
    setSettings(updated);
    if (!StorageService.saveSettings(updated)) reportSaveFailure('notification settings');
  };

  // Location selection change from the header search.
  const handleLocationChange = (cityName: string, region: string, lat?: number, lng?: number) => {
    handleUpdateProfile({
      ...userProfile,
      location: {
        cityName: cityName.trim(),
        region: region.trim(),
        lat: lat ?? userProfile.location.lat,
        lng: lng ?? userProfile.location.lng,
      },
    });
  };

  // Reset data helper. Deleting everything drops the profile too, so onboarding has to run again —
  // otherwise the user is left on an empty dashboard with no route back into setup.
  const handleConfirmReset = () => {
    StorageService.saveProfile(DEFAULT_PROFILE);
    StorageService.saveSchedule(DEFAULT_SCHEDULE);
    StorageService.saveSymptoms(INITIAL_SYMPTOMS);
    StorageService.saveScans(INITIAL_SCANS);
    StorageService.saveSettings(DEFAULT_SETTINGS);
    StorageService.saveNotifications(INITIAL_NOTIFICATIONS);
    StorageService.saveDismissedNotificationIds([]);

    setUserProfile(DEFAULT_PROFILE);
    setSchedule(DEFAULT_SCHEDULE);
    setSymptomLogs(INITIAL_SYMPTOMS);
    setScanHistory(INITIAL_SCANS);
    setSettings(DEFAULT_SETTINGS);
    setNotifications(INITIAL_NOTIFICATIONS);
    setDismissedNotificationIds([]);
    setStorageWarning(null);
    setShowResetConfirm(false);
    setActiveTab('dashboard');
    setShowOnboarding(true);
  };

  // Shot due count for the nav badge. Local-date comparison, so the badge doesn't flip a day early
  // for anyone west of UTC.
  const daysUntilShot = schedule.enabled ? daysFromToday(schedule.nextShotDate) : null;
  const dueShotsCount = daysUntilShot !== null && daysUntilShot <= 0 ? 1 : 0;

  // Notification actions
  const unreadNotifCount = notifications.filter((n) => !n.read).length;
  const handleMarkAllRead = () => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(updated);
    StorageService.saveNotifications(updated);
  };

  // Remembers what was cleared. Without that, the alert effect saw an empty drawer and regenerated
  // today's alerts on the very next render, unread.
  const handleClearAllNotifs = () => {
    const cleared = new Set(dismissedNotificationIds);
    notifications.forEach((n) => cleared.add(n.id));
    const dismissed = [...cleared].slice(-MAX_DISMISSED_NOTIFICATIONS);
    setDismissedNotificationIds(dismissed);
    StorageService.saveDismissedNotificationIds(dismissed);
    setNotifications([]);
    StorageService.saveNotifications([]);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-slate-900 focus:text-white focus:rounded-xl focus:text-sm focus:font-bold"
      >
        Skip to main content
      </a>

      {/* App Header */}
      <Header
        locationName={userProfile.location.cityName}
        onLocationChange={handleLocationChange}
        riskScore={envData?.overallPersonalRiskScore ?? null}
        riskCategory={envData?.riskCategory ?? null}
        isRiskLoading={isEnvLoading}
        onOpenNotifications={() => setShowNotifications(true)}
        unreadNotifCount={unreadNotifCount}
      />

      {/* Primary Navigation Tabs */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        dueShotsCount={dueShotsCount}
      />

      {/* Main Container */}
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6">

        {storageWarning && (
          <div
            role="status"
            className="mb-4 p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3"
          >
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-amber-900 flex-1">{storageWarning}</p>
            <button
              type="button"
              onClick={() => setStorageWarning(null)}
              aria-label="Dismiss storage warning"
              className="p-1 text-amber-700 hover:bg-amber-100 rounded-lg shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* VIEW ROUTING */}
        {activeTab === 'dashboard' && (
          <DashboardView
            envData={envData}
            isLoading={isEnvLoading}
            userProfile={userProfile}
            schedule={schedule}
            onNavigate={setActiveTab}
            onRefreshData={refreshEnvironmentalData}
          />
        )}

        {activeTab === 'heatmap' && (
          <LazyView label="the pollen map">
            <PollenHeatmapView
              userProfile={userProfile}
              onUpdateLocation={(location) => {
                handleUpdateProfile({ ...userProfile, location });
              }}
            />
          </LazyView>
        )}

        {activeTab === 'scan' && (
          <ScanView
            userProfile={userProfile}
            scanHistory={scanHistory}
            onAddScan={handleAddScan}
            onDeleteScan={handleDeleteScan}
          />
        )}

        {activeTab === 'shots' && (
          <ShotsView
            schedule={schedule}
            onUpdateSchedule={handleUpdateSchedule}
          />
        )}

        {activeTab === 'history' && (
          <LazyView label="your symptom journal">
            <HistoryView
              symptomLogs={symptomLogs}
              onAddSymptomLog={handleAddSymptomLog}
              onDeleteSymptomLog={handleDeleteSymptomLog}
            />
          </LazyView>
        )}

        {activeTab === 'profile' && (
          <ProfileView
            userProfile={userProfile}
            onUpdateProfile={handleUpdateProfile}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onResetData={() => setShowResetConfirm(true)}
          />
        )}

      </main>

      {/* Footer Disclaimer Bar */}
      <footer className="mt-auto bg-white border-t border-slate-200/80 py-4 px-4 sm:px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-600">
            <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span className="font-bold">AllerScan</span> — Environmental &amp; Pollen Intelligence System
          </div>
          <p className="text-[11px] text-slate-400">
            For personal environmental tracking only. Not medical advice or diagnostic testing.
          </p>
        </div>
      </footer>

      {/* Onboarding Wizard Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        initialLocation={userProfile.location}
        onComplete={(p) => {
          handleUpdateProfile(p);
          setShowOnboarding(false);
        }}
      />

      {/* Notification Drawer */}
      <NotificationDrawer
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={notifications}
        onMarkAllRead={handleMarkAllRead}
        onClearAll={handleClearAllNotifs}
      />

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Delete all AllerScan data?"
        tone="danger"
        confirmLabel="Delete everything"
        cancelLabel="Keep my data"
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={handleConfirmReset}
        body={
          <>
            <p>
              This permanently deletes everything AllerScan has stored on this device: your
              allergen profile, shot schedule and history, symptom journal, saved scans and
              settings.
            </p>
            <p>
              There's no account and no backup, so this can't be undone. You'll go through setup
              again afterwards.
            </p>
          </>
        }
      />

    </div>
  );
}
