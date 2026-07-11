import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Loader2 } from 'lucide-react';

type RunExclusive = <T>(label: string, work: () => Promise<T>) => Promise<T | undefined>;

interface TollReconBusyContextValue {
  /** True while any reconciliation mutation is in flight. */
  busy: boolean;
  /** Short status shown on the overlay. */
  message: string;
  /**
   * Run work exclusively. If another action is already running, shows a toast-friendly
   * no-op (returns undefined) so double-clicks cannot stack.
   */
  runExclusive: RunExclusive;
}

const TollReconBusyContext = createContext<TollReconBusyContextValue | null>(null);

export function useTollReconBusy(): TollReconBusyContextValue {
  const ctx = useContext(TollReconBusyContext);
  if (!ctx) {
    // Outside wizard — pass-through so shared children still work in tests/stories.
    return {
      busy: false,
      message: '',
      runExclusive: async (_label, work) => work(),
    };
  }
  return ctx;
}

export function TollReconBusyProvider({ children }: { children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const depthRef = useRef(0);

  const runExclusive = useCallback<RunExclusive>(async (label, work) => {
    if (depthRef.current > 0) {
      // Hard lock: ignore stacked clicks instead of queuing (queuing reorders money moves).
      return undefined;
    }
    depthRef.current = 1;
    setMessage(label || 'Working…');
    setBusy(true);
    try {
      return await work();
    } finally {
      depthRef.current = 0;
      setBusy(false);
      setMessage('');
    }
  }, []);

  const value = useMemo(
    () => ({ busy, message, runExclusive }),
    [busy, message, runExclusive],
  );

  return (
    <TollReconBusyContext.Provider value={value}>
      <div className="relative" aria-busy={busy || undefined}>
        {children}
        {busy && (
          <div
            className="fixed inset-0 z-[200] flex items-start justify-center bg-white/55 backdrop-blur-[1px] pt-[20vh]"
            role="status"
            aria-live="polite"
            aria-label={message || 'Working'}
            // Capture all clicks while an action runs (covers portaled drawers/modals too).
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-md">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              {message || 'Working…'}
            </div>
          </div>
        )}
      </div>
    </TollReconBusyContext.Provider>
  );
}
