// Stitch: dominion-redesign/parts_import_check_results
import { useMemo, useState } from "react";
import { ImportCheckKpis } from "./ImportCheckKpis";
import { ImportLineInspector, type ImportRowInspectPayload } from "./ImportLineInspector";
import { ImportRowTable } from "./ImportRowTable";
import { MaterialIcon } from "./MaterialIcon";
import { fetchImportRowInspect, type ImportBatchSummary } from "./partsImportApi";

export { ImportCheckKpis } from "./ImportCheckKpis";
export { ImportRowTable } from "./ImportRowTable";
export { ImportRowExpanded } from "./ImportRowExpanded";

type BatchCounts = {
  rows_total?: number;
  rows_valid?: number;
  rows_labelled?: number;
  rows_error?: number;
  rows_duplicate?: number;
  rows_unchanged?: number;
  checked_at?: string | null;
};

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "valid", label: "Ready" },
  { key: "labelled", label: "Ready with label" },
  { key: "error", label: "Error" },
  { key: "duplicate", label: "Duplicate" },
  { key: "unchanged", label: "Unchanged" },
] as const;

export function ImportCheckStep({
  batchId,
  batchCode,
  fileName,
  areaName,
  templateVersion,
  batch,
  rows,
  total,
  importableCount,
  batchSummary,
  onSelectAllAccepted,
  priorImport,
  onFilterChange,
  onPromote,
  promoting,
  onExportRaw,
  onAuditTrail,
  onCheckAgain,
  onCancel,
  onDownloadFailed,
  onPatchRow,
  onToggleAccepted,
  onViewPriorImport,
  pageOffset,
  pageLimit,
  onPagePrev,
  onPageNext,
}: {
  batchId: string;
  batchCode: string;
  fileName?: string;
  areaName?: string;
  templateVersion?: number;
  batch?: BatchCounts;
  rows: Array<Record<string, unknown>>;
  total?: number;
  importableCount: number;
  batchSummary?: ImportBatchSummary | null;
  onSelectAllAccepted?: (accepted: boolean) => void;
  priorImport?: Record<string, unknown> | null;
  onFilterChange?: (params: { status?: string; issue?: string; q?: string }) => void;
  onPromote: () => void;
  promoting: boolean;
  onExportRaw?: () => void;
  onAuditTrail?: () => void;
  onCheckAgain?: () => void;
  /** Leave this check without importing and go back to the area picker. */
  onCancel?: () => void;
  onDownloadFailed?: () => void;
  onPatchRow?: (lineNo: number) => void;
  onToggleAccepted?: (lineNo: number, accepted: boolean) => void;
  onViewPriorImport?: () => void;
  pageOffset?: number;
  pageLimit?: number;
  onPagePrev?: () => void;
  onPageNext?: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [issueFilter, setIssueFilter] = useState("");
  const [search, setSearch] = useState("");
  const [inspectLine, setInspectLine] = useState<number | null>(null);
  const [inspectPayload, setInspectPayload] = useState<ImportRowInspectPayload | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  async function openInspector(lineNo: number) {
    setInspectLine(lineNo);
    setInspectLoading(true);
    setInspectPayload(null);
    try {
      const data = await fetchImportRowInspect(batchId, lineNo);
      setInspectPayload(data as ImportRowInspectPayload);
    } catch (e) {
      setInspectPayload({ error: e instanceof Error ? e.message : "Inspect failed" });
    } finally {
      setInspectLoading(false);
    }
  }

  const counts = useMemo(() => {
    const sc = batchSummary?.statusCounts ?? {};
    return {
      all: batchSummary?.rowsTotal ?? batch?.rows_total ?? total ?? rows.length,
      valid: Number(sc.valid ?? batch?.rows_valid ?? 0),
      labelled: Number(sc.labelled ?? batch?.rows_labelled ?? 0),
      error: Number(sc.error ?? batch?.rows_error ?? 0),
      duplicate: Number(sc.duplicate ?? batch?.rows_duplicate ?? 0),
      unchanged: Number(sc.unchanged ?? batch?.rows_unchanged ?? 0),
    };
  }, [batch, batchSummary, rows, total]);

  const issueOptions = useMemo(() => {
    if (batchSummary?.issueCounts?.length) {
      return batchSummary.issueCounts.map((i) => [i.code, i.count] as const);
    }
    const map = new Map<string, number>();
    for (const row of rows) {
      const issues = row.issues as Array<{ code?: string; message?: string }> | undefined;
      for (const issue of issues ?? []) {
        const key = issue.code ?? issue.message ?? "Issue";
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [batchSummary, rows]);

  const actions = batchSummary?.actions ?? {};
  const willCreate = Number(actions.create_part ?? 0);
  const willAddFits = Number(actions.add_fit ?? 0);
  const willUpdate = Number(actions.update_part ?? 0) + Number(actions.update_fit ?? 0);

  const titleFile = fileName ?? "import.csv";
  const checkedLabel = batch?.checked_at
    ? new Date(String(batch.checked_at)).toLocaleString()
    : batchSummary?.checkedAt
      ? new Date(String(batchSummary.checkedAt)).toLocaleString()
      : "—";
  const engineVersion = batchSummary?.engineVersion ?? "2.4.0";

  function applyFilters(next: { status?: string; issue?: string; q?: string }) {
    onFilterChange?.(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2 items-start">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Check {titleFile}</h2>
          <p className="text-xs font-mono text-secondary">
            {areaName} · {counts.all} rows · checked {checkedLabel}
          </p>
        </div>
        <span className="text-xs font-mono text-outline">TX ID: #{batchCode}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="text-xs font-semibold text-secondary inline-flex items-center gap-1" onClick={onExportRaw}>
          <MaterialIcon name="download" className="text-[14px]" />
          Export raw CSV
        </button>
        <button type="button" className="text-xs font-semibold text-secondary inline-flex items-center gap-1" onClick={onAuditTrail}>
          <MaterialIcon name="sync" className="text-[14px]" />
          Audit trail
        </button>
      </div>

      {priorImport?.promoted_at ? (
        <div className="rounded-xl bg-surface-container-low px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>This file was imported on {new Date(String(priorImport.promoted_at)).toLocaleString()}</span>
          <button type="button" className="font-semibold text-primary" onClick={onViewPriorImport}>
            View that import →
          </button>
        </div>
      ) : null}

      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm space-y-2">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const n =
              tab.key === ""
                ? counts.all
                : tab.key === "valid"
                  ? counts.valid
                  : tab.key === "labelled"
                    ? counts.labelled
                    : tab.key === "error"
                      ? counts.error
                      : tab.key === "duplicate"
                        ? counts.duplicate
                        : counts.unchanged;
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key || "all"}
                type="button"
                className={`px-3 py-1 rounded-lg text-xs font-semibold ${active ? "bg-primary-container text-on-primary" : "bg-surface-container-low"}`}
                onClick={() => {
                  setStatusFilter(tab.key);
                  applyFilters({ status: tab.key || undefined, issue: issueFilter || undefined, q: search || undefined });
                }}
              >
                {tab.label} ({n})
              </button>
            );
          })}
        </div>
        <p className="text-xs text-on-surface-variant">
          Will create {willCreate} parts · add {willAddFits} fits · update {willUpdate}
        </p>
        <p className="text-[10px] font-mono text-outline">
          Validation engine: Dominion Matcher Core v{engineVersion}
        </p>
      </div>

      <div className="rounded-xl bg-surface-container-lowest p-3 shadow-sm flex flex-wrap gap-3 items-center">
        <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2">
          Issue:
          <select
            className="rounded-lg border border-outline-variant px-2 py-1 text-xs bg-surface-container-lowest"
            value={issueFilter}
            onChange={(e) => {
              setIssueFilter(e.target.value);
              applyFilters({ status: statusFilter || undefined, issue: e.target.value || undefined, q: search || undefined });
            }}
          >
            <option value="">All issues ({issueOptions.reduce((s, [, c]) => s + c, 0) || counts.error})</option>
            {issueOptions.map(([code, c]) => (
              <option key={code} value={code}>
                {code} ({c})
              </option>
            ))}
          </select>
        </label>
        {onSelectAllAccepted ? (
          <button
            type="button"
            className="text-xs font-semibold text-primary"
            onClick={() => onSelectAllAccepted(true)}
          >
            Select all importable
          </button>
        ) : null}
        <div className="relative flex-1 min-w-[200px]">
          <MaterialIcon name="search" className="absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-outline" />
          <input
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-outline-variant text-xs"
            placeholder="Search car or part number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                applyFilters({ status: statusFilter || undefined, issue: issueFilter || undefined, q: search || undefined });
              }
            }}
          />
        </div>
      </div>

      <ImportCheckKpis valid={counts.valid + counts.labelled} total={counts.all} errors={counts.error} />
      <ImportRowTable
        rows={rows}
        total={total}
        onPatchRow={onPatchRow}
        onToggleAccepted={onToggleAccepted}
        onInspectLine={(lineNo) => { void openInspector(lineNo); }}
        pageOffset={pageOffset}
        pageLimit={pageLimit}
        onPagePrev={onPagePrev}
        onPageNext={onPageNext}
      />
      {inspectLine != null ? (
        <ImportLineInspector
          lineNo={inspectLine}
          payload={inspectPayload}
          loading={inspectLoading}
          onDismiss={() => {
            setInspectLine(null);
            setInspectPayload(null);
          }}
        />
      ) : null}
      <div className="sticky bottom-0 bg-surface-container-lowest border-t border-outline-variant/30 p-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-on-surface-variant flex items-center gap-1 max-w-md">
          <MaterialIcon name="shield" className="text-[16px] text-primary" />
          Errors are left out. You can import the ready rows now and fix the rest later.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="text-sm text-secondary inline-flex items-center gap-1" onClick={onDownloadFailed}>
            <MaterialIcon name="download" className="text-[16px]" />
            Download failed rows ({counts.error})
          </button>
          <button type="button" className="text-sm text-secondary inline-flex items-center gap-1" onClick={onCheckAgain}>
            <MaterialIcon name="sync" className="text-[16px]" />
            Check again
          </button>
          {onCancel ? (
            <button
              type="button"
              disabled={promoting}
              className="h-10 px-5 rounded-xl border border-outline-variant text-on-surface font-semibold disabled:opacity-50"
              onClick={onCancel}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            disabled={promoting || importableCount === 0}
            className="h-10 px-6 rounded-xl bg-primary text-on-primary font-semibold disabled:opacity-50 inline-flex items-center gap-1"
            onClick={onPromote}
          >
            {promoting ? "Importing…" : `Import ${importableCount} rows`}
            <MaterialIcon name="arrow_forward" className="text-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
