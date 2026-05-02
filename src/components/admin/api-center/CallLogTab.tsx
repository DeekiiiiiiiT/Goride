/**
 * CallLogTab.tsx
 *
 * Paginated view of the recent `api_usage:*` rows with filter by provider,
 * status, and a free-text search across route / model / error.
 */

import React, { useState } from 'react';
import { Loader2, AlertCircle, Search, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { useApiLogs } from './hooks';
import type { CallLogRow } from './hooks';
import { PROVIDER_META, PROVIDER_ORDER, fmtDateTime, fmtNum, fmtUSD } from './providers';

export function CallLogTab() {
  const [provider, setProvider] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, error } = useApiLogs({ provider, status, q, limit: 200 });

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute inset-y-0 left-3 h-full w-3.5 text-slate-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search route, model, or error..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900/60 border border-slate-800 text-slate-200 text-xs rounded-lg focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <Filter className="w-3.5 h-3.5 text-slate-500" />
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="bg-slate-900/60 border border-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-500/50"
        >
          <option value="">All providers</option>
          {PROVIDER_ORDER.map((p) => (
            <option key={p} value={p}>{PROVIDER_META[p].label}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-slate-900/60 border border-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-500/50"
        >
          <option value="">Any status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{(error as Error).message}</span>
        </div>
      )}

      <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (data || []).length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-16">No calls match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/60 text-slate-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Time</th>
                  <th className="text-left font-medium px-4 py-2.5">Provider</th>
                  <th className="text-left font-medium px-4 py-2.5">Route</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-right font-medium px-4 py-2.5">Latency</th>
                  <th className="text-right font-medium px-4 py-2.5">Tokens</th>
                  <th className="text-right font-medium px-4 py-2.5">Cost</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {(data || []).map((row, idx) => (
                  <LogRow
                    key={`${row.timestamp}-${idx}`}
                    row={row}
                    expanded={expanded === `${row.timestamp}-${idx}`}
                    onToggle={() => setExpanded(expanded === `${row.timestamp}-${idx}` ? null : `${row.timestamp}-${idx}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function LogRow({ row, expanded, onToggle }: { row: CallLogRow; expanded: boolean; onToggle: () => void }) {
  const meta = PROVIDER_META[row.provider];
  const isError = row.status === 'error';
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors ${isError ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-slate-800/40'}`}
      >
        <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{fmtDateTime(row.timestamp)}</td>
        <td className="px-4 py-2.5">
          <span className={`inline-flex items-center gap-1.5 ${meta.color}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" /> {meta.label}
          </span>
        </td>
        <td className="px-4 py-2.5 font-mono text-slate-300 truncate max-w-[280px]">{row.route || '—'}</td>
        <td className="px-4 py-2.5">
          <span className={`inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded
            ${isError
              ? 'bg-red-500/10 text-red-300 border border-red-500/30'
              : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}
          `}>
            {row.status}{row.httpStatus ? ` ${row.httpStatus}` : ''}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right text-slate-400">{row.latencyMs != null ? `${row.latencyMs} ms` : '—'}</td>
        <td className="px-4 py-2.5 text-right text-slate-400">
          {row.inputTokens || row.outputTokens ? `${fmtNum((row.inputTokens || 0) + (row.outputTokens || 0))}` : '—'}
        </td>
        <td className="px-4 py-2.5 text-right text-amber-300 font-mono">{fmtUSD(row.costUSD)}</td>
        <td className="px-4 py-2.5 text-slate-500">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-950/50">
          <td colSpan={8} className="px-4 py-3 font-mono text-[11px] text-slate-400 space-y-1">
            <div><span className="text-slate-500">model</span>: {row.model || '—'}</div>
            <div><span className="text-slate-500">service</span>: {row.service || '—'}</div>
            <div><span className="text-slate-500">requestId</span>: {row.requestId || '—'}</div>
            {row.inputTokens != null && <div><span className="text-slate-500">inputTokens</span>: {row.inputTokens}</div>}
            {row.outputTokens != null && <div><span className="text-slate-500">outputTokens</span>: {row.outputTokens}</div>}
            {row.errorCode && <div className="text-red-300"><span className="text-slate-500">errorCode</span>: {row.errorCode}</div>}
            {row.errorMessage && <div className="text-red-300 whitespace-pre-wrap"><span className="text-slate-500">errorMessage</span>: {row.errorMessage}</div>}
          </td>
        </tr>
      )}
    </>
  );
}
