import {
  UserAllergenProfile,
  ImmunotherapySchedule,
  SymptomLog,
  ScanResult,
  NotificationSettings,
  AppNotification
} from '../types';

const STORAGE_KEYS = {
  PROFILE: 'allerscan_profile_v1',
  SCHEDULE: 'allerscan_schedule_v1',
  SYMPTOMS: 'allerscan_symptoms_v1',
  SCANS: 'allerscan_scans_v1',
  SETTINGS: 'allerscan_settings_v1',
  NOTIFS: 'allerscan_notifs_v1',
};

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

export function saveStoredData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving localStorage key ${key}:`, e);
  }
}

export const StorageService = {
  getProfile: () => loadStoredData<UserAllergenProfile>(STORAGE_KEYS.PROFILE, DEFAULT_PROFILE),
  saveProfile: (p: UserAllergenProfile) => saveStoredData(STORAGE_KEYS.PROFILE, p),

  getSchedule: () => loadStoredData<ImmunotherapySchedule>(STORAGE_KEYS.SCHEDULE, DEFAULT_SCHEDULE),
  saveSchedule: (s: ImmunotherapySchedule) => saveStoredData(STORAGE_KEYS.SCHEDULE, s),

  getSymptoms: () => loadStoredData<SymptomLog[]>(STORAGE_KEYS.SYMPTOMS, INITIAL_SYMPTOMS),
  saveSymptoms: (s: SymptomLog[]) => saveStoredData(STORAGE_KEYS.SYMPTOMS, s),

  getScans: () => loadStoredData<ScanResult[]>(STORAGE_KEYS.SCANS, INITIAL_SCANS),
  saveScans: (s: ScanResult[]) => saveStoredData(STORAGE_KEYS.SCANS, s),

  getSettings: () => loadStoredData<NotificationSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
  saveSettings: (s: NotificationSettings) => saveStoredData(STORAGE_KEYS.SETTINGS, s),

  getNotifications: () => loadStoredData<AppNotification[]>(STORAGE_KEYS.NOTIFS, INITIAL_NOTIFICATIONS),
  saveNotifications: (n: AppNotification[]) => saveStoredData(STORAGE_KEYS.NOTIFS, n),
};
