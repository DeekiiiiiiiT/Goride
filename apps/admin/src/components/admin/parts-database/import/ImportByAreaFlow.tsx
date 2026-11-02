// Stitch: dominion-redesign/parts_import_pick_area
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthContext";
import { hasPermission } from "../../../../utils/permissions";
import { ImportAreaPicker } from "./ImportAreaPicker";
import { ImportCheckStep } from "./ImportCheckStep";
import { ImportDoneStep, ImportBatchRecordsTable } from "./ImportDoneStep";
import { ImportLedger } from "./ImportLedger";
import { ImportStates } from "./ImportStates";
import { ImportStepper } from "./ImportStepper";
import { ImportUploadStep } from "./ImportUploadStep";
import {
  createImportBatch,
  failedCsvUrl,
  fetchImportAreas,
  fetchImportBatch,
  fetchImportLedger,
  ledgerCsvUrl,
  patchImportRow,
  pollImportBatchUntilChecked,
  promoteImportBatch,
  requestImportAccess,
  runImportCheck,
  sourceCsvUrl,
  templateCsvUrl,
  type ImportAreaSummary,
  undoImportBatch,
  vehiclesCsvUrl,
} from "./partsImportApi";
import { supabase } from "../../../../utils/supabase/client";

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

export function ImportByAreaFlow() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const canImport = hasPermission(role, "catalog.import");
  const pendingFile = useRef<File | null>(null);
  const [view, setView] = useState<"areas" | "ledger">("areas");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [area, setArea] = useState<ImportAreaSummary | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchCode, setBatchCode] = useState("");
  const [fileName, setFileName] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{ checked: number; total: number } | null>(null);
  const [fileFailed, setFileFailed] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [checkRows, setCheckRows] = useState<Array<Record<string, unknown>>>([]);
  const [validCount, setValidCount] = useState(0);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [shaPrefix, setShaPrefix] = useState("");

  const areasQuery = useQuery({ queryKey: ["parts-import-areas"], queryFn: fetchImportAreas, enabled: canImport });
  const ledgerQuery = useQuery({
    queryKey: ["parts-import-ledger"],
    queryFn: () => fetchImportLedger(),
    enabled: view === "ledger" && canImport,
  });

  if (!canImport) {
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

  async function runCheckForBatch(id: string) {
    const check = await runImportCheck(id);
    if (check.async) {
      const detail = await pollImportBatchUntilChecked(id, {
        onProgress: (batch) => {
          setCheckProgress({
            checked: Number(batch.rows_checked ?? 0),
            total: Number(batch.row_count ?? batch.rows_total ?? 0),
          });
        },
      });
      return detail;
    }
    return fetchImportBatch(id, { limit: 500, offset: 0 });
  }

  async function applyBatchDetail(detail: Awaited<ReturnType<typeof fetchImportBatch>>) {
    const batch = detail.batch as Record<string, unknown>;
    if (String(batch.status) === "failed") {
      setFileFailed(true);
      setHeaderError(String(batch.failure_message ?? "Check failed"));
      throw new Error(String(batch.failure_message ?? "Check failed"));
    }
    setCheckRows(detail.rows ?? []);
    const valid = (detail.rows ?? []).filter((r) => r.status === "valid" || r.status === "labelled").length;
    setValidCount(valid);
    setStep(3);
  }

  async function onFile(file: File) {
    if (!area) return;
    pendingFile.current = file;
    setFileName(file.name);
    setHeaderError(null);
    setFileFailed(false);
  }

  async function onUploadAndCheck() {
    const file = pendingFile.current;
    if (!area || !file) return;
    setChecking(true);
    setCheckProgress(null);
    setHeaderError(null);
    setFileFailed(false);
    try {
      const { batch, uploadUrl } = await createImportBatch(area.id, file.name);
      const id = String(batch.id);
      setBatchId(id);
      setBatchCode(String(batch.code ?? ""));
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": "text/csv" } });
      if (!put.ok) throw new Error("Upload failed");
      const detail = await runCheckForBatch(id);
      await applyBatchDetail(detail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Check failed";
      setHeaderError(msg);
      if (/parser|csv|header|422|read/i.test(msg)) setFileFailed(true);
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
      setRefreshWarning((res.result as { refreshWarning?: string })?.refreshWarning ?? null);
      const detail = await fetchImportBatch(batchId, { limit: 500 });
      setCheckRows(detail.rows ?? []);
      const batch = detail.batch as Record<string, unknown>;
      setShaPrefix(String(batch.file_sha256 ?? "").slice(0, 12));
      setStep(4);
      void queryClient.invalidateQueries({ queryKey: ["parts-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["parts-import-ledger"] });
      toast.success("Import complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promote failed");
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="space-y-6">
      <ImportStepper step={step} areaName={area?.name} fileName={fileName || undefined} />
      {checking ? (
        <ImportStates
          mode="checking"
          fileName={fileName}
          checkProgress={checkProgress ?? { checked: 0, total: 0 }}
          onViewJobs={() => toast.message("Open Platform Ops → background jobs")}
        />
      ) : null}
      {fileFailed && step === 2 ? (
        <ImportStates
          mode="file-failed"
          onRetry={() => { setFileFailed(false); void onUploadAndCheck(); }}
          onChooseAnother={() => { setFileFailed(false); setHeaderError(null); pendingFile.current = null; setFileName(""); }}
        />
      ) : null}
      {view === "ledger" ? (
        <ImportLedger
          items={ledgerQuery.data?.items ?? []}
          onNewBatch={() => { setView("areas"); setStep(1); }}
          onSelect={() => undefined}
          onExportLedger={() => { void download(ledgerCsvUrl(), "parts-import-ledger.csv"); }}
          onDownloadFailed={(batch) => {
            const id = String(batch.id ?? "");
            if (id) void download(failedCsvUrl(id), `${batch.file_name ?? "failed"}-errors.csv`);
          }}
          onUndoBatch={(batch) => {
            const id = String(batch.id ?? "");
            if (!id) return;
            void undoImportBatch(id)
              .then(() => {
                toast.success("Import undone");
                void queryClient.invalidateQueries({ queryKey: ["parts-import-ledger"] });
              })
              .catch((e) => toast.error(e instanceof Error ? e.message : "Undo failed"));
          }}
        />
      ) : null}
      {view === "areas" && step === 1 ? (
        <ImportAreaPicker
          areas={areasQuery.data?.areas ?? []}
          onPick={(picked) => { setArea(picked); setStep(2); }}
          onOpenLedger={() => setView("ledger")}
        />
      ) : null}
      {view === "areas" && step === 2 && area ? (
        <ImportUploadStep
          areaName={area.name}
          areaCode={area.opCode ?? "AREA"}
          templateVersion={area.templateVersion}
          checking={checking}
          headerError={headerError}
          fileName={fileName}
          onDownloadTemplate={() => { void download(templateCsvUrl(area.id), `${area.name}-template.csv`); }}
          onDownloadVehicles={() => { void download(vehiclesCsvUrl(), "vehicles.csv"); }}
          onFile={(f) => { void onFile(f); }}
          onUploadAndCheck={() => { void onUploadAndCheck(); }}
        />
      ) : null}
      {view === "areas" && step === 3 && batchId ? (
        <ImportCheckStep
          batchCode={batchCode}
          fileName={fileName}
          areaName={area?.name}
          rows={checkRows}
          validCount={validCount}
          onPromote={() => { void onPromote(); }}
          promoting={promoting}
          onExportRaw={() => { void download(sourceCsvUrl(batchId), fileName || "source.csv"); }}
          onCheckAgain={() => { void onCheckAgain(); }}
          onDownloadFailed={() => { void download(failedCsvUrl(batchId), `${fileName || "import"}-failed.csv`); }}
          onPatchRow={(line) => {
            void patchImportRow(batchId, line, {})
              .then(() => fetchImportBatch(batchId, { limit: 500 }))
              .then((detail) => {
                setCheckRows(detail.rows ?? []);
                toast.success("Row updated");
              })
              .catch((e) => toast.error(e instanceof Error ? e.message : "Row update failed"));
          }}
        />
      ) : null}
      {view === "areas" && step === 4 && area ? (
        <>
          <ImportDoneStep
            areaName={area.name}
            batchCode={batchCode}
            templateVersion={area.templateVersion}
            refreshWarning={refreshWarning}
            importedCount={validCount}
            rows={checkRows}
            shaPrefix={shaPrefix}
            onRefresh={() => { toast.message("Refresh queued"); }}
            onLedger={() => setView("ledger")}
            onDataQuality={goToDataQuality}
            onImportMore={() => { setStep(2); setFileName(""); pendingFile.current = null; }}
            onBackToAreas={() => { setStep(1); setArea(null); setBatchId(null); }}
          />
          <ImportBatchRecordsTable rows={checkRows} />
        </>
      ) : null}
    </div>
  );
}
