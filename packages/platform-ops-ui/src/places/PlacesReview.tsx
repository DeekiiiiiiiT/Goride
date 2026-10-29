// Stitch: dominion-redesign/19c9df8ede1f4635be7f188be5c24f94
// Stitch: dominion-redesign/6348f0f2c36149fa9bb2cc9e8fa39577
// Stitch: dominion-redesign/a87e5505779043e2a48a64a6f6266d2e
// Stitch: dominion-redesign/7da088e95e1e4fe088a2add010bf9bd3
// Stitch: dominion-redesign/53ad2876cac241b1aaceeb7bbc307045
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlacesReviewCoverage } from './PlacesReviewCoverage';
import { PlacesReviewMerge } from './PlacesReviewMerge';
import { PlacesReviewQueue } from './PlacesReviewQueue';
import { PlacesReviewSplit } from './PlacesReviewSplit';
import {
  ageDays,
  strong,
  type Coverage,
  type PlacesReviewItem,
  type PlacesReviewView,
  type PlugChip,
} from './placesReviewShared';

export function PlacesReview({
  apiBase,
  getToken,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
}) {
  const [items, setItems] = useState<PlacesReviewItem[]>([]);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [pending, setPending] = useState(0);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<PlacesReviewView>('queue');
  const [kind, setKind] = useState('all');
  const [parish, setParish] = useState('all');
  const [query, setQuery] = useState('');
  const [evidence, setEvidence] = useState('all');
  const [age, setAge] = useState('all');
  const [sort, setSort] = useState('evidence');
  const [source, setSource] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeId, setMergeId] = useState('');
  const [editName, setEditName] = useState('');
  const [chips, setChips] = useState<PlugChip[]>([]);
  const [busy, setBusy] = useState(false);

  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await tokenRef.current();
      if (!token) throw new Error('Sign in to Dominion first');
      const headers = { Authorization: `Bearer ${token}` };
      const [queue, cover, tree] = await Promise.all([
        fetch(`${apiBase}/admin/places`, { headers }),
        fetch(`${apiBase}/admin/coverage`, { headers }),
        fetch(`${apiBase}/admin/taxonomy`, { headers }),
      ]);
      const queueBody = await queue.json();
      const coverBody = await cover.json();
      const treeBody = tree.ok ? await tree.json() : {};
      if (!queue.ok) throw new Error(queueBody.error || 'Could not load the queue');
      setItems(queueBody.items || []);
      setCoverage(coverBody.coverage || []);
      setPending(coverBody.pending || 0);
      setChips([...(treeBody.plugChips || [])].sort((a: PlugChip, b: PlugChip) => a.sort - b.sort));
      setIndex(0);
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the queue');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

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

  useEffect(() => {
    setEditName(current?.payload?.name || '');
    setShowMerge(false);
    setMergeId('');
  }, [current?.id]);

  const act = useCallback(
    async (action: 'approve' | 'reject' | 'merge', id = current?.id, name?: string) => {
      if (!id) return;
      setBusy(true);
      setError(null);
      try {
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
      } finally {
        setBusy(false);
      }
    },
    [apiBase, current?.id, getToken, mergeId],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const key = event.key.toLowerCase();
      if (key === 'a') void act('approve', current?.id, editName);
      if (key === 'r') void act('reject');
      if (key === 'm') {
        setView('item');
        setShowMerge(true);
      }
      if (key === 'e') setView('item');
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

  const parishTotals = useMemo(
    () =>
      parishes
        .map(([pcode, rows]) => ({
          pcode,
          rows,
          verified: rows.reduce((sum, row) => sum + Number(row.verified_count || 0), 0),
          waiting: rows.reduce((sum, row) => sum + Number(row.pending_count || 0), 0),
        }))
        .sort((a, b) => b.verified - a.verified),
    [parishes],
  );
  const verifiedTotal = parishTotals.reduce((sum, row) => sum + row.verified, 0);
  const maxVerified = parishTotals.reduce((max, row) => Math.max(max, row.verified), 0);

  if (loading) {
    return <p className="places-review-stitch p-6 text-sm text-on-surface-variant">Loading the review queue…</p>;
  }

  return (
    <div className="places-review-stitch min-h-[720px] bg-surface-container-low text-on-surface font-body antialiased">
      {error ? (
        <p className="mb-3 rounded-lg bg-error-container/20 px-3 py-2 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      {view === 'queue' ? (
        <PlacesReviewQueue
          items={visible}
          chips={chips}
          pending={pending}
          oldest={oldest}
          parishCount={parishTotals.length}
          selected={selected}
          parish={parish}
          kind={kind}
          evidence={evidence}
          age={age}
          sort={sort}
          query={query}
          source={source}
          setParish={setParish}
          setKind={setKind}
          setEvidence={setEvidence}
          setAge={setAge}
          setSort={setSort}
          setQuery={setQuery}
          setSource={setSource}
          onSelect={setSelected}
          onReview={(i) => {
            setIndex(i);
            setView('item');
          }}
          onApprove={(id, name) => void act('approve', id, name)}
          onReject={(id) => void act('reject', id)}
          onMerge={(i) => {
            setIndex(i);
            setView('item');
            setShowMerge(true);
          }}
          onRefresh={() => void load()}
          onTab={setView}
        />
      ) : null}

      {view === 'item' ? (
        <PlacesReviewSplit
          item={current || null}
          index={index}
          total={visible.length}
          chips={chips}
          editName={editName}
          setEditName={setEditName}
          showMerge={showMerge}
          mergeId={mergeId}
          setShowMerge={setShowMerge}
          setMergeId={setMergeId}
          onApprove={(id, name) => void act('approve', id, name)}
          onReject={(id) => void act('reject', id)}
          onMerge={() => setShowMerge(true)}
          onSkip={() => setIndex((value) => Math.min(value + 1, Math.max(visible.length - 1, 0)))}
          onBack={() => setView('queue')}
        />
      ) : null}

      {view === 'coverage' || view === 'parishes' ? (
        <PlacesReviewCoverage
          pending={pending}
          oldest={oldest}
          parishTotals={parishTotals}
          verifiedTotal={verifiedTotal}
          maxVerified={maxVerified}
          section={view === 'parishes' ? 'parishes' : 'overview'}
          onSectionChange={(section) => setView(section === 'parishes' ? 'parishes' : 'coverage')}
          onOpenQueue={() => setView('queue')}
          onRefresh={() => void load()}
        />
      ) : null}

      <PlacesReviewMerge
        open={showMerge && !!current}
        item={
          current
            ? {
                id: current.id,
                payload: {
                  name: current.payload?.name,
                  lat: current.payload?.lat,
                  lng: current.payload?.lng,
                  services: current.payload?.services,
                  accuracyM: current.payload?.accuracyM,
                },
                best_accuracy_m: current.best_accuracy_m,
              }
            : null
        }
        mergeId={mergeId}
        onMergeIdChange={setMergeId}
        onCancel={() => setShowMerge(false)}
        onConfirm={() => void act('merge')}
        busy={busy}
      />
    </div>
  );
}
