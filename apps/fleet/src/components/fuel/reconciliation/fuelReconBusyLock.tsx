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

interface FuelReconBusyContextValue {
  busy: boolean;
  message: string;
  runExclusive: RunExclusive;
}

const FuelReconBusyContext = createContext<FuelReconBusyContextValue | null>(null);

export function useFuelReconBusy(): FuelReconBusyContextValue {
  const ctx = useContext(FuelReconBusyContext);
  if (!ctx) {
    return {
      busy: false,
      message: '',
      runExclusive: async (_label, work) => work(),
    };
  }
  return ctx;
}

export function FuelReconBusyProvider({ children }: { children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const depthRef = useRef(0);

  const runExclusive = useCallback<RunExclusive>(async (label, work) => {
    if (depthRef.current > 0) return undefined;
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
    <FuelReconBusyContext.Provider value={value}>
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
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-md">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              <span className="text-sm font-medium text-slate-700">{message || 'Working…'}</span>
            </div>
          </div>
        )}
      </div>
    </FuelReconBusyContext.Provider>
  );
}
