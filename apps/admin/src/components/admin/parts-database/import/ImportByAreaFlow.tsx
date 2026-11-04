// Stitch: dominion-redesign/parts_import_pick_area
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthContext";
import { hasPermission } from "../../../../utils/permissions";
import { goDominionPage } from "../partsCatalogUrl";
import { ImportAreaPicker } from "./ImportAreaPicker";
import { ImportCheckStep } from "./ImportCheckStep";
import { ImportDoneStep, ImportBatchRecordsTable } from "./ImportDoneStep";
import { ImportLedger } from "./ImportLedger";
import { ImportStates } from "./ImportStates";
import { ImportStepper } from "./ImportStepper";
import { ImportUploadStep } from "./ImportUploadStep";
import {
  cancelImportCheck,
  createImportBatch,
  uploadImportBatchSource,
  failedCsvUrl,
  fetchImportAreas,
  fetchImportSpecialTemplates,
  fetchImportBatch,
  fetchImportBatchChanges,
  fetchImportLedger,
  fetchImportTemplateSchema,
  fetchUndoPreflight,
  ledgerCsvUrl,
  fetchImportBatchSummary,
  fetchImportMeta,
  patchImportRowsBulk,
  patchImportRow,
  pollImportBatchUntilChecked,
  promoteImportBatch,
  refreshImportReadiness,
  requestImportAccess,
  runImportCheck,
  sourceCsvUrl,
  templateCsvUrl,
  type ImportAreaSummary,
  type ImportPromoteResult,
  type ImportBatchSummary,
  undoImportBatch,
  vehiclesCsvUrl,
} from "./partsImportApi";
import { supabase } from "../../../../utils/supabase/client";
import {
  buildImportColumnRows,
  DEFAULT_IMPORT_TEMPLATE_COLUMNS,
  headerAlignmentSummary,
  parseImportCsvHeaders,
  type ImportTemplateColumnDef,
} from "./importCsvHeader";
import { importErrorMessage, IMPORT_CHECK_FAILED_FALLBACK } from "./importErrorMessage";

function goToDataQuality() {
  const url = new URL(window.location.href);
  url.searchParams.set("page", "catalog-quality");
  window.history.pushState({ page: "catalog-quality" }, "", url.toString());
  window.dispatchEvent(new PopStateEvent("popstate"));
}

