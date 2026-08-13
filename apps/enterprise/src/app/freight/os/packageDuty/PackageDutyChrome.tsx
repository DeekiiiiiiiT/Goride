import { useState } from 'react';
import { Link } from 'react-router-dom';
import { minorToUsd } from './usePackageDutyDetail';

type Suite = {
  suite_code?: string;
  contact_name?: string;
  trn?: string;
  trn_valid?: boolean;
};

type Props = {
  packageId: string;
  pkgOptions: Record<string, unknown>[];
  pkg: Record<string, unknown> | undefined;
  onSelect: (id: string) => void;
};

export function PackageDutyChrome({ packageId, pkgOptions, pkg, onSelect }: Props) {
  return (
    <div className="space-y-3">
      <Link to="/app/packages" className="text-sm text-slate-500 hover:underline">
        ← Packages
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label className="text-xs font-medium text-slate-500">Package</label>
          <select
            value={packageId}
            onChange={(e) => onSelect(e.target.value)}
            className="mt-1 w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          >
            {pkgOptions.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {String(p.courier_tracking_number || 'No tracking yet')} · {String(p.status)}
              </option>
            ))}
          </select>
        </div>
        {pkg && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-700">
            {String(pkg.status).replace(/_/g, ' ')}
          </span>
        )}
      </div>
    </div>
  );
}

export function PackageSummaryPanel({
  pkg,
  suite,
  onSaveTracking,
  savingTracking,
}: {
  pkg: Record<string, unknown>;
  suite?: Suite;
  onSaveTracking?: (tracking: string) => void;
  savingTracking?: boolean;
}) {
  const current = String(pkg.courier_tracking_number ?? '');
  const [tracking, setTracking] = useState(current);

  return (
    <div className="space-y-4">
      {onSaveTracking ? (
        <label className="block text-sm font-medium text-slate-800">
          Tracking # <span className="font-normal text-slate-500">(add later is fine)</span>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Paste TBA / 1Z when you have it"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-3 font-mono text-sm"
            />
            <button
              type="button"
              disabled={savingTracking || tracking.trim() === current.trim()}
              onClick={() => onSaveTracking(tracking.trim())}
              className="min-h-11 rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
            >
              {savingTracking ? 'Saving…' : current ? 'Update' : 'Save tracking'}
            </button>
          </div>
        </label>
      ) : null}
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <dt className="text-slate-500">Suite</dt>
        <dd className="font-medium">{suite?.suite_code ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-slate-500">Contact</dt>
        <dd className="font-medium">{suite?.contact_name ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-slate-500">TRN</dt>
        <dd className="font-mono">
          {suite?.trn ?? '—'}{' '}
          {suite?.trn_valid === false && (
            <span className="text-xs font-sans text-red-600">invalid</span>
          )}
        </dd>
      </div>
      <div>
        <dt className="text-slate-500">Weight</dt>
        <dd className="tabular-nums">
          {pkg.weight_lbs != null ? `${pkg.weight_lbs} lb` : '—'}
        </dd>
      </div>
      <div>
        <dt className="text-slate-500">Declared</dt>
        <dd className="tabular-nums">
          US${minorToUsd(pkg.declared_value_usd_minor).toFixed(2)}
        </dd>
      </div>
      <div>
        <dt className="text-slate-500">Bin</dt>
        <dd className="font-mono">{String(pkg.bin_location ?? '—')}</dd>
      </div>
    </dl>
    </div>
  );
}
