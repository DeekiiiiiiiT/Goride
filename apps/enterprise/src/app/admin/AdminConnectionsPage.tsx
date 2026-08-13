import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { API_ENDPOINTS } from '@roam/api-client';

type LinkRow = {
  id: string;
  status: string;
  initiated_by: string;
  is_self?: boolean;
  warehouse_org?: { id: string; name: string; is_external?: boolean } | null;
  courier_org?: { id: string; name: string; is_external?: boolean } | null;
};

export function AdminConnectionsPage({ accessToken }: { accessToken: string }) {
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/enterprise-admin/links`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      setRows((json.links as LinkRow[]) || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: 'active' | 'paused' | 'revoked') {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/enterprise-admin/links/${id}/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
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
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Connections</h2>
        <p className="mt-1 text-sm text-slate-500">
          Every freight forwarder ↔ courier partnership, including off-platform partners.
        </p>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Freight forwarder</th>
                <th className="px-4 py-2">Courier</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No connections yet.
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">
                    {r.is_self ? 'In-house' : r.warehouse_org?.name || '—'}
                    {r.warehouse_org?.is_external ? (
                      <span className="ml-2 text-xs text-slate-500">off-platform</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.is_self ? 'Same company' : r.courier_org?.name || '—'}
                    {r.courier_org?.is_external ? (
                      <span className="ml-2 text-xs text-slate-500">off-platform</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 capitalize">{r.status}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {r.status !== 'active' && !r.is_self ? (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void setStatus(r.id, 'active')}
                          className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white"
                        >
                          Activate
                        </button>
                      ) : null}
                      {r.status === 'active' && !r.is_self ? (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void setStatus(r.id, 'paused')}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          Pause
                        </button>
                      ) : null}
                      {r.status !== 'revoked' && !r.is_self ? (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void setStatus(r.id, 'revoked')}
                          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700"
                        >
                          Revoke
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
