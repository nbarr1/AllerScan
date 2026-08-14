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
  allergens: {
    ragweed: 'severe',
    oak: 'moderate',
    bermuda_grass: 'moderate',
    alternaria: 'mild',
    dust_mites: 'moderate',
  },
  location: {
    cityName: 'Austin',
    region: 'Texas, USA',
    lat: 30.2672,
    lng: -97.7431,
  },
  sensitivityFactor: 2,
  onboarded: true, // Default onboarded with sample profile for instant rich experience
};

export const DEFAULT_SCHEDULE: ImmunotherapySchedule = {
  enabled: true,
  phase: 'maintenance',
  intervalDays: 14,
  nextShotDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0], // 3 days from now
  defaultArm: 'Alternating',
  allergistInfo: {
    doctorName: 'Dr. Sarah Jenkins, MD',
    clinicName: 'Austin Allergy & Asthma Specialists',
    phone: '(512) 555-0199',
    email: 'care@austinallergy.com',
    address: '3801 N Lamar Blvd, Austin, TX 78756',
  },
  shotHistory: [
    {
      id: 'shot_1',
      date: new Date(Date.now() - 11 * 86400000).toISOString().split('T')[0],
      time: '09:30 AM',
      arm: 'Left Arm',
      dosage: '0.5 mL (1:100 vol)',
      reactionSeverity: 'Mild Local',
      reactionDetails: 'Minor redness around injection site (~15mm), resolved in 4 hours.',
      completed: true,
    },
    {
      id: 'shot_2',
      date: new Date(Date.now() - 25 * 86400000).toISOString().split('T')[0],
      time: '10:00 AM',
      arm: 'Right Arm',
      dosage: '0.5 mL (1:100 vol)',
      reactionSeverity: 'None',
      reactionDetails: 'No localized reaction.',
      completed: true,
    },
  ],
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

export const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif_1',
    title: '⚠️ High Ragweed & Oak Pollen Alert',
    message: 'Ragweed pollen is elevated in Austin today. Limit outdoor exposure during afternoon hours.',
    type: 'pollen',
    timestamp: '2 hours ago',
    read: false,
    severity: 'alert',
  },
  {
    id: 'notif_2',
    title: '💉 Allergy Shot Reminder',
    message: 'Maintenance shot scheduled in 3 days (Thursday). Left Arm turn.',
    type: 'shot',
    timestamp: '5 hours ago',
    read: false,
    severity: 'info',
  },
];

export const INITIAL_SYMPTOMS: SymptomLog[] = [
  {
    id: 'sym_1',
    date: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0],
    severityScore: 3,
    sneezing: true,
    wateryEyes: true,
    congestion: true,
    itchyThroat: false,
    fatigue: true,
    notes: 'Walked in Zilker Park at noon when wind was high.',
  },
  {
    id: 'sym_2',
    date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
    severityScore: 2,
    sneezing: true,
    wateryEyes: false,
    congestion: true,
    itchyThroat: false,
    fatigue: false,
    notes: 'Mild morning congestion.',
  },
  {
    id: 'sym_3',
    date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    severityScore: 1,
    sneezing: false,
    wateryEyes: false,
    congestion: true,
    itchyThroat: false,
    fatigue: false,
  },
  {
    id: 'sym_4',
    date: new Date(Date.now() - 4 * 86400000).toISOString().split('T')[0],
    severityScore: 4,
    sneezing: true,
    wateryEyes: true,
    congestion: true,
    itchyThroat: true,
    fatigue: true,
    notes: 'Severe afternoon symptoms after mowing lawn.',
  },
];

export const INITIAL_SCANS: ScanResult[] = [
  {
    id: 'scan_init_1',
    timestamp: new Date(Date.now() - 6 * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' Today',
    imageUrl: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=600&q=80',
    speciesName: 'Common Ragweed',
    scientificName: 'Ambrosia artemisiifolia',
    category: 'weed',
    confidence: 94,
    isUserAllergen: true,
    matchedAllergenId: 'ragweed',
    userSeverity: 'severe',
    details: 'Fern-like lobed leaves with small green flower spikes. Heavy windborne pollen producer active in early autumn.',
    identifyingFeatures: ['Fern-like deeply lobed leaves', 'Erect green flower spike', 'Hairy stems'],
    locationStr: 'Austin, TX',
  },
  {
    id: 'scan_init_2',
    timestamp: 'Yesterday 3:15 PM',
    imageUrl: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=600&q=80',
    speciesName: 'White Oak Tree',
    scientificName: 'Quercus alba',
    category: 'tree',
    confidence: 88,
    isUserAllergen: true,
    matchedAllergenId: 'oak',
    userSeverity: 'moderate',
    details: 'Deeply lobed leaf structure with hanging yellow catkins. High spring pollen producer.',
    identifyingFeatures: ['Rounded leaf lobes', 'Yellow floral catkins'],
    locationStr: 'Austin, TX',
  },
];

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
