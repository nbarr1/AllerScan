// Turns the data the app already has into the in-app alerts the Settings screen promises.
//
// The notification settings used to be inert: nothing anywhere constructed an AppNotification,
// so four toggles, a severity threshold and a quiet-hours window controlled nothing and the bell
// could only ever be empty. This module is the producer. It runs in the browser whenever fresh
// environmental data arrives, so it needs no service worker and no push permission — these are
// in-app alerts, which is exactly what the drawer presents them as.

import {
  AppNotification,
  EnvironmentalData,
  ImmunotherapySchedule,
  NotificationSettings,
  SeverityLevel,
} from '../types';
import { currentLocalMinutes, daysFromToday, parseClockTime, toLocalDateKey } from './dates';
import { SEVERITY_RANK } from './severity';

/** Keep the drawer bounded; oldest alerts fall off the end. */
export const MAX_NOTIFICATIONS = 30;

/**
 * True when `now` falls inside the configured quiet-hours window. Handles windows that wrap past
 * midnight (the default is 22:00–07:00).
 */
export function isWithinQuietHours(settings: NotificationSettings, now: Date = new Date()): boolean {
  if (!settings.quietHoursEnabled) return false;
  const start = parseClockTime(settings.quietHoursStart);
  const end = parseClockTime(settings.quietHoursEnd);
  if (start === null || end === null || start === end) return false;

  const minutes = currentLocalMinutes(now);
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

function meetsSeverityThreshold(severity: SeverityLevel, threshold: SeverityLevel): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}

interface GenerateArgs {
  envData: EnvironmentalData | null;
  schedule: ImmunotherapySchedule;
  settings: NotificationSettings;
  existing: AppNotification[];
  /** Ids the user cleared. They stay cleared, even though the condition behind them still holds. */
  dismissed?: Iterable<string>;
}

/**
 * Returns only the notifications that don't already exist and weren't cleared. Ids are
 * deterministic (type + local day + subject), so re-running this on every refresh never produces
 * duplicates. Clearing the drawer used to bring today's alerts straight back, unread, because an
 * empty drawer looked the same as one that had never had them; `dismissed` is the difference.
 */
export function generateNotifications({
  envData,
  schedule,
  settings,
  existing,
  dismissed = [],
}: GenerateArgs): AppNotification[] {
  const now = new Date();
  if (isWithinQuietHours(settings, now)) return [];

  const today = toLocalDateKey(now);
  const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const seen = new Set([...existing.map((n) => n.id), ...dismissed]);
  const created: AppNotification[] = [];

  const push = (notification: AppNotification) => {
    if (seen.has(notification.id)) return;
    seen.add(notification.id);
    created.push(notification);
  };

  // 1. Matched profile allergens crossing into High or Very High.
  if (settings.pollenAlerts && envData) {
    const triggered = envData.matchedActiveAllergens.filter(
      (match) =>
        (match.currentLevel === 'High' || match.currentLevel === 'Very High') &&
        meetsSeverityThreshold(match.userSeverity, settings.minSeverityTrigger)
    );

    for (const match of triggered) {
      push({
        id: `pollen_${today}_${match.id}`,
        title: `${match.name} is ${match.currentLevel.toLowerCase()} today`,
        message: `${match.name} is at ${match.currentValue}/100 in ${envData.locationName}. You've saved it as a ${match.userSeverity} trigger.`,
        type: 'pollen',
        timestamp,
        read: false,
        severity: match.currentLevel === 'Very High' ? 'alert' : 'warning',
      });
    }
  }

  // 2. Air quality at or past "Unhealthy for Sensitive Groups".
  if (settings.aqiAlerts && envData?.aqi && envData.aqi.aqi > 100) {
    push({
      id: `aqi_${today}_${envData.aqi.category}`,
      title: `Air quality is ${envData.aqi.category.toLowerCase()}`,
      message: `AQI ${envData.aqi.aqi} in ${envData.locationName} (PM2.5 ${envData.aqi.pm25} µg/m³, ozone ${envData.aqi.ozone} ppb). Limit strenuous time outdoors.`,
      type: 'aqi',
      timestamp,
      read: false,
      severity: envData.aqi.aqi > 150 ? 'alert' : 'warning',
    });
  }

  // 3. Shot due today, or due tomorrow.
  if (settings.shotReminders && schedule.enabled && schedule.nextShotDate) {
    const days = daysFromToday(schedule.nextShotDate);
    if (days === 0) {
      push({
        id: `shot_due_${schedule.nextShotDate}`,
        title: 'Allergy shot due today',
        message: `Your ${schedule.phase} dose is scheduled for today${
          schedule.allergistInfo.clinicName ? ` at ${schedule.allergistInfo.clinicName}` : ''
        }. Log it once you've had it.`,
        type: 'shot',
        timestamp,
        read: false,
        severity: 'alert',
      });
    } else if (days === 1) {
      push({
        id: `shot_tomorrow_${schedule.nextShotDate}`,
        title: 'Allergy shot tomorrow',
        message: `Your next ${schedule.phase} dose is scheduled for tomorrow.`,
        type: 'shot',
        timestamp,
        read: false,
        severity: 'info',
      });
    } else if (days !== null && days < 0) {
      push({
        id: `shot_overdue_${schedule.nextShotDate}`,
        title: `Allergy shot ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`,
        message:
          'Confirm your next appointment with your allergist before your next dose — intervals that stretch may need a dose adjustment.',
        type: 'shot',
        timestamp,
        read: false,
        severity: 'alert',
      });
    }
  }

  // 4. Daily summary, once per local day.
  if (settings.dailySummary && envData) {
    const matched = envData.matchedActiveAllergens.length;
    push({
      id: `summary_${today}`,
      title: `Today's risk: ${envData.riskCategory} (${envData.overallPersonalRiskScore}/100)`,
      message: matched
        ? `${matched} of your saved allergen${matched === 1 ? ' is' : 's are'} active in ${envData.locationName}: ${envData.matchedActiveAllergens
            .map((m) => m.name)
            .join(', ')}.`
        : `No saved allergens are active in ${envData.locationName} right now.${envData.aqi ? ` AQI ${envData.aqi.aqi}.` : ''}`,
      type: 'pollen',
      timestamp,
      read: false,
      severity: 'info',
    });
  }

  return created;
}
