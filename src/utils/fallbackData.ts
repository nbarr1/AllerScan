import { EnvironmentalData, SeverityLevel, CustomAllergenMeta } from '../types';
import { buildEnvironmentalReport } from './envReport';
import { MOLD_FROM_MODEL_NOTE, SEASONAL_MODEL_SOURCE, seasonalEstimate } from './pollenModel';
import { withSafeKeys } from './safeKeys';

/**
 * The offline estimate, used when the API can't be reached.
 *
 * Everything here is a seasonal/geographic model, and it says so: `pollenIsModeled` is true and
 * `dataSource` names the model, so the dashboard labels the figures rather than presenting them as
 * a reading. It's built by the same code as the server's response (utils/envReport), so the two
 * can't drift apart. Things it deliberately does NOT do:
 *
 *   - Invent weather or air quality. `weather` and `aqi` are absent, and the dashboard omits them.
 *   - Invent a forecast. It used to add fixed offsets to today's estimate and call that five days;
 *     the forecast is empty, and the dashboard says why.
 */
export function generateFallbackEnvData(
  locationName: string,
  userAllergens: Record<string, SeverityLevel> = {},
  lat = 30.2672,
  lng = -97.7431,
  customAllergens: Record<string, CustomAllergenMeta> = {},
  sensitivityFactor = 2
): EnvironmentalData {
  const now = new Date();
  const shortName = locationName.split(',')[0] || 'this location';

  // This fallback runs entirely offline in the browser, so there's no way to look up the
  // selected location's real time zone. Be honest about it: show the device's own local time
  // and label it as such, rather than silently implying it reflects the selected location.
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzParts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(now);
  const timeZoneAbbr = tzParts.find((p) => p.type === 'timeZoneName')?.value || deviceTimeZone;

  return buildEnvironmentalReport({
    locationName: shortName,
    updatedAt: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timeZoneAbbr,
    timeZoneNote: `Live data for ${shortName} is unavailable right now — showing your device's local time (${deviceTimeZone}) and a seasonal estimate instead.`,
    dataSource: 'Seasonal Atmospheric Model (offline estimate)',
    pollenSource: `${SEASONAL_MODEL_SOURCE} (offline estimate)`,
    pollenIsModeled: true,
    values: seasonalEstimate(lat, lng, now),
    moldNote: MOLD_FROM_MODEL_NOTE,
    forecastDays: [],
    // Both come from localStorage, so they get the same key hygiene as a request would.
    profile: {
      allergens: withSafeKeys(userAllergens),
      customAllergens: withSafeKeys(customAllergens),
      sensitivityFactor,
    },
  });
}
