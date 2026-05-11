/**
 * KeysTab.tsx
 *
 * Masked API-key listing + rotation modal. Rotation sends the new key through
 * the server, which validates it with the provider and then upserts the
 * Supabase Edge Function secret via the Management API.
 */

import React, { useState } from 'react';
import { Loader2, KeyRound, RotateCcw, CheckCircle2, AlertCircle, X, Info } from 'lucide-react';
import { useApiKeys, useRotateKey } from './hooks';
import type { ApiKeyMeta, Provider } from './hooks';
import { PROVIDER_META, fmtDateTime } from './providers';

export function KeysTab() {
  const { data, isLoading, error } = useApiKeys();
  const [rotating, setRotating] = useState<ApiKeyMeta | null>(null);

  return (
    <div className="space-y-5">
      <InfoStrip />

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{(error as Error).message}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {(data || []).map((row) => (
            <KeyCard key={row.provider} row={row} onRotate={() => setRotating(row)} />
          ))}
        </div>
      )}

      {rotating && (
        <RotateModal
          target={rotating}
          onClose={() => setRotating(null)}
        />
      )}
    </div>
  );
}

function InfoStrip() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm text-slate-400">
      <Info className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
      <p>
        Keys are stored as Supabase Edge Function secrets. The command center validates new keys with the provider before
        calling the Supabase Management API to rotate them. Live edge workers pick up the new secret on the next cold start
        (seconds to a minute).
      </p>
    </div>
  );
}

function KeyCard({ row, onRotate }: { row: ApiKeyMeta; onRotate: () => void }) {
  const meta = PROVIDER_META[row.provider];
  const Icon = meta.icon;
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="bg-slate-800/80 p-2 rounded-lg shrink-0">
            <Icon className={`w-4 h-4 ${meta.color}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white truncate">{meta.label}</h3>
              {row.configured ? (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-semibold">
                  <CheckCircle2 className="w-3 h-3" /> Set
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider bg-red-500/10 text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded font-semibold">
                  Missing
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-mono mt-1 truncate">{row.envVarName}</p>
          </div>
        </div>
        <button
          onClick={onRotate}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Rotate
        </button>
      </div>

      <div className="mt-3 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-400">
        {row.maskedKey || '—'}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Last rotated</div>
          <div className="text-slate-300 mt-0.5">{fmtDateTime(row.lastRotatedAt || undefined)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">By</div>
          <div className="text-slate-300 mt-0.5 truncate">{row.lastRotatedBy || '—'}</div>
        </div>
      </div>
    </div>
  );
}

function RotateModal({ target, onClose }: { target: ApiKeyMeta; onClose: () => void }) {
  const rotate = useRotateKey();
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');

  const canSubmit = value.trim().length > 8 && confirm === 'ROTATE';

  const handleSubmit = async () => {
    try {
      await rotate.mutateAsync({ provider: target.provider as Provider, newKey: value.trim(), reason });
      onClose();
    } catch {
      // error surfaced via rotate.error
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold">Rotate {PROVIDER_META[target.provider].label} key</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-400">
            The new key is validated with {PROVIDER_META[target.provider].label} before we upsert it as a Supabase
            secret via the Management API. The plaintext is never stored in your database — only a SHA-256 hash and
            masked tail for audit.
          </p>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">New key</label>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-slate-900/60 border border-slate-800 text-slate-200 font-mono text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Scheduled rotation, exposure suspicion, ..."
              className="w-full bg-slate-900/60 border border-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Type <span className="text-amber-300 font-mono">ROTATE</span> to confirm
            </label>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.toUpperCase())}
              className="w-full bg-slate-900/60 border border-slate-800 text-slate-200 font-mono text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {rotate.error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-3 py-2 text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{(rotate.error as Error).message}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-800">
          <button
            onClick={onClose}
            disabled={rotate.isPending}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || rotate.isPending}
            className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {rotate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            {rotate.isPending ? 'Rotating...' : 'Rotate key'}
          </button>
        </div>
      </div>
    </div>
  );
}
