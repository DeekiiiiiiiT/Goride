// Stitch: dominion-redesign/19c9df8ede1f4635be7f188be5c24f94
// Stitch D1: docs/stitch/dominion-redesign/html/D1-review-queue.html
import {
  accuracyBadgeClass,
  ageDays,
  gradeFromItem,
  kindLabel,
  pill,
  queuedAgo,
  strong,
  type PlacesReviewItem,
  type PlacesReviewView,
  type PlugChip,
} from './placesReviewShared';

export type PlacesReviewQueueProps = {
  items: PlacesReviewItem[];
  chips: PlugChip[];
  pending: number;
  oldest: number;
  parishCount?: number;
  selected: string[];
  parish: string;
  kind: string;
  evidence: string;
  age: string;
  sort: string;
  query: string;
  source?: string;
  setParish: (value: string) => void;
  setKind: (value: string) => void;
  setEvidence: (value: string) => void;
  setAge: (value: string) => void;
  setSort: (value: string) => void;
  setQuery: (value: string) => void;
  setSource?: (value: string) => void;
  onSelect: (ids: string[]) => void;
  onReview: (index: number) => void;
  onApprove: (id: string, name?: string) => void;
  onReject: (id: string) => void;
  onMerge: (index: number) => void;
  onRefresh: () => void;
  onTab: (view: PlacesReviewView) => void;
};

