import React, { useState } from 'react';
import {
  Activity,
  Plus,
  TrendingUp,
  Calendar,
  Trash2,
  Info
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Modal } from './Modal';
import { SymptomLog } from '../types';
import { formatDateKeyLong, formatDateKeyShort, toLocalDateKey } from '../utils/dates';

interface HistoryViewProps {
  symptomLogs: SymptomLog[];
  onAddSymptomLog: (log: SymptomLog) => void;
  onDeleteSymptomLog: (id: string) => void;
}

const SEVERITY_LABELS = ['None', 'Mild', 'Moderate', 'High', 'Severe'];

const SYMPTOM_FIELDS = [
  { key: 'sneezing', label: 'Sneezing' },
  { key: 'wateryEyes', label: 'Watery eyes' },
  { key: 'congestion', label: 'Nasal congestion' },
  { key: 'itchyThroat', label: 'Itchy throat' },
  { key: 'fatigue', label: 'Allergy fatigue / brain fog' },
] as const;

type SymptomKey = (typeof SYMPTOM_FIELDS)[number]['key'];

interface FormState {
  date: string;
  score: number;
  symptoms: Record<SymptomKey, boolean>;
  notes: string;
}

// Nothing is pre-selected: a journal that fills itself in records symptoms the user never had,
// and a form that keeps yesterday's answers quietly flattens the trend it exists to reveal.
const emptyForm = (): FormState => ({
  date: toLocalDateKey(),
  score: 0,
  symptoms: { sneezing: false, wateryEyes: false, congestion: false, itchyThroat: false, fatigue: false },
  notes: '',
});

