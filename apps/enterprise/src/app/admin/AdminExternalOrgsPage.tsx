import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { API_ENDPOINTS } from '@roam/api-client';

type ExtOrg = {
  id: string;
  name: string;
  business_type: string;
  contact_email: string | null;
  created_by_org_name?: string;
  created_at: string;
};

export function AdminExternalOrgsPage({ accessToken }: { accessToken: string }) {
  const [rows, setRows] = useState<ExtOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emailById, setEmailById] = useState<Record<string, string>>({});
  const [tempPw, setTempPw] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/enterprise-admin/external-orgs`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      setRows((json.organizations as ExtOrg[]) || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function convert(id: string) {
    const email = (emailById[id] || '').trim();
    setBusyId(id);
    setError(null);
    setTempPw(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/enterprise-admin/external-orgs/${id}/convert`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      setTempPw(json.temporaryPassword ? String(json.temporaryPassword) : null);
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
        <h2 className="text-lg font-semibold text-slate-900">Off-platform partners</h2>
        <p className="mt-1 text-sm text-slate-500">
          Placeholder companies added by customers. Invite them onto Roam when they are ready.
        </p>
      </div>
      {tempPw ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Login created. Temporary password: <span className="font-mono font-semibold">{tempPw}</span>
        </p>
      ) : null}
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
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Added by</th>
                <th className="px-4 py-2">Invite onto Roam</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No off-platform partners yet.
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.business_type === 'warehouse' ? 'Freight forwarder' : 'Courier'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{r.created_by_org_name || '—'}</td>
                  <td className="px-4 py-2.5">
                    <form
                      className="flex flex-wrap gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void convert(r.id);
                      }}
                    >
                      <input
                        type="email"
                        required
                        placeholder={r.contact_email || 'Login email'}
                        value={emailById[r.id] ?? r.contact_email ?? ''}
                        onChange={(e) =>
                          setEmailById((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        className="min-w-[180px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={busyId === r.id}
                        className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {busyId === r.id ? 'Creating…' : 'Create login'}
                      </button>
                    </form>
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
