// Stitch: dominion-redesign/19c9df8ede1f4635be7f188be5c24f94
// Stitch: dominion-redesign/6348f0f2c36149fa9bb2cc9e8fa39577
// Stitch: dominion-redesign/a87e5505779043e2a48a64a6f6266d2e
// Stitch: dominion-redesign/7da088e95e1e4fe088a2add010bf9bd3
// Stitch: dominion-redesign/53ad2876cac241b1aaceeb7bbc307045
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PLACE_KINDS, placeKind } from '@roam/plug-core';

type Item = {
  id: string;
  place_id: string;
  kind: string;
  suggestion: string | null;
  distinct_users: number;
  best_accuracy_m: number | null;
  payload: {
    name?: string;
    kind?: string;
    pcode?: string;
    lat?: number;
    lng?: number;
    phone?: string | null;
    hours?: string | null;
    services?: string[];
    brand?: string | null;
    accuracyM?: number;
    photoUrl?: string | null;
  };
  created_at: string;
};

type Coverage = { pcode: string; kind: string; verified_count: number; pending_count: number };

type View = 'queue' | 'item' | 'coverage' | 'parishes';

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
  const [parish, setParish] = useState('all');
  const [query, setQuery] = useState('');
  const [evidence, setEvidence] = useState('all');
  const [age, setAge] = useState('all');
  const [sort, setSort] = useState('evidence');
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

  const parishCodes = useMemo(
    () => [...new Set(items.map((item) => item.payload?.pcode).filter((code): code is string => !!code))].sort(),
    [items],
  );
  const visible = useMemo(() => {
    const filtered = items.filter((item) => {
      if (kind !== 'all' && item.kind !== kind && item.payload?.kind !== kind) return false;
      if (parish !== 'all' && item.payload?.pcode !== parish) return false;
      if (evidence === 'strong' && !strong(item)) return false;
      if (evidence === 'weak' && !/weak|check/i.test(item.suggestion || '')) return false;
      const days = ageDays(item.created_at);
      if (age === 'day' && days >= 1) return false;
      if (age === 'few' && (days < 1 || days > 3)) return false;
      if (age === 'old' && days <= 3) return false;
      if (!query.trim()) return true;
      const hay = `${item.payload?.name || ''} ${item.payload?.pcode || ''}`.toLowerCase();
      return hay.includes(query.trim().toLowerCase());
    });
    return filtered.sort((a, b) => {
      if (sort === 'newest') return b.created_at.localeCompare(a.created_at);
      if (sort === 'oldest') return a.created_at.localeCompare(b.created_at);
      if (sort === 'parish') return (a.payload?.pcode || '').localeCompare(b.payload?.pcode || '');
      return Number(strong(b)) - Number(strong(a));
    });
  }, [items, kind, parish, query, evidence, age, sort]);
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
  const parishTotals = useMemo(() => parishes.map(([pcode, rows]) => ({
    pcode,
    rows,
    verified: rows.reduce((sum, row) => sum + Number(row.verified_count || 0), 0),
    waiting: rows.reduce((sum, row) => sum + Number(row.pending_count || 0), 0),
  })).sort((a, b) => b.verified - a.verified), [parishes]);
  const verifiedTotal = parishTotals.reduce((sum, row) => sum + row.verified, 0);
  const maxVerified = parishTotals.reduce((max, row) => Math.max(max, row.verified), 0);

  if (loading) return <p className="p-6 text-sm text-[#64748b]">Loading the review queue…</p>;

  const when = (iso?: string) => {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  };

  return (
    <div className="min-h-[720px] bg-[#f8fafc] text-[#0f172a]">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-[#64748b]">Dominion / Places / {view === 'queue' ? 'Review queue' : view === 'item' ? 'This place' : view === 'coverage' ? 'Coverage' : 'Parish table'}</p>
          <div className="mt-1 flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">
              {view === 'parishes' ? 'Parish infrastructure coverage' : view === 'coverage' ? 'Coverage by parish' : 'Places review'}
            </h2>
            <span className="rounded border border-[#e7e5e4] bg-[#f5f5f4] px-2 py-0.5 text-xs font-semibold text-[#57534e]">{pending} waiting</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded border border-[#e2e8f0] bg-white px-2 py-1 text-xs">Queue <strong>{pending} waiting</strong></span>
          <span className="rounded border border-[#e2e8f0] bg-white px-2 py-1 text-xs">Oldest <strong>{oldest} day{oldest === 1 ? '' : 's'}</strong></span>
          <button type="button" className="h-8 rounded border border-[#e2e8f0] bg-white px-2 text-xs" onClick={() => void load()}>Refresh</button>
          {(['queue', 'item', 'coverage', 'parishes'] as View[]).map((tab) => (
            <button key={tab} type="button" className={`h-8 rounded border px-3 text-xs ${view === tab ? 'border-[#316bf3] bg-[#316bf3] text-white' : 'border-[#e2e8f0] bg-white text-[#475569]'}`} onClick={() => setView(tab)}>
              {tab === 'queue' ? 'Review queue' : tab === 'item' ? 'This place' : tab === 'coverage' ? 'Coverage' : 'Parish table'}
            </button>
          ))}
        </div>
      </header>
      {error ? <p className="mb-3 text-sm text-red-700" role="alert">{error}</p> : null}

      {view === 'queue' ? (
        <section className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-[#ffffff]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#e2e8f0] px-3 py-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name" className="h-8 w-40 rounded border border-[#e2e8f0] px-2 text-xs" />
            <select aria-label="Parish" className="h-8 rounded border border-[#e2e8f0] px-2 text-xs" value={parish} onChange={(event) => setParish(event.target.value)}>
              <option value="all">All parishes</option>
              {parishCodes.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <select aria-label="Type" className="h-8 rounded border border-[#e2e8f0] px-2 text-xs" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="all">All types</option>
              {PLACE_KINDS.map((kindOption) => <option key={kindOption.id} value={kindOption.id}>{kindOption.mapLabel}</option>)}
            </select>
            <select aria-label="Evidence" className="h-8 rounded border border-[#e2e8f0] px-2 text-xs" value={evidence} onChange={(event) => setEvidence(event.target.value)}>
              <option value="all">All evidence</option>
              <option value="strong">Strong</option>
              <option value="weak">Weak</option>
            </select>
            <select aria-label="Age" className="h-8 rounded border border-[#e2e8f0] px-2 text-xs" value={age} onChange={(event) => setAge(event.target.value)}>
              <option value="all">All ages</option>
              <option value="day">Under 24 hours</option>
              <option value="few">1–3 days</option>
              <option value="old">Older than 3 days</option>
            </select>
            <label className="text-[10px] uppercase text-[#64748b]">Sort
              <select className="ml-1 h-8 rounded border border-[#cbd5e1] px-2 text-xs font-semibold" value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="evidence">Strongest evidence first</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest waiting</option>
                <option value="parish">Parish</option>
              </select>
            </label>
            <button type="button" className="ml-auto text-xs text-[#316bf3] underline" onClick={() => { setParish('all'); setKind('all'); setEvidence('all'); setAge('all'); setSort('evidence'); setQuery(''); }}>Reset</button>
          </div>
          {visible.length === 0 ? <p className="p-8 text-center text-sm text-[#64748b]">The data is not in yet.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f8fafc] text-[11px] uppercase tracking-wider text-[#64748b]">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Place name and type</th>
                  <th className="px-3 py-2">Parish</th>
                  <th className="px-3 py-2">Evidence</th>
                  <th className="px-3 py-2">Suggested recommendation</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item, itemIndex) => {
                  const tone = pill(item);
                  const duplicate = /duplicate|merge/i.test(item.suggestion || '');
                  return (
                    <tr key={item.id} className={`border-t border-[#f1f5f9] ${itemIndex === index ? 'bg-[#f8fafc]' : ''}`}>
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={selected.includes(item.id)} aria-label={`Select ${item.payload?.name || 'place'}`} onChange={(event) => setSelected((prev) => event.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id))} />
                      </td>
                      <td className="px-3 py-3">
                        <button type="button" className="text-left" onClick={() => { setIndex(itemIndex); setView('item'); }}>
                          <span className="font-semibold">{item.payload?.name || 'Unnamed place'}</span>
                          <span className="block text-xs text-[#64748b]">{placeKind(item.payload?.kind)?.mapLabel || item.payload?.kind || item.kind}</span>
                        </button>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{item.payload?.pcode || '—'}</td>
                      <td className="px-3 py-3 text-[#475569]">{item.distinct_users} reports · {item.best_accuracy_m ?? '—'} m</td>
                      <td className="px-3 py-3"><span className="rounded px-2 py-1 text-xs font-semibold" style={{ color: tone.color, background: `${tone.color}14` }}>{tone.label}</span></td>
                      <td className="px-3 py-3 text-xs text-[#64748b]">{when(item.created_at)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <button type="button" className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs" onClick={() => { setIndex(itemIndex); setView('item'); }}>Review</button>
                          <button type="button" className="rounded-md px-2 py-1 text-xs text-white" style={{ background: '#15803d' }} onClick={() => void act('approve', item.id, item.payload?.name)}>Approve</button>
                          {duplicate ? <button type="button" className="rounded-md px-2 py-1 text-xs text-white" style={{ background: '#ea580c' }} onClick={() => { setIndex(itemIndex); setView('item'); setShowMerge(true); }}>Merge</button> : null}
                          <button type="button" className="rounded-md px-2 py-1 text-xs text-white" style={{ background: '#b91c1c' }} onClick={() => void act('reject', item.id)}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#e2e8f0] px-4 py-3 text-sm">
            <span className="text-[#64748b]">{selected.length === 0 ? 'None selected' : `${selected.length} selected`}</span>
            <button type="button" disabled={!bulkOk} className="rounded-lg px-3 py-1.5 text-white disabled:opacity-40" style={{ background: '#15803d' }} onClick={() => { for (const item of selectedItems) void act('approve', item.id, item.payload?.name); }}>
              Approve selected
            </button>
            <button type="button" className="text-[#64748b]" onClick={() => setSelected([])}>Clear</button>
            <span className="text-xs text-[#94a3b8]">Approve selected only when every row has strong evidence.</span>
          </div>
        </section>
      ) : null}

      {view === 'item' && !current ? (
        <section className="grid min-h-[560px] overflow-hidden rounded-xl border border-[#e2e8f0] bg-white lg:grid-cols-[1.4fr_1fr]">
          <div className="flex items-center justify-center bg-[#e2e8f0] text-sm text-[#475569]">No pin is waiting.</div>
          <div className="flex items-center p-6 text-sm text-[#64748b]">The queue is clear.</div>
        </section>
      ) : null}
      {view === 'item' && current ? (
        <section className="grid min-h-[640px] overflow-hidden rounded-xl border border-[#e2e8f0] bg-white lg:grid-cols-[1.4fr_1fr]">
          <div className="relative min-h-[420px] bg-[#e2e8f0]">
            {current.payload?.lat != null && current.payload?.lng != null ? (
              <iframe
                title="Proposed pin"
                className="h-full min-h-[420px] w-full border-0"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(current.payload.lng) - 0.02}%2C${Number(current.payload.lat) - 0.02}%2C${Number(current.payload.lng) + 0.02}%2C${Number(current.payload.lat) + 0.02}&layer=mapnik&marker=${current.payload.lat}%2C${current.payload.lng}`}
              />
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-[#475569]">This submission has no map point yet.</div>
            )}
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded border border-[#cbd5e1] bg-white/95 px-3 py-2 text-xs">
              <span className="font-mono">{current.payload?.lat != null ? `${current.payload.lat}, ${current.payload.lng}` : 'No coordinates'}</span>
              <span>{current.distinct_users} reports · {current.best_accuracy_m ?? current.payload?.accuracyM ?? '—'} m</span>
              {current.payload?.lat != null ? (
                <a className="font-semibold text-[#0284c7]" href={`https://www.google.com/maps?q=${current.payload.lat},${current.payload.lng}`} target="_blank" rel="noreferrer">Launch Street View</a>
              ) : null}
            </div>
          </div>
          <div className="space-y-4 overflow-y-auto p-5">
            <div className="rounded border border-[#bbf7d0] bg-[#f0fdf4] p-4">
              <p className="font-semibold text-[#15803d]">Suggested decision: {pill(current).label}</p>
              <p className="mt-1 text-sm text-[#166534]">{current.distinct_users} reports · best {current.best_accuracy_m ?? '—'} m</p>
            </div>
            <div className="rounded border border-[#e2e8f0] p-4">
              <h3 className="text-sm font-semibold">Place identity</h3>
              <p className="mt-2 text-xs uppercase text-[#64748b]">{placeKind(current.payload?.kind)?.mapLabel || current.payload?.kind || current.kind}</p>
              {current.payload?.brand ? <p className="mt-2 text-sm">Brand {current.payload.brand}</p> : null}
              {current.payload?.phone ? <p className="mt-2 text-sm">Phone {current.payload.phone}</p> : null}
              {current.payload?.hours ? <p className="mt-1 text-sm">Hours {current.payload.hours}</p> : null}
              {current.payload?.services?.length ? <p className="mt-2 text-sm">{current.payload.services.join(', ')}</p> : null}
              {current.payload?.photoUrl ? <img src={current.payload.photoUrl} alt="" className="mt-3 max-h-48 rounded-md" /> : null}
              <label className="mt-3 block text-sm" htmlFor="place-name">Name</label>
                <input id="place-name" ref={nameRef} className="min-h-10 w-full rounded-lg border border-[#e2e8f0] px-3" value={editName} onChange={(event) => setEditName(event.target.value)} />
                <p className="font-mono text-xs text-[#64748b]">{current.payload?.pcode || '—'} · {current.distinct_users} reports · {current.best_accuracy_m ?? '—'} m</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button type="button" className="min-h-10 rounded-lg px-3 text-sm text-white" style={{ background: '#15803d' }} onClick={() => void act('approve', current.id, editName)}>Approve</button>
                  <button type="button" className="min-h-10 rounded-lg px-3 text-sm text-white" style={{ background: '#ea580c' }} onClick={() => setShowMerge(true)}>Merge</button>
                  <button type="button" className="min-h-10 rounded-lg px-3 text-sm text-white" style={{ background: '#b91c1c' }} onClick={() => void act('reject')}>Reject</button>
                  <button type="button" className="min-h-10 rounded-lg border border-[#e2e8f0] px-3 text-sm" onClick={() => setIndex((value) => Math.min(value + 1, Math.max(visible.length - 1, 0)))}>Next</button>
                </div>
              </div>
          </div>
        </section>
      ) : null}

      {view === 'coverage' ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <p className="rounded-xl border border-[#e2e8f0] bg-white p-4"><span className="text-[11px] uppercase tracking-wider text-[#64748b]">Waiting in queue</span><span className="mt-2 block font-mono text-2xl font-bold">{pending}</span></p>
            <p className="rounded-xl border border-[#e2e8f0] bg-white p-4"><span className="text-[11px] uppercase tracking-wider text-[#64748b]">Oldest waiting</span><span className="mt-2 block font-mono text-2xl font-bold">{oldest} day{oldest === 1 ? '' : 's'}</span></p>
            <p className="rounded-xl border border-[#e2e8f0] bg-white p-4"><span className="text-[11px] uppercase tracking-wider text-[#64748b]">Verified places</span><span className="mt-2 block font-mono text-2xl font-bold">{verifiedTotal}</span></p>
            <p className="rounded-xl border border-[#e2e8f0] bg-white p-4"><span className="text-[11px] uppercase tracking-wider text-[#64748b]">Parishes with counts</span><span className="mt-2 block font-mono text-2xl font-bold">{parishTotals.length}</span></p>
          </div>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 lg:col-span-5">
              <h3 className="text-sm font-semibold">Parish coverage</h3>
              <p className="mt-1 text-xs text-[#64748b]">Shaded by verified count. Parishes with no rows are not listed.</p>
              {parishTotals.length === 0 ? <p className="py-8 text-sm text-[#64748b]">The data is not in yet.</p> : (
                <ul className="mt-4 space-y-2">
                  {parishTotals.map((row) => (
                    <li key={row.pcode}>
                      <div className="flex justify-between text-xs"><span className="font-mono">{row.pcode}</span><span>{row.verified} verified</span></div>
                      <div className="mt-1 h-2 rounded bg-[#dbeafe]"><div className="h-2 rounded bg-[#2563eb]" style={{ width: `${maxVerified ? Math.max(8, Math.round((row.verified / maxVerified) * 100)) : 0}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white lg:col-span-7">
              <h3 className="border-b border-[#e2e8f0] px-4 py-3 text-sm font-semibold">Parish verification registry</h3>
              {parishTotals.length === 0 ? <p className="p-6 text-sm text-[#64748b]">The data is not in yet.</p> : (
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-[#64748b]">
                    <tr><th className="px-4 py-2">Parish</th><th className="px-4 py-2">Kind</th><th className="px-4 py-2">Verified</th><th className="px-4 py-2">Pending</th></tr>
                  </thead>
                  <tbody>
                    {parishTotals.flatMap((row) => row.rows.map((kindRow) => (
                      <tr key={`${row.pcode}-${kindRow.kind}`} className="border-t border-[#f1f5f9]">
                        <td className="px-4 py-2 font-mono text-xs">{row.pcode}</td>
                        <td className="px-4 py-2">{kindRow.kind}</td>
                        <td className="px-4 py-2">{kindRow.verified_count}</td>
                        <td className="px-4 py-2">{kindRow.pending_count}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {view === 'parishes' ? (
        <section className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
          <div className="border-b border-[#e2e8f0] px-4 py-3">
            <h3 className="text-sm font-semibold">All parishes with a count</h3>
            <p className="text-xs text-[#64748b]">Verified and pending only. County is not on these records.</p>
          </div>
          {parishTotals.length === 0 ? <p className="p-8 text-sm text-[#64748b]">The data is not in yet.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f8fafc] text-[11px] uppercase tracking-wider text-[#64748b]">
                <tr>
                  <th className="px-4 py-2">Parish</th>
                  <th className="px-4 py-2">Kind</th>
                  <th className="px-4 py-2">Verified</th>
                  <th className="px-4 py-2">Pending review</th>
                </tr>
              </thead>
              <tbody>
                {parishTotals.flatMap((row) => row.rows.map((kindRow) => (
                  <tr key={`${row.pcode}-${kindRow.kind}`} className="border-t border-[#f1f5f9]">
                    <td className="px-4 py-2 font-semibold">{row.pcode}</td>
                    <td className="px-4 py-2">{kindRow.kind}</td>
                    <td className="px-4 py-2">{kindRow.verified_count}</td>
                    <td className="px-4 py-2">{kindRow.pending_count}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {showMerge && current ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0f172a]/50 p-4">
          <form className="flex max-h-[92vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onSubmit={(event) => { event.preventDefault(); void act('merge'); }}>
            <div className="flex items-start justify-between border-b border-[#e2e8f0] px-6 py-4">
              <div>
                <h3 className="text-lg font-bold">Merge into an existing place</h3>
                <p className="text-sm text-[#64748b]">Evidence from this submission moves onto the place id you enter.</p>
              </div>
              <button type="button" className="text-sm text-[#64748b]" onClick={() => setShowMerge(false)}>Close</button>
            </div>
            <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
              <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] p-4">
                <p className="text-[11px] font-semibold uppercase text-[#1d4ed8]">Submitted</p>
                <p className="mt-2 font-semibold">{current.payload?.name || 'Unnamed place'}</p>
                <p className="mt-1 font-mono text-xs text-[#475569]">
                  {current.payload?.lat != null ? `${current.payload.lat}, ${current.payload.lng}` : 'No pin'}
                </p>
                {current.payload?.services?.length ? <p className="mt-2 text-sm">{current.payload.services.join(', ')}</p> : null}
              </div>
              <div className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4">
                <label className="text-[11px] font-semibold uppercase text-[#15803d]" htmlFor="merge-into">Existing place id</label>
                <input id="merge-into" className="mt-2 min-h-10 w-full rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 font-mono text-sm" value={mergeId} onChange={(event) => setMergeId(event.target.value)} required />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#e2e8f0] px-6 py-4">
              <button type="button" className="min-h-10 rounded-lg border border-[#e2e8f0] px-4 text-sm" onClick={() => setShowMerge(false)}>Cancel</button>
              <button type="submit" className="min-h-10 rounded-lg px-4 text-sm text-white" style={{ background: '#ea580c' }}>Merge into existing place</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
