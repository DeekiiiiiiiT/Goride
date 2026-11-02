// Stitch: dominion-redesign/parts_import_template_upload
import { useState } from "react";
import { catSysChip, materialIconForArea } from "./importAreaIcons";
import { headerAlignmentSummary, type ImportColumnRow } from "./importCsvHeader";
import { ImportRemediationGuide } from "./ImportRemediationGuide";
import { ImportTemplateColumns } from "./ImportTemplateColumns";
import { MaterialIcon } from "./MaterialIcon";

export function ImportUploadStep({
  areaName,
  areaCode,
  iconKey,
  sortOrder,
  partTypes,
  templateVersion,
  columnRows,
  onBackToAreas,
  onDownloadTemplate,
  onDownloadVehicles,
  onFile,
  onClearFile,
  onPasteCsv,
  onUploadAndCheck,
  onRefreshHeaderCompare,
  checking,
  headerError,
  headerBlocked,
  fileName,
  rowCount,
  fileBytes,
  remediation,
}: {
  areaName: string;
  areaCode: string;
  iconKey?: string | null;
  sortOrder?: number;
  partTypes?: string[];
  templateVersion: number;
  columnRows: ImportColumnRow[];
  onBackToAreas?: () => void;
  onDownloadTemplate: () => void;
  onDownloadVehicles: () => void;
  onFile: (file: File) => void;
  onClearFile?: () => void;
  onPasteCsv?: (text: string) => void;
  onUploadAndCheck?: () => void;
  onRefreshHeaderCompare?: () => void;
  checking: boolean;
  headerError: string | null;
  headerBlocked?: boolean;
  fileName?: string | null;
  rowCount?: number;
  fileBytes?: number;
  remediation?: string[];
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const typesLine = partTypes?.length ? partTypes.join(" · ") : "—";
  const iconName = materialIconForArea(iconKey, areaName);
  const sysChip = catSysChip(sortOrder);
  const alignment = headerAlignmentSummary(columnRows, columnRows.filter((r) => r.status === "in_file" || r.status === "extra").map((r) => r.name));
  const kb = fileBytes != null ? Math.max(1, Math.round(fileBytes / 1024)) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-space-md">
        {onBackToAreas ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-space-sm py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-secondary hover:text-on-surface font-label-md text-label-md transition-colors"
            onClick={onBackToAreas}
          >
            <MaterialIcon name="arrow_back" className="text-[16px]" />
            All areas
          </button>
        ) : null}
        {onBackToAreas ? <div className="h-6 w-0.5 bg-surface-container-highest hidden sm:block" aria-hidden /> : null}
        <div className="flex items-center gap-space-md min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
            <MaterialIcon name={iconName} className="text-[24px]" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-space-sm">
              <h2 className="font-headline-lg text-headline-lg text-on-surface truncate">{areaName} import</h2>
              <span className="font-mono-sm text-mono-sm px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant shrink-0">
                {sysChip}
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="text-sm text-on-surface-variant">
        <span className="font-semibold text-on-surface">Part types:</span> {typesLine}
      </p>

      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-on-surface">1. Get the template</h3>
          <span className="text-[10px] font-mono uppercase text-outline">UTF-8 .CSV REQUIRED</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
          <div className="grid sm:grid-cols-2 gap-3 flex-1 min-w-0">
            <button
              type="button"
              className="text-left rounded-xl border border-outline-variant/40 p-4 hover:border-primary transition-colors"
              onClick={onDownloadTemplate}
            >
              <MaterialIcon name="download" className="text-[22px] text-primary mb-2" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{areaName} template</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container-high">.CSV</span>
              </div>
              <p className="text-xs text-secondary mt-1">Header row, 3 example rows and help notes</p>
            </button>
            <button
              type="button"
              className="text-left rounded-xl border border-outline-variant/40 p-4 hover:border-primary transition-colors"
              onClick={onDownloadVehicles}
            >
              <MaterialIcon name="table_rows" className="text-[22px] text-secondary mb-2" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Vehicle list</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container-high">.CSV</span>
              </div>
              <p className="text-xs text-secondary mt-1">Every car version with its id. Use ids to avoid wrong matches.</p>
            </button>
          </div>
        </div>
        <ImportTemplateColumns rows={columnRows} areaName={areaName} />
      </div>

      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-on-surface">2. Upload your file</h3>
          <div className="flex flex-wrap items-center gap-2">
            {fileName && !headerBlocked ? (
              <span className="text-[10px] font-mono uppercase text-outline">VALIDATED FILE CACHE</span>
            ) : null}
            {headerBlocked ? (
              <span className="text-[10px] font-mono uppercase text-error font-semibold">SCHEMA CHECK FAILED</span>
            ) : null}
          </div>
        </div>

        {!fileName ? (
          <label className="block rounded-xl border border-dashed border-outline-variant p-8 text-center cursor-pointer hover:bg-surface-container-low transition-colors">
            <MaterialIcon name="cloud_upload" className="text-[32px] text-outline mx-auto mb-2" />
            <span className="text-sm font-semibold text-on-surface block">Drop your {areaName} .csv here, or choose a file</span>
            <span className="text-xs text-on-surface-variant mt-1 block">Up to 5,000 rows · 5 MB</span>
            <input
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              disabled={checking}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          <div
            className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 border ${headerBlocked ? "border-error/40 bg-error-container/20" : "border-outline-variant/40 bg-surface-container-low"}`}
          >
            <MaterialIcon name="description" className="text-[20px] text-secondary" />
            <span className="text-sm font-semibold truncate flex-1">{fileName}</span>
            <span className="text-xs font-mono text-on-surface-variant">
              {kb != null ? `· ${kb} KB` : ""} · {areaName} Category
              {rowCount != null ? ` · ${rowCount} rows parsed` : ""}
              {headerBlocked ? " · Invalid schema structure" : ""}
            </span>
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-surface-container-high"
              aria-label="Remove file"
              onClick={() => onClearFile?.()}
            >
              <MaterialIcon name="close" className="text-[18px]" />
            </button>
          </div>
        )}

        {fileName && !headerBlocked && alignment.fileLoaded ? (
          <p
            className={`text-xs flex items-center gap-1 ${
              alignment.ok ? "text-[#006e31]" : "text-[#92400e]"
            }`}
          >
            <MaterialIcon
              name={alignment.ok ? "check_circle" : "info"}
              className="text-[16px]"
              filled={alignment.ok}
            />
            {alignment.ok
              ? `Header matches the ${areaName} template (${alignment.inFile} of ${alignment.inFile} columns aligned)`
              : `${alignment.inFile} of ${alignment.inFile} template columns in your file${
                  alignment.extra ? ` · ${alignment.extra} extra column${alignment.extra === 1 ? "" : "s"}` : ""
                }${
                  columnRows.some((r) => r.status === "missing_optional")
                    ? " · some optional columns omitted (OK)"
                    : ""
                }`}
          </p>
        ) : null}

        {fileName && !headerBlocked ? (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {[
              { label: "ROWS VALID", value: rowCount ?? "—" },
              { label: "POSITIONS", value: columnRows.some((r) => r.name === "position" && r.status === "in_file") ? "Included" : "Optional" },
              { label: "PRICES INCLUDED", value: "None" },
            ].map((tile) => (
              <div key={tile.label} className="rounded-lg bg-surface-container-low px-3 py-2 text-center">
                <p className="text-[10px] font-mono uppercase text-outline">{tile.label}</p>
                <p className="text-sm font-semibold text-on-surface">{tile.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {headerBlocked && headerError ? (
          <div className="rounded-xl border border-error/30 bg-error-container/30 p-4 space-y-2">
            <h4 className="text-sm font-semibold text-error">The header doesn&apos;t match the {areaName} template.</h4>
            <p className="text-xs text-on-error-container whitespace-pre-wrap">{headerError}</p>
            <p className="text-xs text-on-surface-variant">
              Fix these header keys in your export or spreadsheet editor, then upload the file again.
            </p>
            <p className="text-[10px] font-mono uppercase text-error font-semibold">ACTION BLOCKED</p>
          </div>
        ) : null}

        {!pasteOpen ? null : (
          <div className="space-y-2">
            <textarea
              className="w-full min-h-[120px] rounded-xl border border-outline-variant p-3 text-sm font-mono"
              placeholder="Paste CSV rows including header…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div className="flex flex-wrap gap-space-sm">
              <button
                type="button"
                className="inline-flex items-center justify-center min-h-9 px-4 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md font-semibold hover:bg-primary transition-colors"
                onClick={() => {
                  if (pasteText.trim() && onPasteCsv) onPasteCsv(pasteText);
                  setPasteOpen(false);
                }}
              >
                Use pasted rows
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center min-h-9 px-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface font-label-md text-label-md font-semibold hover:bg-surface-container-low transition-colors"
                onClick={() => {
                  setPasteOpen(false);
                  setPasteText("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-space-md pt-space-sm">
          {!pasteOpen ? (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 min-h-10 px-5 rounded-xl border border-outline-variant bg-surface-container-low text-on-surface font-label-md text-label-md font-semibold shadow-xs hover:bg-surface-container-lowest transition-colors order-2 sm:order-1"
              onClick={() => setPasteOpen(true)}
            >
              <MaterialIcon name="content_paste" className="text-[18px] text-secondary" />
              Paste rows instead
            </button>
          ) : null}
          <button
            type="button"
            disabled={checking || !fileName || headerBlocked}
            className="inline-flex items-center justify-center gap-2 min-h-10 px-6 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md font-semibold shadow-sm hover:bg-primary transition-colors disabled:opacity-50 disabled:pointer-events-none order-1 sm:order-2 sm:ml-auto"
            onClick={onUploadAndCheck}
          >
            {headerBlocked ? <MaterialIcon name="block" className="text-[18px]" /> : null}
            {checking ? "Uploading…" : "Upload and check"}
          </button>
        </div>
      </div>

      {remediation?.length ? <ImportRemediationGuide messages={remediation} /> : null}
      {headerBlocked && headerError ? <ImportRemediationGuide messages={[headerError]} /> : null}

      <p className="text-[10px] font-mono uppercase text-outline text-center pt-2">
        · SECURITY: ISOLATED PARSER SANDBOX · NO TELEMETRY LEAKS
      </p>
    </div>
  );
}
