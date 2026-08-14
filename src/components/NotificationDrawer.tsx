import React from 'react';
import {
  Bell,
  X,
  CheckCircle,
  AlertTriangle,
  Info,
  Syringe,
  Wind,
  Trash2
} from 'lucide-react';
import { AppNotification } from '../types';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onClearAll: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onClearAll,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm h-full shadow-2xl p-6 flex flex-col justify-between border-l border-slate-200">
        
        {/* Header */}
        <div>
          <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Bell className="w-5 h-5 text-emerald-600" />
              In-App Alerts & Notifications
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex justify-between items-center mb-3 text-xs">
            <button onClick={onMarkAllRead} className="font-bold text-emerald-600 hover:underline">
              Mark All as Read
            </button>
            <button onClick={onClearAll} className="font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          </div>

          {/* List */}
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {notifications.length > 0 ? (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    notif.severity === 'alert'
                      ? 'bg-rose-50 border-rose-200 text-rose-950'
                      : notif.severity === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {notif.type === 'pollen' || notif.type === 'aqi' ? (
                      <Wind className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <Syringe className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="text-xs font-black">{notif.title}</div>
                      <p className="text-xs text-slate-600 leading-relaxed">{notif.message}</p>
                      <span className="text-[10px] text-slate-400 block pt-1">{notif.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                No active notifications right now.
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs"
        >
          Close Notifications
        </button>

      </div>
    </div>
  );
};
