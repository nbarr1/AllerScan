import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * The last line of defence for a render error anywhere in the app. Without it React unmounts the
 * whole tree and leaves a blank page, and because the usual cause is saved data the code didn't
 * expect, reloading reproduces it. This offers a reload first and, failing that, a way to clear
 * AllerScan's saved data without opening the browser's site settings.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('AllerScan hit an unexpected error:', error, info.componentStack);
  }

  private resetData = () => {
    if (!window.confirm('Delete everything AllerScan has saved on this device? This cannot be undone.')) return;
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('allerscan_'))
        .forEach((key) => localStorage.removeItem(key));
    } catch (err) {
      console.error('Could not clear saved data:', err);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-slate-100">
        <AlertTriangle className="w-12 h-12 text-amber-500" aria-hidden="true" />
        <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
        <p className="text-sm text-slate-600 max-w-sm">
          AllerScan ran into an unexpected error. Reload to try again. If the error comes back, your
          saved data may be damaged, and clearing it lets the app start fresh.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Reload</span>
          </button>
          <button
            type="button"
            onClick={this.resetData}
            className="px-4 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-sm font-bold rounded-xl flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>Clear saved data</span>
          </button>
        </div>
      </div>
    );
  }
}
