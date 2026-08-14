import React, { useState } from 'react';
import {
  Syringe,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  Plus,
  RotateCcw,
  UserCheck,
  Check,
  Info
} from 'lucide-react';
import { ImmunotherapySchedule, ShotLog } from '../types';

interface ShotsViewProps {
  schedule: ImmunotherapySchedule;
  onUpdateSchedule: (newSchedule: ImmunotherapySchedule) => void;
}

export const ShotsView: React.FC<ShotsViewProps> = ({
  schedule,
  onUpdateSchedule,
}) => {
  const [showLogModal, setShowLogModal] = useState(false);
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);

  // Form states for logging a shot
  const [logArm, setLogArm] = useState<'Left Arm' | 'Right Arm' | 'Both'>(
    schedule.defaultArm === 'Right Arm' ? 'Right Arm' : 'Left Arm'
  );
  const [logDosage, setLogDosage] = useState('0.5 mL (1:100 vol)');
  const [logReaction, setLogReaction] = useState<'None' | 'Mild Local' | 'Moderate Local' | 'Systemic'>('None');
  const [logNotes, setLogNotes] = useState('');

  // Form states for editing schedule
  const [editPhase, setEditPhase] = useState<'build-up' | 'maintenance'>(schedule.phase);
  const [editInterval, setEditInterval] = useState(schedule.intervalDays);
  const [editNextDate, setEditNextDate] = useState(schedule.nextShotDate);
  const [editArm, setEditArm] = useState(schedule.defaultArm);
  const [editDoctorName, setEditDoctorName] = useState(schedule.allergistInfo.doctorName);
  const [editClinicName, setEditClinicName] = useState(schedule.allergistInfo.clinicName);
  const [editPhone, setEditPhone] = useState(schedule.allergistInfo.phone);
  const [editEmail, setEditEmail] = useState(schedule.allergistInfo.email);
  const [editAddress, setEditAddress] = useState(schedule.allergistInfo.address);

  // Calculate days since last completed shot
  const getLastCompletedShot = () => {
    const completed = schedule.shotHistory.filter((s) => s.completed);
    if (completed.length === 0) return null;
    return completed[0]; // sorted newest first
  };

  const lastShot = getLastCompletedShot();

  const getDaysSinceLastShot = () => {
    if (!lastShot) return null;
    const shotDate = new Date(lastShot.date);
    const today = new Date();
    const diffTime = today.getTime() - shotDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysSinceLast = getDaysSinceLastShot();

  // Handle Mark Completed
  const handleCompleteShot = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const newLog: ShotLog = {
      id: 'shot_' + Date.now(),
      date: todayStr,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      arm: logArm,
      dosage: logDosage,
      reactionSeverity: logReaction,
      reactionDetails: logNotes || undefined,
      completed: true,
    };

    // Calculate next date based on schedule interval
    const nextDateObj = new Date();
    nextDateObj.setDate(nextDateObj.getDate() + schedule.intervalDays);
    const nextDateStr = nextDateObj.toISOString().split('T')[0];

    const updatedSchedule: ImmunotherapySchedule = {
      ...schedule,
      enabled: true,
      nextShotDate: nextDateStr,
      shotHistory: [newLog, ...schedule.shotHistory],
    };

    onUpdateSchedule(updatedSchedule);
    setShowLogModal(false);
    setLogNotes('');
  };

  const handleSaveSchedule = () => {
    const updated: ImmunotherapySchedule = {
      ...schedule,
      enabled: true,
      phase: editPhase,
      intervalDays: editInterval,
      nextShotDate: editNextDate,
      defaultArm: editArm,
      allergistInfo: {
        doctorName: editDoctorName,
        clinicName: editClinicName,
        phone: editPhone,
        email: editEmail,
        address: editAddress,
      },
    };
    onUpdateSchedule(updated);
    setShowEditScheduleModal(false);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      
      {/* Title & Header */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Syringe className="w-6 h-6 text-amber-500" />
            Immunotherapy & Allergy Shot Tracker
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage recurring shot regimens, arm site rotation, reaction logs, and allergist communications.
          </p>
        </div>

        <button
          onClick={() => setShowEditScheduleModal(true)}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs"
        >
          ⚙️ Configure Regimen
        </button>
      </div>

      {/* 28-DAY MAX INTERVAL SAFETY WARNING (if applicable) */}
      {daysSinceLast !== null && daysSinceLast >= 25 && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 space-y-1">
            <span className="font-extrabold text-sm block">
              Interval Warning: It's been {daysSinceLast} days since your last shot
            </span>
            <p>
              You are approaching or exceeding the typical 28-day maximum maintenance interval between immunotherapy doses.
            </p>
            <p className="font-semibold italic">
              Please confirm your next appointment schedule with your allergist before receiving your next dose.
            </p>
          </div>
        </div>
      )}

      {/* NEXT SHOT CARD & REGIMEN STATUS */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

        {/* Next Scheduled Shot */}
        {schedule.enabled && schedule.nextShotDate ? (
          <div className="md:col-span-7 bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 p-6 rounded-3xl shadow-lg relative overflow-hidden flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-950/20 text-slate-950 border border-slate-950/20">
                  {schedule.phase} Phase ({schedule.intervalDays}-Day Interval)
                </span>
                <span className="text-xs font-bold">Arm Rotation: {schedule.defaultArm}</span>
              </div>

              <div className="pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900/70 block">Next Appointment</span>
                <div className="text-3xl font-black">{schedule.nextShotDate}</div>
              </div>
            </div>

            <div className="pt-6 flex flex-wrap gap-2">
              <button
                onClick={() => setShowLogModal(true)}
                className="px-5 py-2.5 bg-slate-950 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Mark Shot as Completed</span>
              </button>
              <button
                onClick={() => setShowEditScheduleModal(true)}
                className="px-4 py-2.5 bg-white/30 hover:bg-white/40 text-slate-950 font-bold text-xs rounded-xl"
              >
                Reschedule
              </button>
            </div>
          </div>
        ) : (
          <div className="md:col-span-7 bg-slate-50 border-2 border-dashed border-slate-300 p-6 rounded-3xl flex flex-col items-center justify-center text-center space-y-3">
            <Syringe className="w-8 h-8 text-slate-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-700">No Immunotherapy Regimen Set Up</h3>
              <p className="text-xs text-slate-500 mt-1">Configure your shot phase, interval, and next appointment to start tracking.</p>
            </div>
            <button
              onClick={() => setShowEditScheduleModal(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs"
            >
              Configure Regimen
            </button>
          </div>
        )}

        {/* Allergist Quick Contact Card */}
        <div className="md:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600" /> Allergist Contact & Clinic Info
          </h3>

          {schedule.allergistInfo.doctorName ? (
            <div className="space-y-2 text-xs text-slate-700">
              <div className="font-bold text-sm text-slate-900">{schedule.allergistInfo.doctorName}</div>
              <p className="text-slate-500">{schedule.allergistInfo.clinicName}</p>

              <div className="pt-2 space-y-1.5 border-t border-slate-100">
                {schedule.allergistInfo.phone && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <a href={`tel:${schedule.allergistInfo.phone}`} className="hover:underline font-bold text-emerald-700">
                      {schedule.allergistInfo.phone}
                    </a>
                  </div>
                )}
                {schedule.allergistInfo.email && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{schedule.allergistInfo.email}</span>
                  </div>
                )}
                {schedule.allergistInfo.address && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="truncate">{schedule.allergistInfo.address}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 text-center py-4">
              No allergist info saved yet. Add your doctor and clinic details in Configure Regimen.
            </div>
          )}
        </div>

      </div>

      {/* SHOT HISTORY LOG */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-600" /> Recorded Shot History ({schedule.shotHistory.length})
          </h2>
          <button
            onClick={() => setShowLogModal(true)}
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Log Past Shot
          </button>
        </div>

        <div className="space-y-3">
          {schedule.shotHistory.map((shot) => (
            <div key={shot.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{shot.date} at {shot.time}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {shot.arm}
                  </span>
                  <span className="text-xs text-slate-500">• {shot.dosage}</span>
                </div>
                {shot.reactionDetails && (
                  <p className="text-xs text-slate-600">{shot.reactionDetails}</p>
                )}
              </div>

              <div className="text-right shrink-0">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  shot.reactionSeverity === 'None'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  Reaction: {shot.reactionSeverity}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LOG SHOT MODAL */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Syringe className="w-5 h-5 text-amber-500" /> Log Allergy Shot Completion
              </h3>
              <button onClick={() => setShowLogModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Injection Arm Location</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Left Arm', 'Right Arm', 'Both'] as const).map((arm) => (
                    <button
                      key={arm}
                      onClick={() => setLogArm(arm)}
                      className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                        logArm === arm
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {arm}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Dosage</label>
                <input
                  type="text"
                  value={logDosage}
                  onChange={(e) => setLogDosage(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Local Reaction Level</label>
                <select
                  value={logReaction}
                  onChange={(e: any) => setLogReaction(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="None">None (No localized swelling)</option>
                  <option value="Mild Local">Mild Local (&lt;25mm wheal)</option>
                  <option value="Moderate Local">Moderate Local (25-50mm wheal)</option>
                  <option value="Systemic">Systemic (Report immediately to doctor)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Reaction Notes / Wheal Size</label>
                <textarea
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="e.g. Minor redness, applied ice pack..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowLogModal(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteShot}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md"
              >
                Save & Update Next Shot Date
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT REGIMEN CONFIG MODAL */}
      {showEditScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Configure Immunotherapy Regimen</h3>
              <button onClick={() => setShowEditScheduleModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Treatment Phase</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setEditPhase('build-up')}
                    className={`py-2 text-xs font-bold rounded-xl border ${
                      editPhase === 'build-up' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Build-Up (Weekly)
                  </button>
                  <button
                    onClick={() => setEditPhase('maintenance')}
                    className={`py-2 text-xs font-bold rounded-xl border ${
                      editPhase === 'maintenance' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Maintenance (2-4 wks)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Interval Between Shots (Days)</label>
                <select
                  value={editInterval}
                  onChange={(e) => setEditInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value={7}>7 Days (Weekly Build-Up)</option>
                  <option value={14}>14 Days (2 Weeks)</option>
                  <option value={21}>21 Days (3 Weeks)</option>
                  <option value={28}>28 Days (4 Weeks Maintenance)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Next Scheduled Shot Date</label>
                <input
                  type="date"
                  value={editNextDate}
                  onChange={(e) => setEditNextDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Allergist & Clinic Info (Optional)</label>
                <input
                  type="text"
                  value={editDoctorName}
                  onChange={(e) => setEditDoctorName(e.target.value)}
                  placeholder="Doctor Name"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
                <input
                  type="text"
                  value={editClinicName}
                  onChange={(e) => setEditClinicName(e.target.value)}
                  placeholder="Clinic Name"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Phone"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Clinic Address"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowEditScheduleModal(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSchedule}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
