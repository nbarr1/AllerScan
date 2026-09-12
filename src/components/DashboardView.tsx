import React from 'react';
import {
  ShieldAlert,
  Map,
  Camera,
  Syringe,
  Wind,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  CloudRain,
  Trees,
  Wheat,
  Flower2,
  Biohazard,
  Info,
  Thermometer,
  Droplets,
  Radio,
  RefreshCw
} from 'lucide-react';
import { EnvironmentalData, ImmunotherapySchedule, UserAllergenProfile } from '../types';
import { TabType } from './Navigation';
import { daysFromToday } from '../utils/dates';
import { aqiPillOnDark, themeForLevel, themeForScore } from '../utils/severity';

const POLLEN_TILES = [
  { key: 'tree' as const, label: 'Tree Pollen', Icon: Trees, iconClass: 'bg-emerald-50 text-emerald-700' },
  { key: 'grass' as const, label: 'Grass Pollen', Icon: Wheat, iconClass: 'bg-amber-50 text-amber-700' },
  { key: 'weed' as const, label: 'Weed Pollen', Icon: Flower2, iconClass: 'bg-rose-50 text-rose-700' },
  { key: 'mold' as const, label: 'Mold Spores', Icon: Biohazard, iconClass: 'bg-purple-50 text-purple-700' },
];

