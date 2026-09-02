import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '../../lib/partner-supabase';

type MerchantSupportCase = {
  id: string;
  subject: string;
  status: string;
  priority?: string;
  order_id?: string;
  fault_attribution?: string;
  merchant_contested?: boolean;
  created_at: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in required');
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

export default function MerchantIssuesInbox() {
  const [cases, setCases] = useState<MerchantSupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [contestId, setContestId] = useState<string | null>(null);
  const [contestNotes, setContestNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/support/cases`, { headers });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as { cases: MerchantSupportCase[] };
      setCases(data.cases ?? []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitContest = async (caseId: string) => {
    if (contestNotes.trim().length < 8) {
      toast.error('Please explain your contest (min 8 characters)');
      return;
    }
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/support/cases/${caseId}/contest`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ notes: contestNotes.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Contest failed');
      toast.success('Contest submitted for review');
      setContestId(null);
      setContestNotes('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Contest failed');
    }
  };

  return (
    <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
      <div className="mb-inset-md flex items-center gap-inset-sm">
        <MaterialIcon name="report" className="text-primary" />
        <h3 className="text-headline-md text-on-surface">Customer issues</h3>
      </div>
      {loading ? (
        <p className="text-body-sm text-on-surface-variant">Loading…</p>
      ) : cases.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">No customer issues on your orders.</p>
      ) : (
        <ul className="space-y-inset-sm">
          {cases.map((item) => (
            <li key={item.id} className="rounded-lg border border-outline-variant p-inset-sm">
              <p className="text-body-md font-medium text-on-surface">{item.subject}</p>
              <p className="text-body-sm text-on-surface-variant capitalize">
                {item.status.replace(/_/g, ' ')}
                {item.fault_attribution ? ` · ${item.fault_attribution.replace(/_/g, ' ')}` : ''}
              </p>
              {!item.merchant_contested && item.status !== 'closed' ? (
                contestId === item.id ? (
                  <div className="mt-inset-sm space-y-inset-xs">
                    <textarea
                      value={contestNotes}
                      onChange={(e) => setContestNotes(e.target.value)}
                      placeholder="Why are you contesting this?"
                      className="w-full rounded-lg border border-outline-variant p-inset-sm text-body-sm min-h-[80px]"
                    />
                    <div className="flex gap-inset-sm">
                      <button
                        type="button"
                        onClick={() => void submitContest(item.id)}
                        className="text-label-md text-primary font-semibold"
                      >
                        Submit contest
                      </button>
                      <button type="button" onClick={() => setContestId(null)} className="text-label-md text-on-surface-variant">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setContestId(item.id)}
                    className="mt-inset-xs text-label-md text-primary font-semibold"
                  >
                    Contest
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
