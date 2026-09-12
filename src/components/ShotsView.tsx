import React, { useState } from 'react';
import {
  Syringe,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  Plus,
  UserCheck,
  Trash2,
  Settings2
} from 'lucide-react';
import { Modal } from './Modal';
import { ImmunotherapySchedule, ShotLog } from '../types';
import {
  addDaysToKey,
  daysFromToday,
  daysSince,
  formatDateKeyLong,
  toLocalDateKey,
} from '../utils/dates';

interface ShotsViewProps {
  schedule: ImmunotherapySchedule;
  onUpdateSchedule: (newSchedule: ImmunotherapySchedule) => void;
}

interface LogFormState {
  date: string;
  arm: 'Left Arm' | 'Right Arm' | 'Both';
  dosage: string;
  reaction: 'None' | 'Mild Local' | 'Moderate Local' | 'Systemic';
  notes: string;
}

interface ScheduleFormState {
  enabled: boolean;
  phase: 'build-up' | 'maintenance';
  intervalDays: number;
  nextShotDate: string;
  defaultArm: 'Left Arm' | 'Right Arm' | 'Alternating';
  doctorName: string;
  clinicName: string;
  phone: string;
  email: string;
  address: string;
}

export const ShotsView: React.FC<ShotsViewProps> = ({ schedule, onUpdateSchedule }) => {
  const [showLogModal, setShowLogModal] = useState(false);
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ShotLog | null>(null);

  // Both forms are seeded when their modal *opens*, not once at mount. Seeding at mount meant
  // logging a shot (which moves nextShotDate) left the config form holding the old date, and
  // saving an unrelated field silently reverted the schedule.
  const [logForm, setLogForm] = useState<LogFormState | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState | null>(null);

  const sortedHistory = [...schedule.shotHistory].sort((a, b) => b.date.localeCompare(a.date));
  const lastShot = sortedHistory.find((s) => s.completed) ?? null;
  const daysSinceLast = lastShot ? daysSince(lastShot.date) : null;
  const daysUntilShot = schedule.enabled ? daysFromToday(schedule.nextShotDate) : null;

  // Warn relative to the regimen's own interval rather than a fixed 25 days, so a weekly
  // build-up patient isn't told about the 28-day maintenance ceiling.
  const intervalOverdueBy =
    daysSinceLast !== null && schedule.intervalDays > 0 ? daysSinceLast - schedule.intervalDays : null;
  const showIntervalWarning = intervalOverdueBy !== null && intervalOverdueBy > 0;

  const openLogModal = (date: string) => {
    setLogForm({
      date,
      arm: schedule.defaultArm === 'Right Arm' ? 'Right Arm' : 'Left Arm',
      dosage: '',
      reaction: 'None',
      notes: '',
    });
    setShowLogModal(true);
  };

  const openScheduleModal = () => {
    setScheduleForm({
      enabled: schedule.enabled,
      phase: schedule.phase,
      intervalDays: schedule.intervalDays,
      nextShotDate: schedule.nextShotDate,
      defaultArm: schedule.defaultArm,
      doctorName: schedule.allergistInfo.doctorName,
      clinicName: schedule.allergistInfo.clinicName,
      phone: schedule.allergistInfo.phone,
      email: schedule.allergistInfo.email,
      address: schedule.allergistInfo.address,
    });
    setShowEditScheduleModal(true);
  };

  const handleSaveLog = () => {
    if (!logForm) return;

    const newLog: ShotLog = {
      id: 'shot_' + Date.now(),
      date: logForm.date,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      arm: logForm.arm,
      dosage: logForm.dosage.trim(),
      reactionSeverity: logForm.reaction,
      reactionDetails: logForm.notes.trim() || undefined,
      completed: true,
    };

    const history = [newLog, ...schedule.shotHistory].sort((a, b) => b.date.localeCompare(a.date));

    // Only the most recent dose moves the next appointment. Back-filling a shot from last week
    // shouldn't push a correctly scheduled appointment out.
    const isMostRecent = history[0]?.id === newLog.id;
    const nextShotDate = isMostRecent
      ? addDaysToKey(logForm.date, schedule.intervalDays)
      : schedule.nextShotDate;

    onUpdateSchedule({ ...schedule, enabled: true, nextShotDate, shotHistory: history });
    setShowLogModal(false);
    setLogForm(null);
  };

  const handleSaveSchedule = () => {
    if (!scheduleForm) return;
    onUpdateSchedule({
      ...schedule,
      enabled: scheduleForm.enabled,
      phase: scheduleForm.phase,
      intervalDays: scheduleForm.intervalDays,
      nextShotDate: scheduleForm.nextShotDate,
      defaultArm: scheduleForm.defaultArm,
      allergistInfo: {
        doctorName: scheduleForm.doctorName.trim(),
        clinicName: scheduleForm.clinicName.trim(),
        phone: scheduleForm.phone.trim(),
        email: scheduleForm.email.trim(),
        address: scheduleForm.address.trim(),
      },
    });
    setShowEditScheduleModal(false);
    setScheduleForm(null);
  };

  const handleDeleteShot = (log: ShotLog) => {
    onUpdateSchedule({
      ...schedule,
      shotHistory: schedule.shotHistory.filter((entry) => entry.id !== log.id),
    });
    setPendingDelete(null);
  };

  const nextShotLabel =
    daysUntilShot === null
      ? null
      : daysUntilShot === 0
      ? 'Today'
      : daysUntilShot < 0
      ? `${Math.abs(daysUntilShot)} day${Math.abs(daysUntilShot) === 1 ? '' : 's'} overdue`
      : `In ${daysUntilShot} day${daysUntilShot === 1 ? '' : 's'}`;

  return (
    <div className="space-y-6 pb-20 md:pb-8">

      {/* Title & Header */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Syringe className="w-6 h-6 text-amber-500" aria-hidden="true" />
            Immunotherapy &amp; Allergy Shot Tracker
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage recurring shot regimens, arm site rotation, reaction logs, and allergist communications.
          </p>
        </div>

        <button
          type="button"
          onClick={openScheduleModal}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5"
        >
          <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Configure Regimen</span>
        </button>
      </div>

      {/* INTERVAL SAFETY WARNING */}
      {showIntervalWarning && (
        <div role="status" className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs text-amber-900 space-y-1">
            <span className="font-extrabold text-sm block">
              It's been {daysSinceLast} days since your last recorded shot
            </span>
            <p>
              That's {intervalOverdueBy} day{intervalOverdueBy === 1 ? '' : 's'} past your {schedule.intervalDays}-day
              {schedule.phase === 'maintenance'
                ? ' maintenance interval. Maintenance doses are typically given at most 28 days apart.'
                : ' build-up interval. Build-up schedules are usually kept tight to stay on the dose ladder.'}
            </p>
            <p className="font-semibold italic">
              Confirm your next appointment with your allergist before your next dose — a stretched interval may need a dose adjustment.
            </p>
          </div>
        </div>
      )}

      {/* NEXT SHOT CARD & REGIMEN STATUS */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

        {schedule.enabled && schedule.nextShotDate ? (
          <div className="md:col-span-7 bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 p-6 rounded-3xl shadow-lg relative overflow-hidden flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-950/20 text-slate-950 border border-slate-950/20">
                  {schedule.phase} Phase ({schedule.intervalDays}-Day Interval)
                </span>
                <span className="text-xs font-bold">Arm Rotation: {schedule.defaultArm}</span>
              </div>

              <div className="pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900/70 block">Next Appointment</span>
                <div className="text-2xl sm:text-3xl font-black">{formatDateKeyLong(schedule.nextShotDate)}</div>
                {nextShotLabel && <div className="text-sm font-bold text-slate-900/80">{nextShotLabel}</div>}
              </div>
            </div>

            <div className="pt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openLogModal(toLocalDateKey())}
                className="px-5 py-2.5 bg-slate-950 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <span>Mark Shot as Completed</span>
              </button>
              <button
                type="button"
                onClick={openScheduleModal}
                className="px-4 py-2.5 bg-white/30 hover:bg-white/40 text-slate-950 font-bold text-xs rounded-xl"
              >
                Reschedule
              </button>
            </div>
          </div>
        ) : (
          <div className="md:col-span-7 bg-slate-50 border-2 border-dashed border-slate-300 p-6 rounded-3xl flex flex-col items-center justify-center text-center space-y-3">
            <Syringe className="w-8 h-8 text-slate-400" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-bold text-slate-700">No Immunotherapy Regimen Set Up</h2>
              <p className="text-xs text-slate-500 mt-1">Configure your shot phase, interval, and next appointment to start tracking.</p>
            </div>
            <button
              type="button"
              onClick={openScheduleModal}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs"
            >
              Configure Regimen
            </button>
          </div>
        )}

        {/* Allergist Quick Contact Card */}
        <div className="md:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Allergist Contact &amp; Clinic Info
          </h2>

          {schedule.allergistInfo.doctorName ? (
            <div className="space-y-2 text-xs text-slate-700">
              <div className="font-bold text-sm text-slate-900">{schedule.allergistInfo.doctorName}</div>
              {schedule.allergistInfo.clinicName && (
                <p className="text-slate-500">{schedule.allergistInfo.clinicName}</p>
              )}

              <div className="pt-2 space-y-1.5 border-t border-slate-100">
                {schedule.allergistInfo.phone && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                    <a href={`tel:${schedule.allergistInfo.phone.replace(/[^\d+]/g, '')}`} className="hover:underline font-bold text-emerald-700">
                      {schedule.allergistInfo.phone}
                    </a>
                  </div>
                )}
                {schedule.allergistInfo.email && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                    <a href={`mailto:${schedule.allergistInfo.email}`} className="hover:underline font-bold text-emerald-700 truncate">
                      {schedule.allergistInfo.email}
                    </a>
                  </div>
                )}
                {schedule.allergistInfo.address && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                    <span className="truncate">{schedule.allergistInfo.address}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-4">
              No allergist info saved yet. Add your doctor and clinic details in Configure Regimen.
            </p>
          )}
        </div>

      </div>

      {/* SHOT HISTORY LOG */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex justify-between items-center gap-3">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-600" aria-hidden="true" /> Recorded Shot History ({schedule.shotHistory.length})
          </h2>
          <button
            type="button"
            onClick={() => openLogModal(toLocalDateKey())}
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Log a shot
          </button>
        </div>

        {sortedHistory.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">
            No shots recorded yet. Logging each dose builds the interval history your allergist may ask about.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedHistory.map((shot) => (
              <div key={shot.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {formatDateKeyLong(shot.date)} at {shot.time}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {shot.arm}
                    </span>
                    {shot.dosage && <span className="text-xs text-slate-500">• {shot.dosage}</span>}
                  </div>
                  {shot.reactionDetails && <p className="text-xs text-slate-600">{shot.reactionDetails}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    shot.reactionSeverity === 'None'
                      ? 'bg-emerald-100 text-emerald-800'
                      : shot.reactionSeverity === 'Systemic'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    Reaction: {shot.reactionSeverity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(shot)}
                    aria-label={`Delete the shot recorded on ${formatDateKeyLong(shot.date)}`}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* LOG SHOT MODAL */}
      <Modal
        isOpen={showLogModal && logForm !== null}
        onClose={() => { setShowLogModal(false); setLogForm(null); }}
        title="Log allergy shot"
        header={
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Syringe className="w-5 h-5 text-amber-500" aria-hidden="true" /> Log Allergy Shot
          </h2>
        }
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowLogModal(false); setLogForm(null); }}
              className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveLog}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md"
            >
              Save shot
            </button>
          </div>
        }
      >
        {logForm && (
          <div className="space-y-3">
            <div>
              <label htmlFor="shot-date" className="text-xs font-bold text-slate-700 block mb-1">
                Date given
              </label>
              <input
                id="shot-date"
                data-autofocus
                type="date"
                value={logForm.date}
                max={toLocalDateKey()}
                onChange={(e) => setLogForm({ ...logForm, date: e.target.value || toLocalDateKey() })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Defaults to today. Change it to back-fill a dose you had earlier — only your most
                recent dose moves the next appointment.
              </p>
            </div>

            <fieldset>
              <legend className="text-xs font-bold text-slate-700 mb-1">Injection arm</legend>
              <div className="grid grid-cols-3 gap-2">
                {(['Left Arm', 'Right Arm', 'Both'] as const).map((arm) => (
                  <button
                    type="button"
                    key={arm}
                    onClick={() => setLogForm({ ...logForm, arm })}
                    aria-pressed={logForm.arm === arm}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      logForm.arm === arm
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {arm}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="shot-dosage" className="text-xs font-bold text-slate-700 block mb-1">
                Dosage <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="shot-dosage"
                type="text"
                value={logForm.dosage}
                onChange={(e) => setLogForm({ ...logForm, dosage: e.target.value })}
                placeholder="e.g. 0.5 mL, 1:100 vial"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">Copy this from your allergist's record — AllerScan doesn't know your dose.</p>
            </div>

            <div>
              <label htmlFor="shot-reaction" className="text-xs font-bold text-slate-700 block mb-1">
                Local reaction level
              </label>
              <select
                id="shot-reaction"
                value={logForm.reaction}
                onChange={(e) => setLogForm({ ...logForm, reaction: e.target.value as LogFormState['reaction'] })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="None">None (no localized swelling)</option>
                <option value="Mild Local">Mild local (&lt;25mm wheal)</option>
                <option value="Moderate Local">Moderate local (25-50mm wheal)</option>
                <option value="Systemic">Systemic (report immediately to your doctor)</option>
              </select>
            </div>

            {logForm.reaction === 'Systemic' && (
              <p role="status" className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                A systemic reaction needs medical attention. Contact your allergist or emergency
                services now — logging it here is not a substitute.
              </p>
            )}

            <div>
              <label htmlFor="shot-notes" className="text-xs font-bold text-slate-700 block mb-1">
                Reaction notes / wheal size <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="shot-notes"
                value={logForm.notes}
                onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
                placeholder="e.g. Minor redness, applied ice pack…"
                rows={2}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* EDIT REGIMEN CONFIG MODAL */}
      <Modal
        isOpen={showEditScheduleModal && scheduleForm !== null}
        onClose={() => { setShowEditScheduleModal(false); setScheduleForm(null); }}
        title="Configure immunotherapy regimen"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowEditScheduleModal(false); setScheduleForm(null); }}
              className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveSchedule}
              className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md"
            >
              Save changes
            </button>
          </div>
        }
      >
        {scheduleForm && (
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
              <span className="text-xs font-bold text-slate-800">
                Track an immunotherapy regimen
                <span className="block font-normal text-slate-500">Turn this off to hide reminders and the next-appointment card.</span>
              </span>
              <input
                type="checkbox"
                checked={scheduleForm.enabled}
                onChange={(e) => setScheduleForm({ ...scheduleForm, enabled: e.target.checked })}
                className="w-5 h-5 text-emerald-600 rounded shrink-0"
              />
            </label>

            <fieldset>
              <legend className="text-xs font-bold text-slate-700 mb-1">Treatment phase</legend>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleForm({ ...scheduleForm, phase: 'build-up' })}
                  aria-pressed={scheduleForm.phase === 'build-up'}
                  className={`py-2 text-xs font-bold rounded-xl border ${
                    scheduleForm.phase === 'build-up' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  Build-Up (Weekly)
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleForm({ ...scheduleForm, phase: 'maintenance' })}
                  aria-pressed={scheduleForm.phase === 'maintenance'}
                  className={`py-2 text-xs font-bold rounded-xl border ${
                    scheduleForm.phase === 'maintenance' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  Maintenance (2-4 wks)
                </button>
              </div>
            </fieldset>

            <div>
              <label htmlFor="shot-interval" className="text-xs font-bold text-slate-700 block mb-1">
                Interval between shots
              </label>
              <select
                id="shot-interval"
                value={scheduleForm.intervalDays}
                onChange={(e) => setScheduleForm({ ...scheduleForm, intervalDays: Number(e.target.value) || 7 })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value={7}>7 days (weekly build-up)</option>
                <option value={14}>14 days (2 weeks)</option>
                <option value={21}>21 days (3 weeks)</option>
                <option value={28}>28 days (4 weeks maintenance)</option>
              </select>
            </div>

            <div>
              <label htmlFor="shot-next-date" className="text-xs font-bold text-slate-700 block mb-1">
                Next scheduled shot date
              </label>
              <input
                id="shot-next-date"
                type="date"
                value={scheduleForm.nextShotDate}
                onChange={(e) => setScheduleForm({ ...scheduleForm, nextShotDate: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <fieldset>
              <legend className="text-xs font-bold text-slate-700 mb-1">Default arm rotation</legend>
              <div className="grid grid-cols-3 gap-2">
                {(['Left Arm', 'Right Arm', 'Alternating'] as const).map((arm) => (
                  <button
                    type="button"
                    key={arm}
                    onClick={() => setScheduleForm({ ...scheduleForm, defaultArm: arm })}
                    aria-pressed={scheduleForm.defaultArm === arm}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      scheduleForm.defaultArm === arm
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {arm}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="pt-2 border-t border-slate-100 space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Allergist &amp; clinic info (optional)</span>

              <label htmlFor="allergist-name" className="sr-only">Doctor name</label>
              <input
                id="allergist-name"
                type="text"
                value={scheduleForm.doctorName}
                onChange={(e) => setScheduleForm({ ...scheduleForm, doctorName: e.target.value })}
                placeholder="Doctor name"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />

              <label htmlFor="allergist-clinic" className="sr-only">Clinic name</label>
              <input
                id="allergist-clinic"
                type="text"
                value={scheduleForm.clinicName}
                onChange={(e) => setScheduleForm({ ...scheduleForm, clinicName: e.target.value })}
                placeholder="Clinic name"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="allergist-phone" className="sr-only">Clinic phone</label>
                  <input
                    id="allergist-phone"
                    type="tel"
                    value={scheduleForm.phone}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, phone: e.target.value })}
                    placeholder="Phone"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label htmlFor="allergist-email" className="sr-only">Clinic email</label>
                  <input
                    id="allergist-email"
                    type="email"
                    value={scheduleForm.email}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, email: e.target.value })}
                    placeholder="Email"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <label htmlFor="allergist-address" className="sr-only">Clinic address</label>
              <input
                id="allergist-address"
                type="text"
                value={scheduleForm.address}
                onChange={(e) => setScheduleForm({ ...scheduleForm, address: e.target.value })}
                placeholder="Clinic address"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* DELETE CONFIRMATION */}
      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this shot record?"
        size="max-w-sm"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50"
            >
              Keep it
            </button>
            <button
              type="button"
              data-autofocus
              onClick={() => pendingDelete && handleDeleteShot(pendingDelete)}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md"
            >
              Delete record
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          {pendingDelete && (
            <>
              This removes the dose recorded on <strong>{formatDateKeyLong(pendingDelete.date)}</strong> from
              your history. Your next appointment date stays as it is.
            </>
          )}
        </p>
      </Modal>

    </div>
  );
};
