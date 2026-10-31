// Stitch: dominion-redesign/5ba99edc175b45389a9500476ceb87cd
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProblemsEditor } from "./find-parts/ProblemsEditor";
import { useAuth } from "../../auth/AuthContext";
import { useRef, useState } from "react";
import { fetchAdvancedTables, fetchImportBatches } from "./partsDatabaseApi";
import { partsEnterpriseApi } from "../../../services/partSourcingService";
import { supabase } from "../../../utils/supabase/client";
import { parsePartsDatabaseImportCsv } from "@roam/types/partsDatabaseImportCsv";
import { toast } from "sonner";

const CSV_HEADER = "vehicle,manufacturer,part_number,part_name,part_kind,category_slug,job,position,year_from,year_to,evidence_url";

async function readCsvFile(file: File): Promise<string> {
  try {
    const text = await file.text();
    if (text.trim()) return text;
  } catch {
    // Fall through to FileReader (helps with some OneDrive / locked files).
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file"));
    reader.readAsText(file);
  });
}

function formatImportErrors(errors: unknown): string {
  if (!errors) return "";
  if (Array.isArray(errors)) return errors.map((item) => String(item)).filter(Boolean).join(" ");
  if (typeof errors === "string") return errors;
  return "";
}

function importErrorCount(errors: unknown): number {
  if (Array.isArray(errors)) return errors.length;
  return errors ? 1 : 0;
}

