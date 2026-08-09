import { useEffect } from 'react';

export type ScanFlashTone = 'ok' | 'match' | 'error';

type Props = {
  message: string | null;
  tone?: ScanFlashTone;
  onClear?: () => void;
  /** Auto-dismiss ms; 0 = sticky. Default 3200. */
  durationMs?: number;
};

const TONE_CLASS: Record<ScanFlashTone, string> = {
  ok: 'border-green-200 bg-green-50 text-green-900',
  match: 'border-sky-200 bg-sky-50 text-sky-900',
  error: 'border-red-200 bg-red-50 text-red-800',
};

/** Large floor status flash under the scan target. */
export function ScanStatusFlash({
  message,
  tone = 'ok',
  onClear,
  durationMs = 3200,
}: Props) {
  useEffect(() => {
    if (!message || !onClear || durationMs <= 0) return;
    const id = window.setTimeout(onClear, durationMs);
    return () => window.clearTimeout(id);
  }, [message, onClear, durationMs]);

  if (!message) return null;

  return (
    <div
      role="status"
      className={`rounded-xl border px-4 py-4 text-base font-semibold leading-snug ${TONE_CLASS[tone]}`}
    >
      {message}
    </div>
  );
}