async function downloadAuthed(url: string, name: string) {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
  const res = await fetch(url, { headers: { Authorization: token ? `Bearer ${token}` : "" } });
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function countImportableRows(rows: Array<Record<string, unknown>>) {
  return rows.filter((r) => r.status === "valid" && r.accepted !== false).length;
}

export function ImportByAreaFlow() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const canImport = role !== null && hasPermission(role, "catalog.import");
  const pendingFile = useRef<File | null>(null);
  const [view, setView] = useState<"areas" | "ledger">("areas");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [area, setArea] = useState<ImportAreaSummary | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchMeta, setBatchMeta] = useState<Record<string, unknown>>({});
  const [batchCode, setBatchCode] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsedRowCount, setParsedRowCount] = useState<number | undefined>();
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{ checked: number; total: number } | null>(null);
  const [fileFailed, setFileFailed] = useState(false);
  const [fileErrorDetail, setFileErrorDetail] = useState<string | null>(null);
  const [headerBlocked, setHeaderBlocked] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [checkRows, setCheckRows] = useState<Array<Record<string, unknown>>>([]);
  const [checkTotal, setCheckTotal] = useState(0);
  const [checkPage, setCheckPage] = useState({ offset: 0, limit: 25, status: "", issue: "", q: "" });
  const [priorImport, setPriorImport] = useState<Record<string, unknown> | null>(null);
  const [promoteResult, setPromoteResult] = useState<ImportPromoteResult | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [shaPrefix, setShaPrefix] = useState("");
  const [drawerChanges, setDrawerChanges] = useState<Awaited<ReturnType<typeof fetchImportBatchChanges>> | null>(null);
  const [drawerUndoBlocked, setDrawerUndoBlocked] = useState<{
    batchCode: string;
    conflictCount: number;
    reasons: Array<{ line?: number | null; reason?: string }>;
  } | undefined>();
  const [undoPreflightForDone, setUndoPreflightForDone] = useState<Record<string, unknown> | null>(null);
  const [batchSummary, setBatchSummary] = useState<ImportBatchSummary | null>(null);
  const [fileBytes, setFileBytes] = useState<number | undefined>();
  const [uploadFailMeta, setUploadFailMeta] = useState<{ hexPrefix?: string; detectedType?: string } | null>(null);
  const [templateColumns, setTemplateColumns] = useState<ImportTemplateColumnDef[]>(DEFAULT_IMPORT_TEMPLATE_COLUMNS);

  /** Back to the area picker with nothing carried over (no file, batch, check rows or result). */
  const resetToAreas = () => {
    setStep(1);
    setArea(null);
    setBatchId(null);
    setBatchMeta({});
    setBatchCode("");
    setFileName("");
    setParsedRowCount(undefined);
    setChecking(false);
    setCheckProgress(null);
    setFileFailed(false);
    setFileErrorDetail(null);
    setHeaderBlocked(false);
    setHeaderError(null);
    setCheckRows([]);
    setCheckTotal(0);
    setCheckPage({ offset: 0, limit: 25, status: "", issue: "", q: "" });
    setPriorImport(null);
    setPromoteResult(null);
    setRefreshWarning(null);
    setShaPrefix("");
    setBatchSummary(null);
    setFileBytes(undefined);
    setUploadFailMeta(null);
    setParsedCsvHeaders(null);
    pendingFile.current = null;
  };
  const [parsedCsvHeaders, setParsedCsvHeaders] = useState<{ mapped: string[]; raw: string[] } | null>(null);
  const columnRows = useMemo(() => {
    if (parsedCsvHeaders?.mapped.length) {
      return buildImportColumnRows(templateColumns, parsedCsvHeaders.mapped, parsedCsvHeaders.raw);
    }
    return buildImportColumnRows(templateColumns, [], []);
  }, [templateColumns, parsedCsvHeaders]);

  const areasQuery = useQuery({ queryKey: ["parts-import-areas"], queryFn: fetchImportAreas, enabled: canImport });
  const specialTemplatesQuery = useQuery({
    queryKey: ["parts-import-special-templates"],
    queryFn: fetchImportSpecialTemplates,
    enabled: canImport,
  });
  const ledgerQuery = useQuery({
    queryKey: ["parts-import-ledger"],
    queryFn: () => fetchImportLedger(),
    enabled: view === "ledger" && canImport,
  });
  const metaQuery = useQuery({
    queryKey: ["parts-import-meta"],
    queryFn: fetchImportMeta,
    enabled: view === "ledger" && canImport,
  });

  const importableCount = useMemo(
    () => batchSummary?.importableCount ?? countImportableRows(checkRows),
    [batchSummary, checkRows],
  );

  if (role === null || !canImport) {
    return (
      <ImportStates
        mode="no-access"
        onRequestAccess={() => {
          void requestImportAccess()
            .then(() => toast.success("Access request sent to owner"))
            .catch((e) => toast.error(e instanceof Error ? e.message : "Request failed"));
        }}
      />
    );
  }

  async function download(url: string, name: string) {
    try {
      await downloadAuthed(url, name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function loadCheckPage(overrides?: Partial<typeof checkPage>) {
    if (!batchId) return;
    const params = { ...checkPage, ...overrides };
    setCheckPage(params);
    const detail = await fetchImportBatch(batchId, {
      status: params.status || undefined,
      issue: params.issue || undefined,
      q: params.q || undefined,
      limit: params.limit,
      offset: params.offset,
    });
    setCheckRows(detail.rows ?? []);
    setCheckTotal(Number(detail.total ?? detail.batch?.rows_total ?? detail.rows?.length ?? 0));
    setBatchMeta(detail.batch as Record<string, unknown>);
    try {
      const summary = await fetchImportBatchSummary(batchId);
      setBatchSummary(summary);
    } catch {
      setBatchSummary(null);
    }
  }

  async function runCheckForBatch(id: string) {
    const check = await runImportCheck(id);
    if (check.priorImport) setPriorImport(check.priorImport);
    if (check.async) {
      const detail = await pollImportBatchUntilChecked(id, {
        onProgress: (batch) => {
          setCheckProgress({
            checked: Number(batch.rows_checked ?? 0),
            total: Number(batch.rows_total ?? 0),
          });
        },
      });
      return detail;
    }
    return fetchImportBatch(id, { limit: checkPage.limit, offset: 0 });
  }

  async function applyBatchDetail(detail: Awaited<ReturnType<typeof fetchImportBatch>>) {
    const batch = detail.batch as Record<string, unknown>;
    setBatchMeta(batch);
    if (String(batch.status) === "failed") {
      const msg = importErrorMessage(batch.failure_message) || IMPORT_CHECK_FAILED_FALLBACK;
      setFileErrorDetail(msg);
      setHeaderError(msg);
      if (/parser|upload|xlsx|binary|header|schema|empty file/i.test(msg)) {
        setFileFailed(true);
        setHeaderBlocked(true);
      }
      throw new Error(msg);
    }
    setCheckRows(detail.rows ?? []);
    setCheckTotal(Number(detail.total ?? batch.rows_total ?? detail.rows?.length ?? 0));
    setStep(3);
    setCheckPage((p) => ({ ...p, offset: 0 }));
    try {
      const summary = await fetchImportBatchSummary(String(batch.id ?? batchId));
      setBatchSummary(summary);
    } catch {
      setBatchSummary(null);
    }
  }

  function applyFileHeaderAnalysis(text: string, cols: ImportTemplateColumnDef[]) {
    const { headers, mapped, headerErrors } = parseImportCsvHeaders(text, cols);
    setParsedCsvHeaders({ mapped, raw: headers });
    const rows = buildImportColumnRows(cols, mapped, headers);
    const summary = headerAlignmentSummary(rows, mapped);
    setHeaderBlocked(headerErrors.length > 0);
    setHeaderError(headerErrors.length ? headerErrors.join("; ") : null);
    return summary;
  }

  function refreshHeaderCompare() {
    const file = pendingFile.current;
    if (!file?.size) return;
    void file
      .text()
      .then((text) => {
        applyFileHeaderAnalysis(text, templateColumns);
      })
      .catch(() => {
        setHeaderBlocked(true);
        setHeaderError("Could not read file");
      });
  }

  async function loadTemplateSchema(areaId: string, importKind = "area") {
    try {
      const { columns } = await fetchImportTemplateSchema(areaId, importKind);
      const cols = columns?.length ? columns : DEFAULT_IMPORT_TEMPLATE_COLUMNS;
      setTemplateColumns(cols);
      return cols;
    } catch {
      setTemplateColumns(DEFAULT_IMPORT_TEMPLATE_COLUMNS);
      return DEFAULT_IMPORT_TEMPLATE_COLUMNS;
    }
  }

  function assignFile(file: File, cols = templateColumns) {
    if (!file.size && !file.name) {
      pendingFile.current = null;
      setFileName("");
      setParsedRowCount(undefined);
      setParsedCsvHeaders(null);
      setHeaderBlocked(false);
      setHeaderError(null);
      return;
    }
    pendingFile.current = file;
    setFileName(file.name);
    setFileBytes(file.size);
    setFileFailed(false);
    setFileErrorDetail(null);
    void file.text().then((text) => {
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      setParsedRowCount(Math.max(0, lines.length - 1));
      applyFileHeaderAnalysis(text, cols);
    }).catch(() => {
      setParsedRowCount(undefined);
      setHeaderBlocked(true);
      setHeaderError("Could not read file");
    });
  }

  function pasteToFile(text: string) {
    const date = new Date().toISOString().slice(0, 10);
    const file = new File([text], `pasted-${date}.csv`, { type: "text/csv" });
    assignFile(file);
  }

  async function onUploadAndCheck() {
    const file = pendingFile.current;
    if (!area || !file) return;
    setChecking(true);
    setCheckProgress(null);
    setHeaderError(null);
    setFileFailed(false);
    try {
      const { batch } = await createImportBatch(area.id, file.name, area.importKind ?? "area");
      const id = String(batch.id);
      setBatchId(id);
      setBatchCode(String(batch.code ?? ""));
      const upload = await uploadImportBatchSource(id, file);
      setFileBytes(upload.bytes);
      setUploadFailMeta(null);
      const detail = await runCheckForBatch(id);
      await applyBatchDetail(detail);
    } catch (e) {
      const err = e as Error & { status?: number; hexPrefix?: string; detectedType?: string };
      if (err.hexPrefix || err.detectedType) {
        setUploadFailMeta({ hexPrefix: err.hexPrefix, detectedType: err.detectedType });
      }
      const msg = importErrorMessage(e) || IMPORT_CHECK_FAILED_FALLBACK;
      setHeaderError(msg);
      setFileErrorDetail(msg);
      if (err.status === 422 || uploadFailMeta || err.hexPrefix) {
        setFileFailed(true);
        setHeaderBlocked(true);
      } else if (/parser|csv|header|422|read|schema|upload|xlsx|binary/i.test(msg)) {
        setFileFailed(true);
        setHeaderBlocked(true);
      }
      toast.error(msg);
    } finally {
      setChecking(false);
      setCheckProgress(null);
    }
  }

  async function onCheckAgain() {
    if (!batchId) return;
    setChecking(true);
    try {
      const detail = await runCheckForBatch(batchId);
      await applyBatchDetail(detail);
      toast.success("Check complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setChecking(false);
      setCheckProgress(null);
    }
  }

  async function onPromote() {
    if (!batchId) return;
    setPromoting(true);
    try {
      const res = await promoteImportBatch(batchId);
      const result = res.result ?? null;
      setPromoteResult(result);
      setRefreshWarning(result?.refreshWarning ?? null);
      const detail = await fetchImportBatch(batchId, { limit: 500, offset: 0 });
      setCheckRows(detail.rows ?? []);
      setBatchMeta(detail.batch as Record<string, unknown>);
      const batch = detail.batch as Record<string, unknown>;
      setShaPrefix(String(batch.ledger_hash ?? batch.file_sha256 ?? "").slice(0, 12));
      setStep(4);
      void queryClient.invalidateQueries({ queryKey: ["parts-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["parts-import-ledger"] });
      void queryClient.invalidateQueries({ queryKey: ["parts-import-areas"] });
      toast.success("Import complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promote failed");
    } finally {
      setPromoting(false);
    }
  }

  async function loadDrawer(batch: Record<string, unknown>) {
    const id = String(batch.id ?? "");
    setDrawerChanges(null);
    setDrawerUndoBlocked(undefined);
    try {
      const [changes, preflight] = await Promise.all([
        fetchImportBatchChanges(id),
        fetchUndoPreflight(id),
      ]);
      setDrawerChanges(changes);
      const ok = preflight.ok === true;
      if (!ok) {
        const reasons = (preflight.reasons as Array<{ line?: number | null; reason?: string }>) ?? [];
        setDrawerUndoBlocked({
          batchCode: String(batch.code ?? ""),
          conflictCount: reasons.length,
          reasons,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load batch detail");
    }
  }

  async function runUndoPreflightForDone() {
    if (!batchId) return;
    try {
      const preflight = await fetchUndoPreflight(batchId);
      setUndoPreflightForDone(preflight);
      if (preflight.ok === false) {
        const reasons = (preflight.reasons as Array<{ line?: number | null; reason?: string }>) ?? [];
        toast.error(`Undo blocked — ${reasons.length} conflicts`);
        return;
      }
      toast.message("Undo preflight OK — use Import ledger to confirm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preflight failed");
    }
  }

  const signedName =
    user?.user_metadata?.name ??
    user?.user_metadata?.full_name ??
    user?.email?.split("@")[0] ??
    "";

  return (
    <div className="find-parts-flow space-y-6 px-space-xl pb-space-xl">
      {view === "areas" ? (
        <ImportStepper step={step} areaName={area?.name} fileName={fileName || undefined} />
      ) : null}

      {view === "ledger" ? (
        <ImportLedger
          areas={areasQuery.data?.areas ?? []}
          items={ledgerQuery.data?.items ?? []}
          ledgerMeta={metaQuery.data}
          onBackToAreas={() => { setView("areas"); setStep(1); }}
          onNewBatch={() => { setView("areas"); setStep(1); }}
          onSync={() => { void ledgerQuery.refetch(); void areasQuery.refetch(); }}
          onExportLedger={() => { void download(ledgerCsvUrl(), "parts-import-ledger.csv"); }}
          onLoadDrawer={(batch) => { void loadDrawer(batch); }}
          drawerChanges={drawerChanges}
          drawerUndoBlocked={drawerUndoBlocked}
          onDownloadFailed={(batch) => {
            const id = String(batch.id ?? "");
            if (id) void download(failedCsvUrl(id), `${batch.file_name ?? "failed"}-errors.csv`);
          }}
          onUndoBatch={(batch) => {
            const id = String(batch.id ?? "");
            if (!id) return Promise.resolve();
            return undoImportBatch(id)
              .then(() => {
                toast.success("Import undone");
                void queryClient.invalidateQueries({ queryKey: ["parts-import-ledger"] });
                void queryClient.invalidateQueries({ queryKey: ["parts-import-areas"] });
                void queryClient.invalidateQueries({ queryKey: ["parts-import-meta"] });
              })
              .catch((e) => {
                toast.error(e instanceof Error ? e.message : "Undo failed");
                throw e;
              });
          }}
        />
      ) : null}

      {view === "areas" && step === 1 ? (
        <ImportAreaPicker
          areas={areasQuery.data?.areas ?? []}
          specialTemplates={specialTemplatesQuery.data?.templates ?? []}
          onPick={(picked) => {
            // Every template starts clean — a file chosen for another template is never carried over.
            resetToAreas();
            setArea(picked);
            setStep(2);
            void loadTemplateSchema(picked.id, picked.importKind ?? "area");
          }}
          onOpenLedger={() => setView("ledger")}
        />
      ) : null}

      {view === "areas" && step === 2 && area ? (
        checking ? (
          <ImportStates
            mode="checking"
            fileName={fileName}
            checkProgress={checkProgress ?? { checked: 0, total: parsedRowCount ?? 0 }}
            onViewJobs={() => goDominionPage("platform-ops")}
            onCancelCheck={() => {
              if (batchId) {
                void cancelImportCheck(batchId)
                  .then(() => { setChecking(false); toast.message("Check cancelled"); })
                  .catch((e) => toast.error(e instanceof Error ? e.message : "Cancel failed"));
              }
            }}
          />
        ) : fileFailed ? (
          <ImportStates
            mode="file-failed"
            fileName={fileName}
            fileErrorDetail={fileErrorDetail ?? headerError ?? undefined}
            onRetry={() => { setFileFailed(false); void onUploadAndCheck(); }}
            onChooseAnother={() => {
              setFileFailed(false);
              setHeaderError(null);
              setHeaderBlocked(false);
              pendingFile.current = null;
              setFileName("");
            }}
          />
        ) : (
          <ImportUploadStep
            areaName={area.name}
            areaCode={area.opCode ?? "AREA"}
            iconKey={area.iconKey}
            sortOrder={area.sortOrder}
            partTypes={area.partTypes}
            templateVersion={area.templateVersion}
            columnRows={columnRows}
            checking={checking}
            headerError={headerError}
            headerBlocked={headerBlocked}
            fileName={fileName}
            rowCount={parsedRowCount}
            fileBytes={fileBytes}
            onBackToAreas={resetToAreas}
            onDownloadTemplate={() => {
              void download(
                templateCsvUrl(area.id, area.importKind ?? "area"),
                `${area.name}-template.csv`,
              );
            }}
            onDownloadVehicles={() => { void download(vehiclesCsvUrl(), "vehicles.csv"); }}
            onFile={assignFile}
            onClearFile={() => assignFile(new File([], ""))}
            onPasteCsv={pasteToFile}
            onRefreshHeaderCompare={refreshHeaderCompare}
            onUploadAndCheck={() => { void onUploadAndCheck(); }}
          />
        )
      ) : null}

      {view === "areas" && step === 3 && batchId ? (
        <ImportCheckStep
          batchId={batchId}
          batchCode={batchCode}
          fileName={fileName}
          areaName={area?.name}
          templateVersion={area?.templateVersion}
          batch={batchMeta}
          rows={checkRows}
          total={checkTotal}
          importableCount={importableCount}
          batchSummary={batchSummary}
          priorImport={priorImport}
          onViewPriorImport={() => setView("ledger")}
          onSelectAllAccepted={(accepted) => {
            if (!batchId) return;
            void patchImportRowsBulk(batchId, accepted)
              .then(() => loadCheckPage())
              .catch((e) => toast.error(e instanceof Error ? e.message : "Bulk update failed"));
          }}
          pageOffset={checkPage.offset}
          pageLimit={checkPage.limit}
          onFilterChange={(params) => {
            void loadCheckPage({
              status: params.status ?? "",
              issue: params.issue ?? "",
              q: params.q ?? "",
              offset: 0,
            });
          }}
          onPagePrev={() => { void loadCheckPage({ offset: Math.max(0, checkPage.offset - checkPage.limit) }); }}
          onPageNext={() => { void loadCheckPage({ offset: checkPage.offset + checkPage.limit }); }}
          onPromote={() => { void onPromote(); }}
          promoting={promoting}
          onExportRaw={() => { void download(sourceCsvUrl(batchId), fileName || "source.csv"); }}
          onAuditTrail={() => goDominionPage("activity-log")}
          onCheckAgain={() => { void onCheckAgain(); }}
          onCancel={resetToAreas}
          onDownloadFailed={() => { void download(failedCsvUrl(batchId), `${fileName || "import"}-failed.csv`); }}
          onToggleAccepted={(line, accepted) => {
            void patchImportRow(batchId, line, { accepted })
              .then(() => loadCheckPage())
              .catch((e) => toast.error(e instanceof Error ? e.message : "Row update failed"));
          }}
          onPatchRow={(line) => {
            void patchImportRow(batchId, line, {})
              .then(() => loadCheckPage())
              .catch((e) => toast.error(e instanceof Error ? e.message : "Row update failed"));
          }}
        />
      ) : null}

      {view === "areas" && step === 4 && area ? (
        <>
          {undoPreflightForDone?.ok === false ? (
            <ImportStates
              mode="undo-blocked"
              undoBlocked={{
                batchCode,
                conflictCount: ((undoPreflightForDone.reasons as unknown[]) ?? []).length,
                reasons: (undoPreflightForDone.reasons as Array<{ line?: number | null; reason?: string }>) ?? [],
              }}
            />
          ) : null}
          <ImportDoneStep
            areaName={area.name}
            batchCode={batchCode}
            fileName={fileName}
            templateVersion={area.templateVersion}
            refreshWarning={refreshWarning}
            promoteResult={promoteResult}
            batch={batchMeta}
            shaPrefix={shaPrefix}
            signedBy={signedName}
            signedRole={role ?? undefined}
            commitTime={batchMeta.promoted_at ? new Date(String(batchMeta.promoted_at)).toUTCString() : undefined}
            onRefresh={() => {
              void refreshImportReadiness(batchId ?? undefined)
                .then(() => {
                  setRefreshWarning(null);
                  toast.success("Find parts refresh queued");
                })
                .catch((e) => toast.error(e instanceof Error ? e.message : "Refresh failed"));
            }}
            onLedger={() => { setView("ledger"); }}
            onDataQuality={goToDataQuality}
            onImportMore={() => {
              setStep(2);
              setFileName("");
              pendingFile.current = null;
              setParsedCsvHeaders(null);
              setPromoteResult(null);
            }}
            onBackToAreas={resetToAreas}
            onUndoIngestion={() => { void runUndoPreflightForDone(); }}
          />
          <ImportBatchRecordsTable
            rows={checkRows}
            fileName={fileName}
            batchCode={batchCode}
            shaPrefix={shaPrefix}
            onLedger={() => setView("ledger")}
            onUndoIngestion={() => { void runUndoPreflightForDone(); }}
          />
        </>
      ) : null}
    </div>
  );
}
