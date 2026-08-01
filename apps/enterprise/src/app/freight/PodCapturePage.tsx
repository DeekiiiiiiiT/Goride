import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { freightService } from '@/app/services/freightService';

/** Public client-fleet POD capture — no login. */
export function PodCapturePage() {
  const { token } = useParams();
  const [batchNumber, setBatchNumber] = useState('');
  const [status, setStatus] = useState('');
  const [stops, setStops] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    try {
      const res = await freightService.publicPod(token);
      setBatchNumber(res.batchNumber);
      setStatus(res.status);
      setStops(res.stops);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function deliver(packageId: string) {
    if (!token) return;
    setBusy(packageId);
    try {
      await freightService.publicPodDeliver(token, {
        packageId,
        podNote: 'Confirmed via POD link',
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-600">
            Roam Freight
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Delivery confirmation</h1>
          <p className="mt-1 text-sm text-slate-500">
            Batch {batchNumber || '…'} · {status || '…'}
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <ul className="space-y-3">
          {stops.map((s) => {
            const pkg = s.packages as Record<string, unknown> | null;
            const suite = pkg?.suites as { suite_code?: string } | null;
            const packageId = String(pkg?.id || '');
            const done = s.status === 'delivered';
            return (
              <li
                key={String(s.id)}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-sm font-medium">
                  Stop {String(s.stop_order)} · {suite?.suite_code || '—'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {String(pkg?.courier_tracking_number || packageId)} ·{' '}
                  {String(pkg?.description || '')}
                </p>
                <p className="mt-1 text-xs text-slate-500">{String(s.address || '')}</p>
                {done ? (
                  <p className="mt-3 text-sm font-medium text-emerald-700">Delivered</p>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void deliver(packageId)}
                    className="mt-3 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
                  >
                    {busy === packageId ? 'Saving…' : 'Confirm delivered'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
