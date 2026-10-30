// Stitch: dominion-redesign/s36c-level-browser
import { useEffect, useMemo, useState } from 'react';
import { DominionEmpty } from '../../DominionStates';
import { JamaicaSectionShell } from '../JamaicaSectionShell';
import { BoundaryTable } from './BoundaryTable';
import { BorderEditor } from './BorderEditor';
import { LevelFilters } from './LevelFilters';
import { fetchBoundaries } from './levelsApi';
import { levelFromPage, levelPlural, sortRows, type BoundaryRow, type SortKey } from './levelsFormat';

export function LevelBrowserPage({
  page,
  accessToken,
  canWrite,
  onNavigate,
}: {
  page: string;
  accessToken: string;
  canWrite: boolean;
  onNavigate: (pageId: string) => void;
}) {
  const level = levelFromPage(page);
  const [rows, setRows] = useState<BoundaryRow[]>([]);
  const [parishes, setParishes] = useState<Array<{ pcode: string; name: string }>>([]);
  const [query, setQuery] = useState('');
  const [parish, setParish] = useState('');
  const [town, setTown] = useState('');
  const [hasDraft, setHasDraft] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('drafts') === '1');
  const [sameName, setSameName] = useState(false);
  const [selected, setSelected] = useState<string | null>(() => typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('area') : null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchBoundaries(accessToken, level).then((list) => {
      if (!cancelled) setRows(list);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load the map.');
    });
    void fetchBoundaries(accessToken, 1).then((list) => {
      if (!cancelled) setParishes(list.map((row) => ({ pcode: row.pcode, name: row.name })));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken, level]);

  const towns = useMemo(() => {
    if (level !== 3) return [];
    return rows
      .map((row) => ({ pcode: row.town_pcode || '', name: (row.parent_name || '').split(' › ')[0] }))
      .filter((row, index, all) => row.pcode && all.findIndex((item) => item.pcode === row.pcode) === index);
  }, [rows, level]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const next = rows.filter((row) => {
      if (q && !row.name.toLowerCase().includes(q) && !row.pcode.toLowerCase().includes(q)) return false;
      if (parish && row.parish_pcode !== parish && row.parent_pcode !== parish) return false;
      if (town && row.town_pcode !== town && row.parent_pcode !== town) return false;
      if (hasDraft && !row.has_draft) return false;
      if (sameName && row.same_name_count < 2) return false;
      return true;
    });
    return sortRows(next, sortKey, sortDir);
  }, [rows, query, parish, town, hasDraft, sameName, sortKey, sortDir]);

  const selectedRow = rows.find((row) => row.pcode === selected) || null;

  function open(pcode: string) {
    setSelected(pcode);
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    url.searchParams.set('area', pcode);
    window.history.pushState({ page }, '', `${url.pathname}?${url.searchParams.toString()}`);
  }

  return (
    <JamaicaSectionShell page={page} accessToken={accessToken} onNavigate={onNavigate}>
      {() => (
        <div className="flex flex-col gap-4" data-stitch="level browser jamaica map country parishes towns communities pins imports">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-semibold">S36c</span>
              <h2 className="text-base font-headline font-bold text-on-surface tracking-tight">Level Browser</h2>
            </div>
            <span className="text-xs font-mono text-outline">Hierarchy Explorer</span>
          </div>
          {error ? <p className="text-xs text-error">{error}</p> : null}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
            <LevelFilters
              level={level}
              query={query}
              parish={parish}
              town={town}
              parishes={parishes}
              towns={towns}
              hasDraft={hasDraft}
              sameName={sameName}
              countLabel={`${filtered.length} ${levelPlural(level)}`}
              onQuery={setQuery}
              onParish={setParish}
              onTown={setTown}
              onHasDraft={setHasDraft}
              onSameName={setSameName}
            />
            {filtered.length === 0 ? <DominionEmpty body="No areas match these filters." /> : (
              <BoundaryTable
                rows={filtered}
                selected={selected}
                onOpen={open}
                onSort={(key) => {
                  setSortDir((dir) => key === sortKey ? (dir === 1 ? -1 : 1) : 1);
                  setSortKey(key);
                }}
              />
            )}
          </div>
          {selectedRow ? (
            <BorderEditor
              token={accessToken}
              pcode={selectedRow.pcode}
              level={level}
              name={selectedRow.name}
              parentName={selectedRow.parent_name}
              canWrite={canWrite}
              onBack={() => setSelected(null)}
            />
          ) : null}
        </div>
      )}
    </JamaicaSectionShell>
  );
}