function goToDataQuality() {
  const url = new URL(window.location.href);
  url.searchParams.set("page", "catalog-quality");
  window.history.pushState({ page: "catalog-quality" }, "", url.toString());
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function ImportAdvancedTab({
  advanced,
  onOpenVehicle,
  onProblemsOpenChange,
}: {
  advanced: boolean;
  onOpenVehicle?: (id: string) => void;
  onProblemsOpenChange?: (open: boolean) => void;
}) {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");
  const [note, setNote] = useState("");
  const [noteOk, setNoteOk] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [importing, setImporting] = useState(false);
  const [successOverlay, setSuccessOverlay] = useState<{ applied: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAfterPickRef = useRef<"import" | "check" | null>(null);
  const [offset, setOffset] = useState(0);
  const tables = useQuery({ queryKey: ["advanced-tables", offset], queryFn: () => fetchAdvancedTables(offset), enabled: advanced });
  const batches = useQuery({ queryKey: ["import-batches"], queryFn: fetchImportBatches });

  async function token() {
    return (await supabase.auth.getSession()).data.session?.access_token ?? "";
  }

  function setStatus(message: string, ok = false) {
    setNote(message);
    setNoteOk(ok);
  }

  async function loadImportText(): Promise<string> {
    const picked = fileInputRef.current?.files?.[0];
    if (picked) {
      const fromFile = (await readCsvFile(picked)).trim();
      if (fromFile) {
        setCsv(fromFile);
        return fromFile;
      }
      throw new Error(
        `${picked.name} looks empty. If it is on OneDrive, open it once locally or copy the rows into the box below.`,
      );
    }
    return csv.trim();
  }

  async function applyImport(checkOnly: boolean, text: string) {
    const parsed = parsePartsDatabaseImportCsv(text);
    if (parsed.errors.length) {
      setStatus(parsed.errors.slice(0, 5).join(" "));
      return;
    }
    if (!parsed.rows.length) {
      setStatus("That file has a header but no data rows. Add rows below the header line.");
      return;
    }
    if (checkOnly) {
      setStatus(`${parsed.rows.length} row(s) ready to import.`, true);
      return;
    }
    const accessToken = await token();
    if (!accessToken) {
      setStatus("Your session expired. Sign in again and retry.");
      return;
    }
    const result = await partsEnterpriseApi.importRows(accessToken, parsed.rows) as {
      result?: { batchId?: string; applied?: number; errors?: unknown };
    };
    const body = result.result;
    setBatchId(String(body?.batchId ?? ""));
    const errText = formatImportErrors(body?.errors);
    const applied = body?.applied ?? 0;
    const skipped = importErrorCount(body?.errors);
    if (applied > 0) {
      setSuccessOverlay({ applied, skipped });
      void queryClient.invalidateQueries({ queryKey: ["parts-overview"] });
      toast.success(`Imported ${applied} row${applied === 1 ? "" : "s"}`);
      setStatus(
        `Imported ${applied}.${skipped ? ` ${skipped} row(s) skipped.` : ""} New rows show as Needs checking in Data quality.`,
        true,
      );
    } else {
      setSuccessOverlay(null);
      setStatus(errText || "Nothing was imported. Check category slugs and source links.");
    }
    await batches.refetch();
  }

  function openCsvPicker(next: "import" | "check") {
    pendingAfterPickRef.current = next;
    setStatus("Choose your .csv file…");
    fileInputRef.current?.click();
  }

  async function run(checkOnly: boolean) {
    if (!checkOnly) setSuccessOverlay(null);
    setImporting(true);
    try {
      let text = "";
      try {
        text = await loadImportText();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Could not read the file");
        return;
      }
      if (!text) {
        openCsvPicker(checkOnly ? "check" : "import");
        return;
      }
      const preview = parsePartsDatabaseImportCsv(text);
      if (!preview.rows.length && preview.errors.length === 0 && !fileInputRef.current?.files?.[0]) {
        openCsvPicker(checkOnly ? "check" : "import");
        return;
      }
      await applyImport(checkOnly, text);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : checkOnly ? "Check failed" : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function onFilePicked(file: File) {
    setImporting(true);
    try {
      const text = (await readCsvFile(file)).trim();
      if (!text) {
        setStatus(`${file.name} looks empty. Paste the CSV into the box below instead.`);
        return;
      }
      setCsv(text);
      const rowCount = parsePartsDatabaseImportCsv(text).rows.length;
      const next = pendingAfterPickRef.current ?? "import";
      pendingAfterPickRef.current = null;
      if (rowCount === 0) {
        setStatus(`${file.name} has no data rows under the header.`);
        return;
      }
      setStatus(`Loading ${file.name} (${rowCount} rows)…`);
      await applyImport(next === "check", text);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {successOverlay ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-success-title"
        >
          <div className="bg-surface-container-lowest rounded-2xl shadow-lg max-w-md w-full p-6 space-y-4 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-tertiary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-[32px] text-tertiary" style={{ fontVariationSettings: '"FILL" 1' }}>check_circle</span>
            </div>
            <div>
              <h3 id="import-success-title" className="text-lg font-headline font-bold text-on-surface">Import complete</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                {successOverlay.applied} part row{successOverlay.applied === 1 ? "" : "s"} added to the catalog.
                {successOverlay.skipped ? ` ${successOverlay.skipped} row(s) were skipped.` : ""}
              </p>
              <p className="text-xs text-on-surface-variant mt-2">They show as <strong>Needs checking</strong> until you confirm them in Data quality.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                className="px-4 py-2 bg-secondary text-on-secondary rounded-lg text-sm font-medium"
                onClick={() => {
                  setSuccessOverlay(null);
                  goToDataQuality();
                }}
              >
                View in Data quality
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg text-sm font-medium"
                onClick={() => setSuccessOverlay(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold">Batch CSV import</h2>
        <p className="text-xs text-on-surface-variant">
          Choose a .csv file (Import runs automatically) or paste rows below. Vehicle can be a catalog id or text like Toyota Roomy M900A 2019.
        </p>
        <textarea
          className="w-full bg-surface-container-low font-mono text-xs rounded-lg p-3 min-h-28"
          value={csv}
          placeholder={`Paste CSV here. First line should be:\n${CSV_HEADER}`}
          onChange={(event) => {
            setCsv(event.target.value);
            setNote("");
          }}
        />
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void onFilePicked(file);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-3 text-sm items-center">
          <button
            type="button"
            className="bg-surface-container-high text-on-surface px-3 py-1.5 rounded-lg disabled:opacity-60"
            disabled={importing}
            onClick={() => openCsvPicker("import")}
          >
            Choose .csv file
          </button>
          <button
            type="button"
            className="bg-secondary text-on-secondary px-3 py-1.5 rounded-lg disabled:opacity-60"
            disabled={importing}
            onClick={() => { void run(false); }}
          >
            {importing ? "Working…" : "Import"}
          </button>
          <button type="button" disabled={importing} onClick={() => { void run(true); }}>Check file</button>
          <button
            type="button"
            disabled={importing || !batchId}
            onClick={() => {
              void (async () => {
                try {
                  if (!batchId) return;
                  await partsEnterpriseApi.undoImport(await token(), batchId);
                  setStatus("Last import undone.", true);
                  await batches.refetch();
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Undo failed");
                }
              })();
            }}
          >
            Undo last import
          </button>
        </div>
        <div className="space-y-1">
          {(batches.data?.items ?? []).map((batch) => (
            <div key={batch.import_batch_id} className="flex items-center justify-between text-xs">
              <span>{new Date(batch.imported_at).toLocaleString()} · {batch.row_count} rows</span>
              <button
                type="button"
                className="text-secondary"
                onClick={() => {
                  void (async () => {
                    try {
                      await partsEnterpriseApi.undoImport(await token(), batch.import_batch_id);
                      setStatus("Import undone.", true);
                      await batches.refetch();
                    } catch (err) {
                      setStatus(err instanceof Error ? err.message : "Undo failed");
                    }
                  })();
                }}
              >
                Undo
              </button>
            </div>
          ))}
        </div>
        {successOverlay ? (
          <div className="mt-2 p-3.5 bg-surface-container-low rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-semibold text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                Imported {successOverlay.applied}
              </span>
              {successOverlay.skipped ? (
                <>
                  <span className="text-outline-variant text-xs">·</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-highest text-error font-semibold text-[11px]">
                    {successOverlay.skipped} rows skipped
                  </span>
                </>
              ) : null}
            </div>
            <button type="button" className="text-xs font-semibold text-secondary hover:text-secondary-dim flex items-center gap-1" onClick={goToDataQuality}>
              View in Data quality
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
        ) : null}
        {note && !successOverlay ? (
          <p className={noteOk ? "text-xs text-secondary" : "text-xs text-error"} role="status">{note}</p>
        ) : null}
      </section>
      {advanced ? <ProblemsEditor owner={role === "platform_owner"} onEditingChange={onProblemsOpenChange} /> : null}
      {advanced ? (
        <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold">Advanced: raw catalog tables (read-only)</h2>
          <div className="flex gap-4 text-xs">
            <span>Parts ({tables.data?.parts.count ?? 0})</span>
            <span>Same-part brands ({tables.data?.brands.count ?? 0})</span>
            <span>Listings ({tables.data?.listings.count ?? 0})</span>
          </div>
          <div className="grid grid-cols-6 text-xs font-semibold text-on-surface-variant">
            <span>Part ID</span><span>Category</span><span>Name</span><span>Base OEM number</span><span>Created</span><span>Actions</span>
          </div>
          {(tables.data?.parts.rows ?? []).map((row) => (
            <div key={String(row.id)} className="grid grid-cols-6 text-xs py-1">
              <span className="truncate">{String(row.id)}</span>
              <span className="truncate">{String(row.category_id ?? "")}</span>
              <span>{String(row.name ?? "")}</span>
              <span>{String(row.oem_part_number ?? "")}</span>
              <span />
              <span />
            </div>
          ))}
          <div className="grid grid-cols-5 text-xs font-semibold text-on-surface-variant pt-3">
            <span>Link ID</span><span>Master part</span><span>Aftermarket brand</span><span>Replacement number</span><span>Cross type</span>
          </div>
          {(tables.data?.brands.rows ?? []).map((row) => (
            <div key={String(row.id)} className="grid grid-cols-5 text-xs py-1">
              <span className="truncate">{String(row.interchange_group_id ?? "")}</span>
              <span className="truncate">{String(row.id)}</span>
              <span>{String(row.manufacturer ?? "")}</span>
              <span>{String(row.oem_part_number ?? "")}</span>
              <span>brand</span>
            </div>
          ))}
          <div className="grid grid-cols-5 text-xs font-semibold text-on-surface-variant pt-3">
            <span>Listing ID</span><span>Vehicle variant</span><span>Part</span><span>Match kind</span><span>Source confidence</span>
          </div>
          {(tables.data?.listings.rows ?? []).map((row) => (
            <div key={String(row.id)} className="grid grid-cols-5 text-xs py-1">
              <span className="truncate">{String(row.id)}</span>
              <span className="truncate">{String(row.vehicle_catalog_id ?? "")}</span>
              <span className="truncate">{String(row.interchange_group_id ?? "")}</span>
              <span>{String(row.position ?? "listing")}</span>
              <button type="button" className="text-secondary text-left" onClick={() => onOpenVehicle?.(String(row.vehicle_catalog_id ?? ""))}>Open on vehicle</button>
            </div>
          ))}
          <div className="flex gap-3 text-xs pt-3">
            <button type="button" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 50))}>Previous</button>
            <button
              type="button"
              disabled={!tables.data || offset + 50 >= Math.max(tables.data.parts.count, tables.data.brands.count, tables.data.listings.count)}
              onClick={() => setOffset((value) => value + 50)}
            >Next</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
