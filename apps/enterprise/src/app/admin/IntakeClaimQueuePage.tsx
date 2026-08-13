import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { API_ENDPOINTS } from '@roam/api-client';

type ClaimRow = {
  id: string;
  organization_id: string;
  organization_name?: string;
  kind: 'join' | 'claim_edit' | 'new_listing';
  catalog_id: string | null;
  proposed_name: string;
  proposed_address_line: string;
  proposed_city: string;
  proposed_state: string;
  proposed_postal_code: string;
  proposed_country_code: string;
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  created_at: string;
};

function kindLabel(kind: ClaimRow['kind']) {
  if (kind === 'join') return 'Join';
  if (kind === 'new_listing') return 'New company';
  return 'Correction';
}

function formatAddress(r: ClaimRow) {
  return [
    r.proposed_address_line,
    [r.proposed_city, r.proposed_state, r.proposed_postal_code].filter(Boolean).join(', '),
    (r.proposed_country_code || '').toUpperCase(),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function IntakeClaimQueuePage({ accessToken }: { accessToken: string }) {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === 'pending' ? '?status=pending' : '';
      const res = await fetch(`${API_ENDPOINTS.admin}/enterprise-admin/intake-claims${qs}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      setRows((json.requests as ClaimRow[]) || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(
        `${API_ENDPOINTS.admin}/enterprise-admin/intake-claims/${id}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ note: notes[id] || '' }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Join requests</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Companies waiting to operate a warehouse. Approve a join to let them scan. Corrections
            update the master listing. New companies are added to Buildings.
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'pending' | 'all')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="all">All</option>
        </select>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{r.proposed_name}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{formatAddress(r)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {r.organization_name || r.organization_id.slice(0, 8)} · {kindLabel(r.kind)} ·{' '}
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={
                      r.status === 'pending'
                        ? 'rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800'
                        : r.status === 'approved'
                          ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                          : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600'
                    }
                  >
                    {r.status}
                  </span>
                </div>
                {r.status === 'pending' ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="block flex-1 text-sm text-slate-600">
                      Note (optional)
                      <input
                        value={notes[r.id] || ''}
                        onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Shown if you reject"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void act(r.id, 'approve')}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busyId === r.id ? 'Working…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void act(r.id, 'reject')}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : r.review_note ? (
                  <p className="mt-2 text-sm text-slate-500">{r.review_note}</p>
                ) : null}
              </li>
            ))}
            {!rows.length ? (
              <li className="px-5 py-10 text-center text-sm text-slate-500">
                {filter === 'pending' ? 'No pending requests.' : 'No requests yet.'}
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}
