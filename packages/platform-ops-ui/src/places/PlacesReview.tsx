import { useCallback, useEffect, useRef, useState } from 'react';

type Item = {
  id: string;
  place_id: string;
  kind: string;
  suggestion: string | null;
  distinct_users: number;
  best_accuracy_m: number | null;
  payload: { name?: string; kind?: string };
  created_at: string;
};

type Coverage = { pcode: string; kind: string; verified_count: number; pending_count: number };

export function PlacesReview({
  apiBase,
  getToken,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [pending, setPending] = useState(0);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mergeId, setMergeId] = useState('');
  const [showMerge, setShowMerge] = useState(false);

  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await tokenRef.current();
      if (!token) throw new Error('Sign in to Dominion first');
      const headers = { Authorization: `Bearer ${token}` };
      const [queue, cover] = await Promise.all([
        fetch(`${apiBase}/admin/places`, { headers }),
        fetch(`${apiBase}/admin/coverage`, { headers }),
      ]);
      const queueBody = await queue.json();
      const coverBody = await cover.json();
      if (!queue.ok) throw new Error(queueBody.error || 'Could not load the queue');
      setItems(queueBody.items || []);
      setCoverage(coverBody.coverage || []);
      setPending(coverBody.pending || 0);
      setIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the queue');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);

  const current = items[index];

  const act = useCallback(async (action: 'approve' | 'reject' | 'merge') => {
    if (!current) return;
    const token = await getToken();
    const response = await fetch(`${apiBase}/admin/places/${current.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, intoId: action === 'merge' ? mergeId : undefined }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || 'Could not save that decision');
      return;
    }
    setShowMerge(false);
    setMergeId('');
    setItems((prev) => prev.filter((item) => item.id !== current.id));
  }, [apiBase, current, getToken, mergeId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key === 'a') void act('approve');
      if (event.key === 'r') void act('reject');
      if (event.key === 'm') setShowMerge(true);
      if (event.key === 'n') setIndex((value) => Math.min(value + 1, Math.max(items.length - 1, 0)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, items.length]);

  if (loading) return <p className="p-6 text-sm">Loading the review queue…</p>;
  if (error) return <p className="p-6 text-sm text-red-700" role="alert">{error}</p>;

  return (
    <div className="grid min-h-[640px] gap-4 p-4 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3">
        <h2 className="text-lg font-semibold">Places review</h2>
        <p className="text-sm text-slate-600">{pending} waiting. Keys: A approve, R reject, M merge, N next.</p>
        {items.length === 0 ? <p className="text-sm">Nothing is waiting.</p> : null}
        <ul className="space-y-2">
          {items.map((item, itemIndex) => (
            <li key={item.id}>
              <button
                type="button"
                className={`min-h-12 w-full rounded-lg border px-3 text-left text-sm ${itemIndex === index ? 'border-orange-600 bg-orange-50' : 'border-slate-200'}`}
                onClick={() => setIndex(itemIndex)}
              >
                <span className="font-medium">{item.payload?.name || 'Unnamed place'}</span>
                <span className="block text-xs text-slate-500">{item.suggestion || item.kind}</span>
              </button>
            </li>
          ))}
        </ul>
        <h3 className="pt-4 text-sm font-semibold">Coverage by parish</h3>
        {coverage.length === 0 ? <p className="text-sm text-slate-500">No parish counts yet.</p> : (
          <ul className="space-y-1 text-sm">
            {coverage.map((row) => (
              <li key={`${row.pcode}-${row.kind}`}>{row.pcode} · {row.kind}: {row.verified_count} verified, {row.pending_count} waiting</li>
            ))}
          </ul>
        )}
      </aside>
      <section className="rounded-xl border border-slate-200 p-4">
        {!current ? <p>Pick an item, or the queue is clear.</p> : (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">{current.payload?.name || 'Unnamed place'}</h3>
            <p className="text-sm">{current.suggestion || 'Needs a look'}</p>
            <p className="text-sm text-slate-600">{current.distinct_users} people · best accuracy {current.best_accuracy_m ?? 'unknown'} m</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="min-h-12 rounded-lg bg-green-700 px-4 text-white" onClick={() => void act('approve')}>Approve</button>
              <button type="button" className="min-h-12 rounded-lg bg-red-700 px-4 text-white" onClick={() => void act('reject')}>Reject</button>
              <button type="button" className="min-h-12 rounded-lg bg-orange-600 px-4 text-white" onClick={() => setShowMerge(true)}>Merge</button>
            </div>
            {showMerge ? (
              <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void act('merge'); }}>
                <label className="block text-sm" htmlFor="merge-into">Existing place id</label>
                <input id="merge-into" className="min-h-12 w-full rounded-lg border px-3" value={mergeId} onChange={(event) => setMergeId(event.target.value)} />
                <button type="submit" className="min-h-12 rounded-lg border border-orange-600 px-4">Merge into that place</button>
              </form>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
