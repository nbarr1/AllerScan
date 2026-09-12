import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// One dialog wrapper for every modal in the app.
//
// Previously each of the six modals was a bare `fixed inset-0` div: no Escape key, no backdrop
// dismissal, no focus trap, no `aria-modal`, and the page behind them still scrolled. This
// component carries all of that once so every dialog gets it.

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  isOpen: boolean;
  /** Omit to make the dialog non-dismissable (onboarding, which must be completed). */
  onClose?: () => void;
  /** Accessible name. Rendered as the heading when `header` isn't supplied. */
  title: string;
  /** Optional richer heading; `title` still names the dialog for assistive technology. */
  header?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned to the bottom of the panel, outside the scrolling body. */
  footer?: React.ReactNode;
  /** Tailwind max-width class. */
  size?: string;
  /** Slide in from the right instead of centring (the notification drawer). */
  variant?: 'center' | 'drawer';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  header,
  children,
  footer,
  size = 'max-w-md',
  variant = 'center',
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`).current;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'Escape' && onClose) {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Lock background scrolling while the dialog is up.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', handleKeyDown, true);

    // Move focus into the dialog on the next frame, once children have rendered.
    const focusTimer = window.setTimeout(() => {
      if (!panelRef.current) return;
      const target =
        panelRef.current.querySelector<HTMLElement>('[data-autofocus]') ||
        panelRef.current.querySelector<HTMLElement>(FOCUSABLE) ||
        panelRef.current;
      target.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const isDrawer = variant === 'drawer';

  return (
    <div
      className={`fixed inset-0 z-50 flex p-4 bg-slate-950/60 backdrop-blur-xs ${
        isDrawer ? 'justify-end p-0' : 'items-center justify-center'
      }`}
      onMouseDown={(event) => {
        // Only dismiss on a press that both starts and ends on the backdrop itself.
        if (event.target === event.currentTarget && onClose) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-white border border-slate-200 shadow-2xl flex flex-col outline-none ${
          isDrawer
            ? 'w-full max-w-sm h-full border-l'
            : `rounded-3xl w-full ${size} max-h-[90vh] rounded-3xl`
        }`}
      >
        <div className="flex justify-between items-start gap-3 px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          {header ? (
            <div id={titleId} className="min-w-0">
              {header}
            </div>
          ) : (
            <h2 id={titleId} className="text-lg font-bold text-slate-900">
              {title}
            </h2>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title}`}
              className="p-1.5 -mr-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
};

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

/** Replaces the blocking `window.confirm` calls, which couldn't be styled or explained. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onCancel}
    title={title}
    size="max-w-sm"
    footer={
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          data-autofocus
          onClick={onConfirm}
          className={`flex-1 py-2.5 text-white font-extrabold text-xs rounded-xl shadow-md ${
            tone === 'danger'
              ? 'bg-rose-600 hover:bg-rose-700'
              : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    }
  >
    <div className="text-sm text-slate-600 leading-relaxed space-y-2">{body}</div>
  </Modal>
);
