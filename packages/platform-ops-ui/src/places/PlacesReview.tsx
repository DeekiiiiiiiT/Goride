import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Item = {
  id: string;
  place_id: string;
  kind: string;
  suggestion: string | null;
  distinct_users: number;
  best_accuracy_m: number | null;
  payload: { name?: string; kind?: string; pcode?: string; lat?: number; lng?: number };
  created_at: string;
};

type Coverage = { pcode: string; kind: string; verified_count: number; pending_count: number };

type View = 'queue' | 'item' | 'coverage';

function strong(item: Item): boolean {
  if (/strong/i.test(item.suggestion || '')) return true;
  return item.distinct_users >= 3 && item.best_accuracy_m != null && item.best_accuracy_m <= 25;
}

function pill(item: Item): { label: string; color: string } {
  const text = item.suggestion || 'Pending';
  if (/duplicate|merge/i.test(text)) return { label: text, color: '#ea580c' };
  if (strong(item)) return { label: text, color: '#16a34a' };
  if (/weak|check/i.test(text)) return { label: text, color: '#d97706' };
  return { label: text, color: '#57534e' };
}

function ageDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

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
  const [view, setView] = useState<View>('queue');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeId, setMergeId] = useState('');
  const [editName, setEditName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

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
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the queue');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => items.filter((item) => kind === 'all' || item.kind === kind || item.payload?.kind === kind),
    [items, kind],
  );
  const current = visible[Math.min(index, Math.max(visible.length - 1, 0))];
  const oldest = items.reduce((max, item) => Math.max(max, ageDays(item.created_at)), 0);
  const selectedItems = items.filter((item) => selected.includes(item.id));
  const bulkOk = selectedItems.length > 0 && selectedItems.every(strong);

  useEffect(() => {
    setEditName(current?.payload?.name || '');
    setShowMerge(false);
    setMergeId('');
  }, [current?.id]);

  const act = useCallback(async (action: 'approve' | 'reject' | 'merge', id = current?.id, name?: string) => {
    if (!id) return;
    const token = await getToken();
    const response = await fetch(`${apiBase}/admin/places/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        intoId: action === 'merge' ? mergeId : undefined,
        name: action === 'approve' ? name : undefined,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || 'Could not save that decision');
      return;
    }
    setShowMerge(false);
    setMergeId('');
    setSelected((prev) => prev.filter((value) => value !== id));
    setItems((prev) => prev.filter((item) => item.id !== id));
    setPending((value) => Math.max(0, value - 1));
  }, [apiBase, current?.id, getToken, mergeId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const key = event.key.toLowerCase();
      if (key === 'a') void act('approve', current?.id, editName);
      if (key === 'r') void act('reject');
      if (key === 'm') { setView('item'); setShowMerge(true); }
      if (key === 'e') { setView('item'); nameRef.current?.focus(); }
      if (key === 'n') setIndex((value) => Math.min(value + 1, Math.max(visible.length - 1, 0)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, current?.id, editName, visible.length]);

  const parishes = useMemo(() => {
    const map = new Map<string, Coverage[]>();
    for (const row of coverage) {
      const list = map.get(row.pcode) || [];
      list.push(row);
      map.set(row.pcode, list);
    }
    return [...map.entries()];
  }, [coverage]);

  if (loading) return <p className="p-6 text-sm text-slate-600">Loading the review queue…</p>;

  return (
    <div className="min-h-[720px] bg-slate-50 p-4 text-slate-900" style={{ fontFamily: 'Inter, sans-serif' }}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Places review</h2>
          <p className="text-sm text-slate-600">{pending} waiting · oldest {oldest} day{oldest === 1 ? '' : 's'}</p>
        </div>
        <div className="flex gap-2 text-sm">
          {(['queue', 'item', 'coverage'] as View[]).map((tab) => (
            <button key={tab} type="button" className={`min-h-10 rounded-md border px-3 ${view === tab ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white text-slate-600'}`} onClick={() => setView(tab)}>
              {tab === 'queue' ? 'Queue' : tab === 'item' ? 'This place' : 'Parish coverage'}
            </button>
          ))}
        </div>
      </header>
      {error ? <p className="mb-3 text-sm text-red-700" role="alert">{error}</p> : null}

      {view === 'queue' ? (
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
            <label className="text-sm" htmlFor="kind-filter">Type</label>
            <select id="kind-filter" className="min-h-10 rounded-md border border-slate-300 px-2" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="move">Move</option>
              <option value="merge">Merge</option>
              <option value="mechanic">Mechanic</option>
              <option value="parts">Parts</option>
            </select>
            <button
              type="button"
              disabled={!bulkOk}
              className="min-h-10 rounded-md px-3 text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: '#16a34a' }}
              onClick={() => { for (const item of selectedItems) void act('approve', item.id); }}
            >
              Approve {selectedItems.length} selected
            </button>
            <span className="text-xs text-slate-500">Bulk approve only when every selected place has strong evidence.</span>
          </div>
          {visible.length === 0 ? <p className="p-6 text-sm">Nothing is waiting.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Place</th>
                  <th className="px-3 py-2">Evidence</th>
                  <th className="px-3 py-2">Suggested</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item, itemIndex) => {
                  const tone = pill(item);
                  return (
                    <tr key={item.id} className={itemIndex === index ? 'bg-slate-50' : ''}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          aria-label={`Select ${item.payload?.name || 'place'}`}
                          onChange={(event) => setSelected((prev) => event.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" className="text-left" onClick={() => { setIndex(itemIndex); setView('item'); }}>
                          <span className="font-medium">{item.payload?.name || 'Unnamed place'}</span>
                          <span className="block text-xs text-slate-500">{item.payload?.pcode || item.kind}</span>
                        </button>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{item.distinct_users} people · {item.best_accuracy_m ?? '—'} m</td>
                      <td className="px-3 py-2"><span className="rounded px-2 py-1 text-xs font-semibold" style={{ color: tone.color, background: `${tone.color}14` }}>{tone.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {view === 'item' ? (
        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">Proposed pin</p>
            <p className="mt-2 text-sm text-slate-600">
              {current?.payload?.lat && current?.payload?.lng
                ? `${current.payload.lat}, ${current.payload.lng}`
                : 'This submission has no map point yet.'}
            </p>
            <a className="mt-3 inline-block text-sm text-blue-700" href={current?.payload?.lat ? `https://www.google.com/maps?q=${current.payload.lat},${current.payload.lng}` : undefined} target="_blank" rel="noreferrer">Street View</a>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            {!current ? <p>The queue is clear.</p> : (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase" style={{ color: pill(current).color }}>{pill(current).label}</p>
                <label className="block text-sm" htmlFor="place-name">Name</label>
                <input id="place-name" ref={nameRef} className="min-h-10 w-full rounded-md border border-slate-300 px-3" value={editName} onChange={(event) => setEditName(event.target.value)} />
                <p className="text-sm text-slate-600">{current.kind} · {current.distinct_users} people · best {current.best_accuracy_m ?? 'unknown'} m</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="min-h-10 rounded-md px-3 text-white" style={{ background: '#16a34a' }} onClick={() => void act('approve', current.id, editName)}>Approve (A)</button>
                  <button type="button" className="min-h-10 rounded-md px-3 text-white" style={{ background: '#ea580c' }} onClick={() => setShowMerge(true)}>Merge (M)</button>
                  <button type="button" className="min-h-10 rounded-md border border-slate-300 px-3" onClick={() => nameRef.current?.focus()}>Edit then approve (E)</button>
                  <button type="button" className="min-h-10 rounded-md px-3 text-white" style={{ background: '#dc2626' }} onClick={() => void act('reject')}>Reject (R)</button>
                  <button type="button" className="min-h-10 rounded-md border border-slate-300 px-3" onClick={() => setIndex((value) => Math.min(value + 1, visible.length - 1))}>Skip (N)</button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {view === 'coverage' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <p className="rounded-md border border-slate-200 p-3"><span className="block text-2xl font-semibold">{pending}</span><span className="text-sm text-slate-600">Waiting</span></p>
            <p className="rounded-md border border-slate-200 p-3"><span className="block text-2xl font-semibold">{oldest}</span><span className="text-sm text-slate-600">Oldest, in days</span></p>
          </div>
          {parishes.length === 0 ? <p className="text-sm text-slate-500">No parish counts yet.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr><th className="py-2">Parish</th><th>Kind</th><th>Verified</th><th>Pending</th></tr>
              </thead>
              <tbody>
                {parishes.flatMap(([pcode, rows]) => rows.map((row) => (
                  <tr key={`${pcode}-${row.kind}`} className="border-t border-slate-100">
                    <td className="py-2">{pcode}</td>
                    <td>{row.kind}</td>
                    <td>{row.verified_count}</td>
                    <td>{row.pending_count}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {showMerge && current ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <form className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onSubmit={(event) => { event.preventDefault(); void act('merge'); }}>
            <h3 className="text-lg font-semibold">Merge into an existing place</h3>
            <p className="mt-1 text-sm text-slate-600">{current.payload?.name || 'This place'} leaves the queue and its evidence moves onto the place you name.</p>
            <label className="mt-4 block text-sm" htmlFor="merge-into">Existing place id</label>
            <input id="merge-into" className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3" value={mergeId} onChange={(event) => setMergeId(event.target.value)} required />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="min-h-10 rounded-md border px-3" style={{ color: '#57534e' }} onClick={() => setShowMerge(false)}>Cancel</button>
              <button type="submit" className="min-h-10 rounded-md px-3 text-white" style={{ background: '#ea580c' }}>Merge (M)</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
