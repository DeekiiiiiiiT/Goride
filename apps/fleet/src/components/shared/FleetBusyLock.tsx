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

export interface FleetBusyContextValue {
  /** True while exclusive work is in flight. */
  busy: boolean;
  /** Short status shown on the overlay. */
  message: string;
  /** Update the overlay message mid-batch (e.g. "Resetting week 2 of 6"). */
  setMessage: (message: string) => void;
  /**
   * Run work exclusively. If another action is already running, returns undefined
   * so double-clicks cannot stack (queuing would reorder money moves).
   */
  runExclusive: RunExclusive;
}

const FleetBusyContext = createContext<FleetBusyContextValue | null>(null);

export function useFleetBusy(): FleetBusyContextValue {
  const ctx = useContext(FleetBusyContext);
  if (!ctx) {
    // Outside provider — pass-through for tests/stories/shared children.
    return {
      busy: false,
      message: '',
      setMessage: () => {},
      runExclusive: async (_label, work) => work(),
    };
  }
  return ctx;
}

export function FleetBusyProvider({ children }: { children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessageState] = useState('');
  const depthRef = useRef(0);

  const setMessage = useCallback((next: string) => {
    setMessageState(next || 'Working…');
  }, []);

  const runExclusive = useCallback<RunExclusive>(async (label, work) => {
    if (depthRef.current > 0) {
      return undefined;
    }
    depthRef.current = 1;
    setMessageState(label || 'Working…');
    setBusy(true);
    try {
      return await work();
    } finally {
      depthRef.current = 0;
      setBusy(false);
      setMessageState('');
    }
  }, []);

  const value = useMemo(
    () => ({ busy, message, setMessage, runExclusive }),
    [busy, message, setMessage, runExclusive],
  );

  return (
    <FleetBusyContext.Provider value={value}>
      <div className="relative" aria-busy={busy || undefined}>
        {children}
        {busy && (
          <div
            className="fixed inset-0 z-[200] flex items-start justify-center bg-white/55 backdrop-blur-[1px] pt-[20vh]"
            role="status"
            aria-live="polite"
            aria-label={message || 'Working'}
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
    </FleetBusyContext.Provider>
  );
}
