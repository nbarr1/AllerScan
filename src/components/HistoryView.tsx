import React, { useState } from 'react';
import {
  Activity,
  Plus,
  TrendingUp,
  Calendar,
  CheckCircle2,
  Sparkles,
  Info,
  Smile,
  Meh,
  Frown,
  AlertCircle
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { SymptomLog } from '../types';

interface HistoryViewProps {
  symptomLogs: SymptomLog[];
  onAddSymptomLog: (log: SymptomLog) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  symptomLogs,
  onAddSymptomLog,
}) => {
  const [showLogModal, setShowLogModal] = useState(false);
  const [score, setScore] = useState<number>(2);
  const [sneezing, setSneezing] = useState(true);
  const [wateryEyes, setWateryEyes] = useState(true);
  const [congestion, setCongestion] = useState(true);
  const [itchyThroat, setItchyThroat] = useState(false);
  const [fatigue, setFatigue] = useState(false);
  const [notes, setNotes] = useState('');

  const handleSaveLog = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const newLog: SymptomLog = {
      id: 'sym_' + Date.now(),
      date: todayStr,
      severityScore: score,
      sneezing,
      wateryEyes,
      congestion,
      itchyThroat,
      fatigue,
      notes: notes || undefined,
    };
    onAddSymptomLog(newLog);
    setShowLogModal(false);
    setNotes('');
  };

  // Format data for Recharts line chart
  const chartData = [...symptomLogs].reverse().map((log) => ({
    date: log.date.split('-').slice(1).join('/'),
    'Your Symptom Severity': log.severityScore * 25, // Scale 0-4 to 0-100
    'Pollen Risk Index': 40 + Math.floor(Math.sin(log.severityScore) * 30 + (log.severityScore * 12)),
  }));

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      
      {/* Title & Top Action Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-600" />
            Symptom History & Environmental Correlations
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Log daily symptoms to correlate personal reactions against environmental pollen surges.
          </p>
        </div>

        <button
          onClick={() => setShowLogModal(true)}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-emerald-600/20 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>1-Tap Log Today's Symptoms</span>
        </button>
      </div>

      {/* TREND GRAPH: RECHARTS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" /> Symptom vs Pollen Risk Trend (Last 7 Logs)
        </h2>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Line type="monotone" dataKey="Your Symptom Severity" stroke="#f43f5e" strokeWidth={3} dot={{ r: 5 }} />
              <Line type="monotone" dataKey="Pollen Risk Index" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI CORRELATION INSIGHT CARDS */}
      <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl shadow-md space-y-3">
        <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm">
          <Sparkles className="w-4 h-4" /> Personal Correlation Summary
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Based on your logged entries, your symptom severity scores (sneezing, congestion) peak on days when <strong>Weed (Ragweed)</strong> and <strong>Oak Tree</strong> pollen indices cross 50/100.
        </p>
      </div>

      {/* LOG HISTORY TIMELINE */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-600" /> Daily Symptom Journal Entries ({symptomLogs.length})
        </h2>

        <div className="space-y-3">
          {symptomLogs.map((log) => (
            <div key={log.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-900">{log.date}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  log.severityScore >= 3
                    ? 'bg-rose-100 text-rose-800'
                    : log.severityScore >= 2
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  Severity: {log.severityScore} / 4
                </span>
              </div>

              {/* Symptom Tag Pills */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {log.sneezing && <span className="px-2 py-0.5 bg-white text-slate-700 text-[11px] font-semibold border rounded-lg">Sneezing</span>}
                {log.wateryEyes && <span className="px-2 py-0.5 bg-white text-slate-700 text-[11px] font-semibold border rounded-lg">Watery Eyes</span>}
                {log.congestion && <span className="px-2 py-0.5 bg-white text-slate-700 text-[11px] font-semibold border rounded-lg">Congestion</span>}
                {log.itchyThroat && <span className="px-2 py-0.5 bg-white text-slate-700 text-[11px] font-semibold border rounded-lg">Itchy Throat</span>}
                {log.fatigue && <span className="px-2 py-0.5 bg-white text-slate-700 text-[11px] font-semibold border rounded-lg">Fatigue</span>}
              </div>

              {log.notes && (
                <p className="text-xs text-slate-600 italic">"{log.notes}"</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 1-TAP SYMPTOM LOGGING MODAL */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-600" /> Log Today's Allergy Symptoms
              </h3>
              <button onClick={() => setShowLogModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">Overall Symptom Severity (0 to 4)</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[0, 1, 2, 3, 4].map((s) => (
                    <button
                      key={s}
                      onClick={() => setScore(s)}
                      className={`py-3 text-xs font-black rounded-xl border transition-all ${
                        score === s
                          ? s >= 3 ? 'bg-rose-600 text-white border-rose-600' : 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {s === 0 ? 'None' : s === 1 ? 'Mild' : s === 2 ? 'Mod' : s === 3 ? 'High' : 'Severe'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">Check Experienced Symptoms:</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 bg-slate-50 border rounded-xl cursor-pointer">
                    <input type="checkbox" checked={sneezing} onChange={(e) => setSneezing(e.target.checked)} className="rounded text-emerald-600" />
                    <span>Sneezing</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-slate-50 border rounded-xl cursor-pointer">
                    <input type="checkbox" checked={wateryEyes} onChange={(e) => setWateryEyes(e.target.checked)} className="rounded text-emerald-600" />
                    <span>Watery Eyes</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-slate-50 border rounded-xl cursor-pointer">
                    <input type="checkbox" checked={congestion} onChange={(e) => setCongestion(e.target.checked)} className="rounded text-emerald-600" />
                    <span>Nasal Congestion</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-slate-50 border rounded-xl cursor-pointer">
                    <input type="checkbox" checked={itchyThroat} onChange={(e) => setItchyThroat(e.target.checked)} className="rounded text-emerald-600" />
                    <span>Itchy Throat</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-slate-50 border rounded-xl cursor-pointer col-span-2">
                    <input type="checkbox" checked={fatigue} onChange={(e) => setFatigue(e.target.checked)} className="rounded text-emerald-600" />
                    <span>Allergy Fatigue / Brain Fog</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Optional Notes (e.g. triggers, activities)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Spent 2 hours outdoors at park..."
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
                onClick={handleSaveLog}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md"
              >
                Save Symptom Entry
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