export const HistoryView: React.FC<HistoryViewProps> = ({
  symptomLogs,
  onAddSymptomLog,
  onDeleteSymptomLog,
}) => {
  const [showLogModal, setShowLogModal] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingDelete, setPendingDelete] = useState<SymptomLog | null>(null);

  const openLogModal = () => {
    setForm(emptyForm());
    setShowLogModal(true);
  };

  const existingForDate = symptomLogs.find((log) => log.date === form.date);

  const handleSaveLog = () => {
    onAddSymptomLog({
      id: 'sym_' + Date.now(),
      date: form.date,
      severityScore: form.score,
      sneezing: form.symptoms.sneezing,
      wateryEyes: form.symptoms.wateryEyes,
      congestion: form.symptoms.congestion,
      itchyThroat: form.symptoms.itchyThroat,
      fatigue: form.symptoms.fatigue,
      notes: form.notes.trim() || undefined,
    });
    setShowLogModal(false);
    setForm(emptyForm());
  };

  // Ordered by date, not by insertion order, so a back-filled entry plots where it belongs.
  const chartData = [...symptomLogs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((log) => ({
      date: formatDateKeyShort(log.date),
      severity: log.severityScore,
    }));

  const sortedLogs = [...symptomLogs].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6 pb-20 md:pb-8">

      {/* Title & Top Action Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-600" aria-hidden="true" />
            Symptom History &amp; Environmental Correlations
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Log daily symptoms to correlate personal reactions against environmental pollen surges.
          </p>
        </div>

        <button
          type="button"
          onClick={openLogModal}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-emerald-600/20 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Log symptoms</span>
        </button>
      </div>

      {/* TREND GRAPH */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Your Logged Symptom Severity Trend
        </h2>

        {chartData.length > 0 ? (
          <>
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                {/* Plotted on the 0-4 scale you actually recorded, rather than scaled to 0-100
                    where a "Moderate" day would read as 50 of something. */}
                <LineChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    domain={[0, 4]}
                    ticks={[0, 1, 2, 3, 4]}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(value) => SEVERITY_LABELS[Number(value)] ?? String(value)}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                    formatter={(value) => {
                      const score = Number(value);
                      return [`${SEVERITY_LABELS[score] ?? score} (${score}/4)`, 'Severity'];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="severity"
                    name="Severity"
                    stroke="#f43f5e"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Your own 0-4 severity ratings, one point per logged day.
            </p>
          </>
        ) : (
          <p className="py-10 text-center text-xs text-slate-400">
            Log your first symptom entry to start seeing your severity trend here.
          </p>
        )}
      </div>

      {/* LOG HISTORY TIMELINE */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-600" aria-hidden="true" /> Daily Symptom Journal Entries ({symptomLogs.length})
        </h2>

        {sortedLogs.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            No symptom entries logged yet. Use "Log symptoms" above to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedLogs.map((log) => (
              <div key={log.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-xs font-bold text-slate-900">{formatDateKeyLong(log.date)}</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      log.severityScore >= 3
                        ? 'bg-rose-100 text-rose-800'
                        : log.severityScore >= 2
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {SEVERITY_LABELS[log.severityScore] ?? log.severityScore} ({log.severityScore}/4)
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(log)}
                      aria-label={`Delete the symptom entry for ${formatDateKeyLong(log.date)}`}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SYMPTOM_FIELDS.filter((field) => log[field.key]).map((field) => (
                    <span
                      key={field.key}
                      className="px-2 py-0.5 bg-white text-slate-700 text-[11px] font-semibold border border-slate-200 rounded-lg"
                    >
                      {field.label}
                    </span>
                  ))}
                  {SYMPTOM_FIELDS.every((field) => !log[field.key]) && (
                    <span className="text-[11px] text-slate-400 italic">No specific symptoms recorded</span>
                  )}
                </div>

                {log.notes && <p className="text-xs text-slate-600 italic">"{log.notes}"</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SYMPTOM LOGGING MODAL */}
      <Modal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        title="Log allergy symptoms"
        header={
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-600" aria-hidden="true" /> Log Allergy Symptoms
          </h2>
        }
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowLogModal(false)}
              className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveLog}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md"
            >
              {existingForDate ? 'Replace entry' : 'Save entry'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="symptom-date" className="text-xs font-bold text-slate-700 block mb-1">
              Date
            </label>
            <input
              id="symptom-date"
              data-autofocus
              type="date"
              value={form.date}
              max={toLocalDateKey()}
              onChange={(e) => setForm({ ...form, date: e.target.value || toLocalDateKey() })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {existingForDate && (
              <p role="status" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5">
                You already logged {formatDateKeyLong(form.date)}. Saving replaces that entry — one
                per day keeps the trend readable.
              </p>
            )}
          </div>

          <fieldset>
            <legend className="text-xs font-bold text-slate-700 mb-2">Overall symptom severity</legend>
            <div className="grid grid-cols-5 gap-1.5">
              {[0, 1, 2, 3, 4].map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setForm({ ...form, score: s })}
                  aria-pressed={form.score === s}
                  className={`py-3 text-xs font-black rounded-xl border transition-all ${
                    form.score === s
                      ? s >= 3
                        ? 'bg-rose-600 text-white border-rose-600'
                        : s === 0
                        ? 'bg-slate-700 text-white border-slate-700'
                        : 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {SEVERITY_LABELS[s]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-bold text-slate-700 mb-2">Symptoms experienced</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {SYMPTOM_FIELDS.map((field) => (
                <label
                  key={field.key}
                  htmlFor={`symptom-${field.key}`}
                  className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <input
                    id={`symptom-${field.key}`}
                    type="checkbox"
                    checked={form.symptoms[field.key]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        symptoms: { ...form.symptoms, [field.key]: e.target.checked },
                      })
                    }
                    className="w-5 h-5 rounded text-emerald-600 shrink-0"
                  />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="symptom-notes" className="text-xs font-bold text-slate-700 block mb-1">
              Notes <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="symptom-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Spent 2 hours outdoors at the park…"
              rows={2}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </Modal>

      {/* DELETE CONFIRMATION */}
      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this entry?"
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
              onClick={() => {
                if (pendingDelete) onDeleteSymptomLog(pendingDelete.id);
                setPendingDelete(null);
              }}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md"
            >
              Delete entry
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          {pendingDelete && (
            <>
              This removes your symptom entry for{' '}
              <strong>{formatDateKeyLong(pendingDelete.date)}</strong> and its point on the trend chart.
            </>
          )}
        </p>
      </Modal>

    </div>
  );
};
