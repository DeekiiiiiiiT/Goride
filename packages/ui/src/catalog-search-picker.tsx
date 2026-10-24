import { useState } from 'react';

export type CatalogHit = { id: string; label: string };

/**
 * Make / model search that does not need a Fleet login.
 * One hit can be chosen immediately. Several stay as a list. None offers a request.
 */
export function CatalogSearchPicker({
  onSearch,
  onPick,
  onMissing,
}: {
  onSearch: (query: string) => Promise<CatalogHit[]>;
  onPick: (hit: CatalogHit) => void;
  onMissing: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CatalogHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const search = () => {
    setLoading(true);
    setError(null);
    void onSearch(query.trim())
      .then((rows) => {
        setHits(rows);
        if (rows.length === 1) onPick(rows[0]!);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Search failed'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-3">
      <input
        className="tap w-full rounded-xl border border-line px-3"
        value={query}
        placeholder="Make or model"
        aria-label="Search catalog"
        onChange={(event) => setQuery(event.target.value)}
      />
      <button type="button" className="tap rounded-xl border border-primary px-4 text-primary" onClick={search}>
        Search
      </button>
      {loading ? <p role="status" className="text-sm">Searching the catalog…</p> : null}
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
      {hits && hits.length === 0 ? <p className="text-sm">No cars yet. You can still request one.</p> : null}
      <ul className="space-y-2">
        {(hits || []).map((hit) => (
          <li key={hit.id}>
            <button type="button" className="tap w-full rounded-xl bg-surface px-3 text-left ring-1 ring-line" onClick={() => onPick(hit)}>
              {hit.label}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="tap text-primary" onClick={onMissing}>My car is not listed</button>
    </div>
  );
}