function Ms({ name, className = '', fill }: { name: string; className?: string; fill?: boolean }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`.trim()}
      style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
      data-icon={name}
    >
      {name}
    </span>
  );
}

function RecommendPill({ item }: { item: PlacesReviewItem }) {
  const grade = gradeFromItem(item);
  const label = pill(item).label;
  if (grade === 'strong') {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[3px] font-label-sm text-label-sm font-semibold bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0]">
        <Ms name="verified" className="text-[13px]" /> {label}
      </span>
    );
  }
  if (grade === 'duplicate') {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[3px] font-label-sm text-label-sm font-semibold bg-[#fff7ed] text-[#ea580c] border border-[#fed7aa]">
        <Ms name="difference" className="text-[13px]" /> {label}
      </span>
    );
  }
  if (grade === 'weak') {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[3px] font-label-sm text-label-sm font-semibold bg-[#fffbeb] text-[#d97706] border border-[#fde68a]">
        <Ms name="warning_amber" className="text-[13px]" /> {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[3px] font-label-sm text-label-sm font-semibold bg-[#f5f5f4] text-[#57534e] border border-[#e7e5e4]">
      <Ms name="hourglass_empty" className="text-[13px]" /> {label}
    </span>
  );
}

function RowActions({
  item,
  index,
  grade,
  onReview,
  onApprove,
  onReject,
  onMerge,
}: {
  item: PlacesReviewItem;
  index: number;
  grade: ReturnType<typeof gradeFromItem>;
  onReview: (index: number) => void;
  onApprove: (id: string, name?: string) => void;
  onReject: (id: string) => void;
  onMerge: (index: number) => void;
}) {
  if (grade === 'duplicate') {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          className="h-7 px-2 font-label-sm text-label-sm bg-surface-container-lowest border border-[#fed7aa] text-[#ea580c] hover:bg-[#fff7ed] rounded font-medium flex items-center gap-1"
          onClick={() => onMerge(index)}
        >
          <Ms name="call_merge" className="text-[14px]" /> Merge
        </button>
        <button
          type="button"
          className="h-7 px-2 font-label-sm text-label-sm bg-surface-container-lowest border border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2] rounded"
          onClick={() => onReject(item.id)}
        >
          Reject
        </button>
      </div>
    );
  }
  if (grade === 'weak') {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          className="h-7 px-2 font-label-sm text-label-sm bg-surface-container-lowest border border-outline-variant rounded text-on-surface hover:bg-surface-container flex items-center gap-1"
          onClick={() => onReview(index)}
        >
          <Ms name="image" className="text-[14px]" /> Inspect Photo
        </button>
        <button
          type="button"
          className="h-7 px-2 font-label-sm text-label-sm bg-surface-container-lowest border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded"
          onClick={() => onReview(index)}
        >
          Review
        </button>
      </div>
    );
  }
  if (grade === 'pending') {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          className="h-7 px-2 font-label-sm text-label-sm bg-surface-container-lowest border border-outline-variant rounded text-on-surface hover:bg-surface-container"
          onClick={() => onReview(index)}
        >
          Review Details
        </button>
        <button
          type="button"
          className="h-7 px-2 font-label-sm text-label-sm bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container"
          onClick={() => onReview(index)}
        >
          Hold
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        className="h-7 px-2 font-label-sm text-label-sm bg-surface-container-lowest border border-outline-variant rounded text-on-surface hover:bg-surface-container"
        onClick={() => onReview(index)}
      >
        Review Details
      </button>
      <button
        type="button"
        className="h-7 px-2.5 font-label-sm text-label-sm bg-[#0f172a] text-white rounded hover:bg-[#1e293b] font-medium flex items-center gap-1 shadow-sm"
        onClick={() => onApprove(item.id, item.payload?.name)}
      >
        <Ms name="check" className="text-white text-[14px]" /> Approve
      </button>
    </div>
  );
}

export function PlacesReviewQueue({
  items,
  chips,
  pending,
  oldest,
  parishCount = 0,
  selected,
  parish,
  kind,
  evidence,
  age,
  sort,
  query,
  source = 'all',
  setParish,
  setKind,
  setEvidence,
  setAge,
  setSort,
  setQuery,
  setSource,
  onSelect,
  onReview,
  onApprove,
  onReject,
  onMerge,
  onRefresh,
  onTab,
}: PlacesReviewQueueProps) {
  const parishCodes = [...new Set(items.map((item) => item.payload?.pcode).filter((code): code is string => !!code))].sort();
  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
  const selectedItems = items.filter((item) => selected.includes(item.id));
  const selectedParishes = new Set(selectedItems.map((item) => item.payload?.pcode).filter(Boolean)).size;
  const oldestItem = items.reduce<PlacesReviewItem | null>((best, item) => {
    if (!best) return item;
    return ageDays(item.created_at) > ageDays(best.created_at) ? item : best;
  }, null);
  const slaAtRisk = oldest >= 3;

  const toggleOne = (id: string, checked: boolean) => {
    onSelect(checked ? [...selected, id] : selected.filter((value) => value !== id));
  };

  const toggleAll = (checked: boolean) => {
    onSelect(checked ? items.map((item) => item.id) : []);
  };

  return (
    <div className="places-review-stitch bg-background text-on-surface antialiased font-body-md text-body-md min-h-screen overflow-x-hidden selection:bg-secondary-container">
      <main className="pt-4 pb-28 px-space-xl max-w-[1440px]">
        <section className="mb-space-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md mb-space-md">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">Places Moderation Queue</h1>
              <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
                Scout telemetry clustering and verification ledger across {parishCodes.length || parishCount || '—'} parishes.
              </p>
            </div>
            <div className="flex items-center gap-2 font-code-sm text-code-sm bg-surface-container-low px-space-md py-1 rounded border border-outline-variant text-on-surface-variant">
              <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse" />
              <span>Queue live · {pending} waiting</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
            <div className="bg-surface-container-lowest border border-outline-variant rounded p-space-md flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Queue Backlog</span>
                {slaAtRisk ? (
                  <span className="inline-flex items-center gap-1 font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-[#fff7ed] text-[#ea580c] border border-[#fed7aa] font-semibold">
                    <Ms name="warning" className="text-[14px]" /> SLA At Risk
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] font-semibold">
                    Within SLA
                  </span>
                )}
              </div>
              <div className="mt-space-sm">
                <div className="font-headline-lg text-headline-lg font-bold text-on-surface">
                  {pending} <span className="font-body-md text-body-md font-normal text-on-surface-variant">waiting</span>
                </div>
                <div className="font-code-sm text-code-sm text-on-surface-variant mt-1">{items.length} in current filter</div>
              </div>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded p-space-md flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Oldest Unreviewed</span>
                <span className="font-code-sm text-code-sm text-[#ba1a1a] font-semibold bg-[#fef2f2] px-1.5 py-0.5 rounded border border-[#fecaca]">72h SLA Limit</span>
              </div>
              <div className="mt-space-sm">
                <div className="font-headline-lg text-headline-lg font-bold text-on-surface">
                  {oldest} day{oldest === 1 ? '' : 's'}
                </div>
                <div className="font-body-sm text-body-sm text-on-surface-variant mt-1 truncate" title={oldestItem?.payload?.name || ''}>
                  {oldestItem ? `${oldestItem.payload?.name || 'Unnamed'} • ${oldestItem.payload?.pcode || '—'}` : '—'}
                </div>
              </div>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded p-space-md flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Strong evidence</span>
                <span className="inline-flex items-center gap-0.5 font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] font-semibold">
                  <Ms name="trending_up" className="text-[14px]" /> Ready
                </span>
              </div>
              <div className="mt-space-sm">
                <div className="font-headline-lg text-headline-lg font-bold text-on-surface">
                  {items.filter(strong).length}{' '}
                  <span className="font-body-md text-body-md font-normal text-on-surface-variant">strong</span>
                </div>
                <div className="font-code-sm text-code-sm text-on-surface-variant mt-1">From live queue evidence</div>
              </div>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded p-space-md flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Selected</span>
                <span className="font-code-sm text-code-sm text-on-surface-variant font-medium bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant">Batch</span>
              </div>
              <div className="mt-space-sm">
                <div className="font-headline-lg text-headline-lg font-bold text-on-surface">
                  {selected.length} <span className="font-body-md text-body-md font-normal text-on-surface-variant">rows</span>
                </div>
                <div className="font-code-sm text-code-sm text-on-surface-variant mt-1">
                  {selectedParishes ? `Across ${selectedParishes} parish${selectedParishes === 1 ? '' : 'es'}` : 'None selected'}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-surface-container-lowest border border-outline-variant rounded p-space-md mb-space-md">
          <div className="flex flex-wrap items-center justify-between gap-space-sm">
            <div className="flex flex-wrap items-center gap-space-sm flex-1">
              <div className="relative">
                <select
                  aria-label="Parish"
                  className="h-8 pl-2 pr-7 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface focus:outline-none focus:border-secondary focus:ring-0 cursor-pointer appearance-none"
                  value={parish}
                  onChange={(event) => setParish(event.target.value)}
                >
                  <option value="all">All Parishes ({parishCodes.length})</option>
                  {parishCodes.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
                <Ms name="expand_more" className="pointer-events-none absolute right-1.5 top-2 text-outline text-[16px]" />
              </div>

              <div className="relative">
                <select
                  aria-label="Place type"
                  className="h-8 pl-2 pr-7 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface focus:outline-none focus:border-secondary focus:ring-0 cursor-pointer appearance-none"
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                >
                  <option value="all">All Types</option>
                  {chips.map((chip) => (
                    <option key={chip.chip} value={chip.chip}>{chip.mapLabel}</option>
                  ))}
                </select>
                <Ms name="expand_more" className="pointer-events-none absolute right-1.5 top-2 text-outline text-[16px]" />
              </div>

              <div className="relative">
                <select
                  aria-label="Evidence"
                  className="h-8 pl-2 pr-7 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface focus:outline-none focus:border-secondary focus:ring-0 cursor-pointer appearance-none"
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                >
                  <option value="all">All Evidence</option>
                  <option value="strong">Strong (&gt;4 pins, ±10m)</option>
                  <option value="weak">Weak (Review photo)</option>
                </select>
                <Ms name="expand_more" className="pointer-events-none absolute right-1.5 top-2 text-outline text-[16px]" />
              </div>

              <div className="relative">
                <select
                  aria-label="Source"
                  className="h-8 pl-2 pr-7 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface focus:outline-none focus:border-secondary focus:ring-0 cursor-pointer appearance-none"
                  value={source}
                  onChange={(event) => setSource?.(event.target.value)}
                  disabled={!setSource}
                >
                  <option value="all">All Sources</option>
                  <option value="scout">Scout Submissions</option>
                  <option value="auto">Automated Ingestion</option>
                  <option value="telemetry">Telemetry Ping Fusion</option>
                </select>
                <Ms name="expand_more" className="pointer-events-none absolute right-1.5 top-2 text-outline text-[16px]" />
              </div>

              <div className="relative">
                <select
                  aria-label="Age"
                  className="h-8 pl-2 pr-7 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface focus:outline-none focus:border-secondary focus:ring-0 cursor-pointer appearance-none"
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                >
                  <option value="all">All Ages</option>
                  <option value="old">&gt; 48 hours</option>
                  <option value="few">24 - 48 hours</option>
                  <option value="day">&lt; 24 hours</option>
                </select>
                <Ms name="expand_more" className="pointer-events-none absolute right-1.5 top-2 text-outline text-[16px]" />
              </div>

              <div className="relative">
                <select
                  aria-label="Sort"
                  className="h-8 pl-2 pr-7 bg-surface-container-low border border-outline-variant rounded font-label-md text-label-md text-on-surface font-medium focus:outline-none focus:border-secondary focus:ring-0 cursor-pointer appearance-none"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="evidence">Sort: Strongest evidence first</option>
                  <option value="oldest">Sort: Oldest queued first</option>
                  <option value="newest">Sort: Newest first</option>
                  <option value="parish">Sort: Parish</option>
                </select>
                <Ms name="sort" className="pointer-events-none absolute right-1.5 top-2 text-outline text-[16px]" />
              </div>
            </div>

            <div className="relative min-w-[280px]">
              <Ms name="search" className="absolute left-2.5 top-2 text-outline text-[16px]" />
              <input
                className="h-8 w-full pl-8 pr-12 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary focus:ring-0"
                placeholder="Filter records by name, ID or road..."
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="absolute right-2 top-1.5 flex items-center gap-0.5">
                <kbd className="font-code-sm text-code-sm text-on-surface-variant bg-surface-container-low border border-outline-variant px-1 rounded">⌘K</kbd>
              </div>
            </div>
          </div>
        </section>

        <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
          <div className="px-space-md py-2 border-b border-surface-container flex items-center justify-between bg-surface-container-low">
            <div className="flex items-center gap-space-sm text-on-surface-variant font-label-md text-label-md">
              <span className="font-semibold text-on-surface">Queue Ledger</span>
              <span className="text-outline">•</span>
              <span>
                {selected.length === 0
                  ? 'No items selected for batch operations'
                  : `${selected.length} item${selected.length === 1 ? '' : 's'} currently selected for batch operations`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-7 px-2 font-label-sm text-label-sm bg-surface-container-lowest border border-outline-variant rounded text-on-surface hover:bg-surface-container flex items-center gap-1"
                onClick={() => onTab('coverage')}
              >
                <Ms name="map" className="text-[14px]" /> Coverage
              </button>
              <button
                type="button"
                className="h-7 px-2 font-label-sm text-label-sm bg-surface-container-lowest border border-outline-variant rounded text-on-surface hover:bg-surface-container flex items-center gap-1"
                onClick={() => onTab('parishes')}
              >
                <Ms name="table_chart" className="text-[14px]" /> Parish table
              </button>
              <button
                type="button"
                className="h-7 px-2 font-label-sm text-label-sm bg-surface-container-lowest border border-outline-variant rounded text-on-surface hover:bg-surface-container flex items-center gap-1"
                onClick={onRefresh}
              >
                <Ms name="refresh" className="text-[14px]" /> Live Reload
              </button>
            </div>
          </div>

          <div className="overflow-x-auto custom-scroll">
            {items.length === 0 ? (
              <p className="p-8 text-center font-body-md text-body-md text-on-surface-variant">The data is not in yet.</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="h-8 bg-[#f8fafc] text-[#64748b] font-label-sm text-label-sm uppercase tracking-[0.04em] border-b border-[#cbd5e1] select-none">
                    <th className="w-10 px-space-md text-center">
                      <input
                        checked={allSelected}
                        className="w-3.5 h-3.5 rounded-[2px] border-[1.5px] border-[#94a3b8] text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        type="checkbox"
                        aria-label="Select all"
                        onChange={(event) => toggleAll(event.target.checked)}
                      />
                    </th>
                    <th className="px-space-md">Place Name &amp; Type</th>
                    <th className="px-space-md">Parish &amp; Sub-Locality</th>
                    <th className="px-space-md">Evidence Breakdown &amp; Telemetry</th>
                    <th className="px-space-md">Recommendation</th>
                    <th className="px-space-md">Queued</th>
                    <th className="px-space-md text-right pr-6">Direct Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
                  {items.map((item, index) => {
                    const isSelected = selected.includes(item.id);
                    const grade = gradeFromItem(item);
                    const meters = item.best_accuracy_m ?? item.payload?.accuracyM ?? null;
                    const days = ageDays(item.created_at);
                    const typeLabel = kindLabel(item, chips);
                    return (
                      <tr
                        key={item.id}
                        className={`h-10 hover:bg-[#f8fafc] transition-colors ${isSelected ? 'bg-[#eff6ff]/40' : ''}`}
                      >
                        <td className="px-space-md text-center">
                          <input
                            checked={isSelected}
                            className="w-3.5 h-3.5 rounded-[2px] border-[1.5px] border-[#94a3b8] text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
                            type="checkbox"
                            aria-label={`Select ${item.payload?.name || 'place'}`}
                            onChange={(event) => toggleOne(item.id, event.target.checked)}
                          />
                        </td>
                        <td className="px-space-md">
                          <div className="font-semibold text-on-surface leading-tight">{item.payload?.name || 'Unnamed place'}</div>
                          <div className="font-code-sm text-code-sm text-on-surface-variant flex items-center gap-1">
                            <span>{typeLabel}</span>
                            <span className="text-outline">•</span>
                            <span className="text-outline">#{item.place_id || item.id.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td className="px-space-md">
                          <div className="text-on-surface leading-tight">{item.payload?.pcode || '—'}</div>
                          <div className="font-code-sm text-code-sm text-on-surface-variant">
                            {item.payload?.brand || item.payload?.services?.[0] || '—'}
                          </div>
                        </td>
                        <td className="px-space-md">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-on-surface">{item.distinct_users} pin{item.distinct_users === 1 ? '' : 's'}</span>
                            <span className="text-outline">•</span>
                            <span>{item.distinct_users} people</span>
                            <span className="text-outline">•</span>
                            <span className={accuracyBadgeClass(meters)}>
                              best {meters != null ? `±${meters} m` : '—'}
                            </span>
                          </div>
                          <div className="font-code-sm text-code-sm text-on-surface-variant mt-0.5">
                            {grade === 'duplicate' ? (
                              <span className="text-[#ea580c] font-medium flex items-center gap-1">
                                <Ms name="content_copy" className="text-[13px]" /> {item.suggestion}
                              </span>
                            ) : grade === 'weak' ? (
                              <span className="text-[#d97706] flex items-center gap-1">
                                <Ms name="no_photography" className="text-[13px]" />
                                {item.payload?.photoUrl ? 'Photo attached — check clarity' : 'No photo on submission'}
                              </span>
                            ) : strong(item) ? (
                              'High confidence geometry'
                            ) : (
                              'Pending verification'
                            )}
                          </div>
                        </td>
                        <td className="px-space-md">
                          <RecommendPill item={item} />
                        </td>
                        <td className={`px-space-md font-code-sm text-code-sm ${days >= 3 ? 'text-[#ba1a1a] font-semibold' : 'text-on-surface-variant'}`}>
                          {queuedAgo(item.created_at)}
                        </td>
                        <td className="px-space-md text-right pr-6">
                          <RowActions
                            item={item}
                            index={index}
                            grade={grade}
                            onReview={onReview}
                            onApprove={onApprove}
                            onReject={onReject}
                            onMerge={onMerge}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-space-md py-space-sm border-t border-outline-variant bg-surface-container-lowest flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
            <div className="flex items-center gap-space-md font-body-sm text-body-sm text-on-surface-variant">
              <span>
                Showing <strong className="text-on-surface font-semibold">1–{items.length}</strong> of{' '}
                <strong className="text-on-surface font-semibold">{pending}</strong> places
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="h-7 px-2 font-label-sm text-label-sm bg-surface-container-lowest border border-outline-variant rounded text-on-surface hover:bg-surface-container flex items-center gap-1"
                onClick={onRefresh}
              >
                <Ms name="refresh" className="text-[14px]" /> Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="mt-space-md bg-surface-container-lowest border border-outline-variant rounded px-space-md py-2 flex flex-col md:flex-row items-center justify-between gap-space-sm text-on-surface-variant font-code-sm text-code-sm">
          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-1.5 text-on-surface">
              <Ms name="sensors" className="text-[16px] text-[#16a34a]" />
              <span className="font-medium">Queue:</span> {pending} waiting · {items.filter(strong).length} strong evidence
            </div>
            <div className="h-3 w-[1px] bg-outline-variant" />
            <div>GPS Drift Threshold: ≤ 15.0m</div>
          </div>
          <div className="flex items-center gap-space-md select-none">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold">Hotkeys:</span>
            <div className="flex items-center gap-1">
              <kbd className="bg-surface-container-low border border-outline-variant px-1 rounded text-on-surface font-semibold">A</kbd>
              <span className="text-on-surface-variant">Quick Approve</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="bg-surface-container-low border border-outline-variant px-1 rounded text-on-surface font-semibold">R</kbd>
              <span className="text-on-surface-variant">Reject Place</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="bg-surface-container-low border border-outline-variant px-1 rounded text-on-surface font-semibold">M</kbd>
              <span className="text-on-surface-variant">Merge</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="bg-surface-container-low border border-outline-variant px-1 rounded text-on-surface font-semibold">N</kbd>
              <span className="text-on-surface-variant">Next Item</span>
            </div>
          </div>
        </div>
      </main>

      {selected.length > 0 ? (
        <aside className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#ffffff] border border-[#cbd5e1] rounded shadow-[0_4px_6px_-1px_rgba(15,23,42,0.06),0_2px_4px_-2px_rgba(15,23,42,0.04)] px-space-lg py-2 flex items-center gap-space-md select-none">
          <div className="flex items-center gap-space-sm pr-space-md border-r border-[#e2e8f0]">
            <span className="w-5 h-5 rounded-full bg-primary-container text-white font-code-sm text-code-sm flex items-center justify-center font-bold">
              {selected.length}
            </span>
            <span className="font-label-md text-label-md text-on-surface font-semibold">
              {selected.length} selected place{selected.length === 1 ? '' : 's'}
              {selectedParishes ? ` across ${selectedParishes} parish${selectedParishes === 1 ? '' : 'es'}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-8 px-3.5 bg-[#16a34a] hover:bg-[#15803d] text-white font-label-md text-label-md font-semibold rounded flex items-center gap-1.5 transition-colors shadow-sm"
              onClick={() => {
                for (const item of selectedItems) onApprove(item.id, item.payload?.name);
              }}
            >
              <Ms name="check_circle" className="text-white text-[16px]" />
              <span>Approve {selected.length} selected</span>
            </button>
            <button
              type="button"
              className="h-8 px-3 bg-[#ffffff] hover:bg-[#fef2f2] text-[#dc2626] border border-[#fecaca] font-label-md text-label-md font-semibold rounded flex items-center gap-1.5 transition-colors"
              onClick={() => {
                for (const item of selectedItems) onReject(item.id);
              }}
            >
              <Ms name="cancel" className="text-[#dc2626] text-[16px]" />
              <span>Reject selected</span>
            </button>
            <button
              type="button"
              className="h-8 px-2.5 text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors ml-1"
              onClick={() => onSelect([])}
            >
              Deselect all
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
