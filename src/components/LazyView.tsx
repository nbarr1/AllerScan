import React, { Suspense } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface LazyViewProps {
  /** Names the section in the loading and error states, e.g. "the pollen map". */
  label: string;
  children: React.ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

/**
 * Catches a lazily loaded tab whose code couldn't be fetched — most often because the device went
 * offline before that tab was ever opened, so the service worker never cached it. React.lazy keeps
 * a failed import rejected, so the recovery is a reload rather than a re-render.
 */
class ChunkErrorBoundary extends React.Component<LazyViewProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(`Couldn't load ${this.props.label}:`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="min-h-[40vh] flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-700">
          Couldn't load {this.props.label}. Check your connection, then reload.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reload</span>
        </button>
      </div>
    );
  }
}

/** Suspense plus a load-failure boundary for a code-split tab. */
export const LazyView: React.FC<LazyViewProps> = ({ label, children }) => (
  <ChunkErrorBoundary label={label}>
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3" role="status">
          <div className="w-10 h-10 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Loading {label}…</p>
        </div>
      }
    >
      {children}
    </Suspense>
  </ChunkErrorBoundary>
);
