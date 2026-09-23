import {
  UserAllergenProfile,
  ImmunotherapySchedule,
  SymptomLog,
  ScanResult,
  NotificationSettings,
  AppNotification
} from '../types';
import { MAX_NOTIFICATIONS } from './notifications';

// Saved coordinates are OBFUSCATED, NOT ENCRYPTED: XOR with a fixed key that ships in this very
// bundle, then base64. That keeps an exact position from being readable at a glance in devtools
// or a storage export, and nothing more — anyone with this code can reverse it, and the city name
// is stored in plain text beside it. Don't treat this as a security boundary or build on it as
// one. The `encv1:` prefix is historical and kept only so profiles saved by earlier builds load.
const COORD_OBFUSCATION_PREFIX = 'encv1:';
const COORD_OBFUSCATION_KEY = 'allerscan_coord_key_v1';

function obfuscateNumber(value: number): string {
  const key = COORD_OBFUSCATION_KEY;
  const payload = `${value}`;
  let out = '';
  for (let i = 0; i < payload.length; i += 1) {
    out += String.fromCharCode(payload.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return `${COORD_OBFUSCATION_PREFIX}${btoa(out)}`;
}

function deobfuscateNumber(value: unknown): number | null {
  if (typeof value === 'number') return value; // profiles saved before obfuscation was added
  if (typeof value !== 'string' || !value.startsWith(COORD_OBFUSCATION_PREFIX)) return null;
  try {
    const key = COORD_OBFUSCATION_KEY;
    const encoded = value.slice(COORD_OBFUSCATION_PREFIX.length);
    const raw = atob(encoded);
    let decoded = '';
    for (let i = 0; i < raw.length; i += 1) {
      decoded += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    const parsed = Number(decoded);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function obfuscateProfileForStorage(profile: UserAllergenProfile): UserAllergenProfile {
  return {
    ...profile,
    location: {
      ...profile.location,
      lat: obfuscateNumber(profile.location.lat) as unknown as number,
      lng: obfuscateNumber(profile.location.lng) as unknown as number,
    },
  };
}

function deobfuscateProfileFromStorage(profile: UserAllergenProfile): UserAllergenProfile {
  const lat = deobfuscateNumber((profile.location as unknown as { lat: unknown }).lat);
  const lng = deobfuscateNumber((profile.location as unknown as { lng: unknown }).lng);
  return {
    ...profile,
    location: {
      ...profile.location,
      lat: lat ?? DEFAULT_PROFILE.location.lat,
      lng: lng ?? DEFAULT_PROFILE.location.lng,
    },
  };
}

const STORAGE_KEYS = {
  PROFILE: 'allerscan_profile_v1',
  SCHEDULE: 'allerscan_schedule_v1',
  SYMPTOMS: 'allerscan_symptoms_v1',
  SCANS: 'allerscan_scans_v1',
  SETTINGS: 'allerscan_settings_v1',
  NOTIFS: 'allerscan_notifs_v1',
  NOTIFS_DISMISSED: 'allerscan_notifs_dismissed_v1',
};

/**
 * Ids of alerts the user cleared. Alert ids are deterministic (type + day + subject), so without
 * this record "Clear all" emptied the drawer and the next render regenerated the same alerts,
 * unread. Bounded: ids carry their day, so old ones stop mattering.
 */
export const MAX_DISMISSED_NOTIFICATIONS = 200;

/**
 * Scan results carry their photo inline as a data URL, so the history is by far the largest
 * thing in localStorage. Capping it keeps the app inside the ~5 MB budget; photos are also
 * downscaled before they get here (see ScanView).
 */
export const MAX_STORED_SCANS = 24;

export const DEFAULT_PROFILE: UserAllergenProfile = {
  allergens: {},
  location: {
    cityName: 'Austin',
    region: 'Texas, USA',
    lat: 30.2672,
    lng: -97.7431,
  },
  sensitivityFactor: 2,
  onboarded: false,
};

export const DEFAULT_SCHEDULE: ImmunotherapySchedule = {
  enabled: false,
  phase: 'build-up',
  intervalDays: 7,
  nextShotDate: '',
  defaultArm: 'Alternating',
  allergistInfo: {
    doctorName: '',
    clinicName: '',
    phone: '',
    email: '',
    address: '',
  },
  shotHistory: [],
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  pollenAlerts: true,
  aqiAlerts: true,
  shotReminders: true,
  dailySummary: true,
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  minSeverityTrigger: 'moderate',
};

export const INITIAL_NOTIFICATIONS: AppNotification[] = [];

export const INITIAL_SYMPTOMS: SymptomLog[] = [];

export const INITIAL_SCANS: ScanResult[] = [];

export function loadStoredData<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(`Error loading localStorage key ${key}:`, e);
  }
  return fallback;
}

/**
 * Returns false when the write didn't happen (quota exhausted, private-mode restrictions) so the
 * caller can tell the user rather than showing data as saved that will be gone on reload.
 */
export function saveStoredData<T>(key: string, data: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error(`Error saving localStorage key ${key}:`, e);
    return false;
  }
}

export const StorageService = {
  getProfile: () =>
    deobfuscateProfileFromStorage(loadStoredData<UserAllergenProfile>(STORAGE_KEYS.PROFILE, DEFAULT_PROFILE)),
  saveProfile: (p: UserAllergenProfile) =>
    saveStoredData(STORAGE_KEYS.PROFILE, obfuscateProfileForStorage(p)),

  getSchedule: () => loadStoredData<ImmunotherapySchedule>(STORAGE_KEYS.SCHEDULE, DEFAULT_SCHEDULE),
  saveSchedule: (s: ImmunotherapySchedule) => saveStoredData(STORAGE_KEYS.SCHEDULE, s),

  getSymptoms: () => loadStoredData<SymptomLog[]>(STORAGE_KEYS.SYMPTOMS, INITIAL_SYMPTOMS),
  saveSymptoms: (s: SymptomLog[]) => saveStoredData(STORAGE_KEYS.SYMPTOMS, s),

  getScans: () => loadStoredData<ScanResult[]>(STORAGE_KEYS.SCANS, INITIAL_SCANS),
  saveScans: (s: ScanResult[]) => saveStoredData(STORAGE_KEYS.SCANS, s.slice(0, MAX_STORED_SCANS)),

  getSettings: () => loadStoredData<NotificationSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
  saveSettings: (s: NotificationSettings) => saveStoredData(STORAGE_KEYS.SETTINGS, s),

  getNotifications: () => loadStoredData<AppNotification[]>(STORAGE_KEYS.NOTIFS, INITIAL_NOTIFICATIONS),
  saveNotifications: (n: AppNotification[]) =>
    saveStoredData(STORAGE_KEYS.NOTIFS, n.slice(0, MAX_NOTIFICATIONS)),

  getDismissedNotificationIds: () => {
    const stored = loadStoredData<unknown>(STORAGE_KEYS.NOTIFS_DISMISSED, []);
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  },
  saveDismissedNotificationIds: (ids: string[]) =>
    saveStoredData(STORAGE_KEYS.NOTIFS_DISMISSED, ids.slice(-MAX_DISMISSED_NOTIFICATIONS)),
};
