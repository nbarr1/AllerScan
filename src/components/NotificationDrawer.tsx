import React from 'react';
import {
  Bell,
  Syringe,
  Wind,
  Camera,
  Trash2
} from 'lucide-react';
import { Modal } from './Modal';
import { AppNotification } from '../types';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onClearAll: () => void;
}

const TYPE_ICONS: Record<AppNotification['type'], React.ElementType> = {
  pollen: Wind,
  aqi: Wind,
  shot: Syringe,
  scan: Camera,
};

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onClearAll,
}) => {
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="drawer"
      title="Alerts and notifications"
      header={
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <Bell className="w-5 h-5 text-emerald-600" aria-hidden="true" />
          Alerts &amp; Notifications
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
              {unreadCount} unread
            </span>
          )}
        </h2>
      }
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs"
        >
          Close
        </button>
      }
    >
      {notifications.length > 0 && (
        <div className="flex justify-between items-center mb-3 text-xs">
          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0}
            className="font-bold text-emerald-600 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
          >
            Mark all as read
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Clear all
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {notifications.length > 0 ? (
          notifications.map((notif) => {
            const Icon = TYPE_ICONS[notif.type] ?? Bell;
            return (
              <li
                key={notif.id}
                className={`p-3.5 rounded-2xl border transition-all ${
                  notif.severity === 'alert'
                    ? 'bg-rose-50 border-rose-200'
                    : notif.severity === 'warning'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-slate-50 border-slate-200'
                } ${notif.read ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      notif.severity === 'alert'
                        ? 'text-rose-600'
                        : notif.severity === 'warning'
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {!notif.read && (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" aria-hidden="true" />
                          <span className="sr-only">Unread. </span>
                        </>
                      )}
                      <span className="text-xs font-black text-slate-900">{notif.title}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{notif.message}</p>
                    <span className="text-[10px] text-slate-400 block pt-1">{notif.timestamp}</span>
                  </div>
                </div>
              </li>
            );
          })
        ) : (
          <li className="py-12 text-center text-xs text-slate-400">
            No alerts right now. AllerScan adds them here when your saved allergens spike, the air
            quality turns unhealthy, or a shot is due.
          </li>
        )}
      </ul>
    </Modal>
  );
};