interface DashboardViewProps {
  envData: EnvironmentalData | null;
  isLoading: boolean;
  userProfile: UserAllergenProfile;
  schedule: ImmunotherapySchedule;
  onNavigate: (tab: TabType) => void;
  onRefreshData: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  envData,
  isLoading,
  userProfile,
  schedule,
  onNavigate,
  onRefreshData,
}) => {
  if (isLoading && !envData) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
        <p className="text-sm font-semibold text-slate-600">Analyzing live atmospheric pollen & air quality for {userProfile.location.cityName}...</p>
      </div>
    );
  }

  if (!envData) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-4 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500" />
        <p className="text-sm font-semibold text-slate-700">Unable to load environmental data for {userProfile.location.cityName}.</p>
        <button
          type="button"
          onClick={onRefreshData}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Analysis</span>
        </button>
      </div>
    );
  }

  const {
    overallPersonalRiskScore,
    riskCategory,
    pollen,
    aqi,
    matchedActiveAllergens,
    recommendations,
    forecast,
    locationName,
    updatedAt,
    timeZoneAbbr,
    timeZoneNote,
    weather,
    dataSource
  } = envData;

  const riskTheme = themeForScore(overallPersonalRiskScore);
  const isLiveWeatherSource = Boolean(dataSource && dataSource.toLowerCase().includes('live'));
  // The pollen figures have their own provenance: Open-Meteo's weather call can succeed for a
  // point its pollen sensors don't cover, and those two facts must not share one "Live" badge.
  const pollenSourceLabel = envData.pollenDataSource || dataSource;
  const isPollenModeled = envData.pollenIsModeled ?? false;

  // Shot countdown, compared as local calendar days.
  const daysUntilShot = schedule.enabled ? daysFromToday(schedule.nextShotDate) : null;

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      
      {/* 1. TOP HERO: Personalized Risk Score Gauge & Location */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        
        {/* Subtle Decorative Background Circles */}
        <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none"></div>
        <div className="absolute -bottom-12 -left-12 w-64 h-64 rounded-full bg-teal-500/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          
          {/* Left Column: Gauge & Main Risk Metric */}
          <div className="md:col-span-7 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            
            {/* SVG Circular Risk Score Meter */}
            <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="currentColor"
                  strokeWidth="10"
                  className="text-slate-700/60"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke={riskTheme.hex}
                  strokeWidth="10"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - overallPersonalRiskScore / 100)}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                  fill="transparent"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black tracking-tight">{overallPersonalRiskScore}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Risk Index</span>
              </div>
            </div>

            {/* Risk Title & Dynamic Summary */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${riskTheme.badge}`}>
                  {riskCategory} Risk Level
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  Updated {updatedAt}{timeZoneAbbr ? ` ${timeZoneAbbr}` : ''}
                  <button
                    type="button"
                    onClick={onRefreshData}
                    disabled={isLoading}
                    aria-label="Refresh environmental data"
                    className="p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} aria-hidden="true" />
                  </button>
                </span>
                {pollenSourceLabel && (
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                      isPollenModeled
                        ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                        : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                    }`}
                    title={
                      isPollenModeled
                        ? 'Pollen figures are a seasonal estimate, not a live sensor reading'
                        : 'Pollen figures come from a live data source'
                    }
                  >
                    {isPollenModeled ? (
                      <Info className="w-3 h-3 text-amber-400" aria-hidden="true" />
                    ) : (
                      <Radio className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                    )}
                    {isPollenModeled ? `Estimated pollen — ${pollenSourceLabel}` : pollenSourceLabel}
                  </span>
                )}
              </div>

              {timeZoneNote && (
                <p className="text-[11px] text-amber-400 flex items-start gap-1.5 max-w-md">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{timeZoneNote}</span>
                </p>
              )}

              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                {matchedActiveAllergens.length > 0 ? (
                  <>
                    ⚠️ <span className="text-amber-400">{matchedActiveAllergens.length} of your allergens</span> active in {locationName}
                  </>
                ) : (
                  <>Low Environmental Risk in {locationName}</>
                )}
              </h1>

              <p className="text-xs text-slate-300 leading-relaxed max-w-md">
                Matched against your profile ({Object.keys(userProfile.allergens).length} saved allergens).
                {matchedActiveAllergens.length > 0
                  ? ` Top triggers today: ${matchedActiveAllergens.map((m) => m.name).join(', ')}.`
                  : ' All matched pollen triggers are at safe low levels.'}
              </p>
            </div>
          </div>

          {/* Right Column: Quick Action CTA Buttons */}
          <div className="md:col-span-5 flex flex-col gap-2.5 sm:pl-4 border-t md:border-t-0 md:border-l border-slate-700/80 pt-4 md:pt-0">
            <button
              type="button"
              onClick={() => onNavigate('heatmap')}
              className="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-400 text-slate-950 font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 group"
            >
              <Map className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span>Explore Pollen Heatmap & Radar</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('scan')}
              className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 group"
            >
              <Camera className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span>Scan Plant or Mold with Camera</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('shots')}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-2xl transition-all border border-slate-700 flex items-center justify-center gap-2"
            >
              <Syringe className="w-4 h-4 text-amber-400" />
              <span>
                {daysUntilShot === null
                  ? 'Allergy Shot Reminders'
                  : daysUntilShot === 0
                  ? '💉 Shot Due Today'
                  : daysUntilShot < 0
                  ? `Shot Overdue by ${Math.abs(daysUntilShot)} Day${Math.abs(daysUntilShot) === 1 ? '' : 's'}`
                  : `Next Allergy Shot in ${daysUntilShot} Day${daysUntilShot === 1 ? '' : 's'}`}
              </span>
            </button>
          </div>

        </div>
      </div>

      {/* 2. MATCHED ALLERGEN ALERT CARDS */}
      {matchedActiveAllergens.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Your Active Profile Allergens Today
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {matchedActiveAllergens.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-emerald-300 transition-all"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-extrabold text-slate-900">{item.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                      item.userSeverity === 'severe'
                        ? 'bg-rose-100 text-rose-700'
                        : item.userSeverity === 'moderate'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {item.userSeverity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 capitalize">
                    Category: {item.category} • Current Level: <strong className="text-slate-800">{item.currentLevel}</strong>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-slate-800">{item.currentValue}</span>
                  <span className="text-[10px] text-slate-400 block">/100</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. ENVIRONMENTAL RADAR: Pollen Categories & Air Quality */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
            <Wind className="w-4 h-4 text-emerald-600" /> Real-time Pollen & AQI Radar
          </h2>
          <button
            type="button"
            onClick={onRefreshData}
            disabled={isLoading}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Refreshing…' : '↻ Refresh Data'}
          </button>
        </div>

        <div className={`grid grid-cols-2 gap-3 ${aqi ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
          
          {/* Pollen category tiles. One severity scale for all four, shared with the hero gauge,
              the forecast bars and the AQI pill — see utils/severity.ts. */}
          {POLLEN_TILES.map(({ key, label, Icon, iconClass }) => {
            const reading = pollen[key];
            const tileTheme = themeForLevel(reading.level);
            const species = reading.topSpecies?.filter(Boolean) ?? [];
            return (
              <div key={key} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex justify-between items-center">
                  <div className={`p-2 rounded-xl ${iconClass}`}>
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${tileTheme.badge}`}>
                    {reading.level}
                  </span>
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900">
                    {reading.value} <span className="text-xs text-slate-400 font-normal">/100</span>
                  </div>
                  <div className="text-xs font-bold text-slate-700 mt-0.5">{label}</div>
                </div>
                {species.length > 0 && (
                  <p className="text-[10px] text-slate-500 truncate" title={species.join(', ')}>
                    {species.join(', ')}
                  </p>
                )}
              </div>
            );
          })}


          {/* Air Quality Index (AQI). Omitted entirely when no live reading was available —
              the offline estimate doesn't invent one. */}
          {aqi && (
          <div className="col-span-2 lg:col-span-1 p-4 bg-slate-900 text-white rounded-2xl shadow-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Air Quality</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${aqiPillOnDark(aqi.category)}`}>
                {aqi.category}
              </span>
            </div>
            <div>
              <div className="text-2xl font-black">{aqi.aqi} <span className="text-xs text-slate-400 font-normal">AQI</span></div>
              <div className="text-xs text-slate-300 mt-0.5">PM2.5: {aqi.pm25} µg/m³</div>
            </div>
            <p className="text-[10px] text-slate-400">Ozone: {aqi.ozone} ppb • PM10: {aqi.pm10}</p>
          </div>
          )}

        </div>

        {/* Live Microclimate Weather Feed Bar */}
        {weather && (
          <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-2xl border border-slate-800/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Thermometer className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">
                  {isLiveWeatherSource ? 'Live Microclimate Feed' : 'Estimated Microclimate'}
                </div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>{weather.weatherDescription}</span>
                  <span className="text-emerald-400 font-extrabold">{weather.temperatureF}°F ({Math.round(((weather.temperatureF - 32) * 5) / 9)}°C)</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Droplets className="w-4 h-4 text-sky-400" />
                <span>Humidity: <strong className="text-white">{weather.humidityPct}%</strong></span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <Wind className="w-4 h-4 text-teal-400" />
                <span>Wind: <strong className="text-white">{weather.windSpeedMph} mph</strong> {weather.windDirection}</span>
              </div>
              {isLiveWeatherSource && (
                <div className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-slate-300 border border-white/10">
                  Open-Meteo v1
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. 5-DAY FORECAST & PERSONALIZED ADVICE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 5-Day Forecast Trend */}
        <div className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" /> 5-Day Personalized Risk Forecast
            </span>
            <span className="text-xs text-slate-400 font-normal">Next 5 Days</span>
          </h2>

          <div className="space-y-2.5">
            {forecast.map((day, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-3 hover:bg-slate-100/80 transition-colors"
              >
                <div className="w-24">
                  <div className="text-xs font-bold text-slate-900">{day.dayName}</div>
                  <div className="text-[10px] text-slate-400">{day.date}</div>
                </div>

                {/* Progress Bar */}
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                    <span>Dominant: {day.dominantAllergen}</span>
                    <span className="font-extrabold text-slate-800">{day.riskLevel} ({day.overallScore})</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${themeForScore(day.overallScore).bar}`}
                      style={{ width: `${Math.min(100, Math.max(0, day.overallScore))}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tailored Action Recommendations */}
        <div className="lg:col-span-5 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Today's Environmental Advice
            </h2>

            <ul className="space-y-2.5">
              {recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0"></span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              Tune your triggers and reaction sensitivity in My Allergens
            </span>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="font-bold text-emerald-600 hover:underline"
            >
              Edit Allergens →
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
