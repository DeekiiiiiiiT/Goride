// Stitch: dominion-redesign/parts_import_template_upload
import { ImportRemediationGuide } from "./ImportRemediationGuide";
import { ImportTemplateColumns } from "./ImportTemplateColumns";

export { ImportTemplateColumns, ImportRemediationGuide };

export function ImportUploadStep({
  areaName,
  areaCode,
  templateVersion,
  templateFieldCount,
  onDownloadTemplate,
  onDownloadVehicles,
  onFile,
  onUploadAndCheck,
  checking,
  headerError,
  fileName,
  remediation,
}: {
  areaName: string;
  areaCode: string;
  templateVersion: number;
  templateFieldCount?: number;
  onDownloadTemplate: () => void;
  onDownloadVehicles: () => void;
  onFile: (file: File) => void;
  onUploadAndCheck?: () => void;
  checking: boolean;
  headerError: string | null;
  fileName?: string | null;
  remediation?: string[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className="text-secondary">Find parts</button>
        <button type="button" className="text-secondary">Full database</button>
        <button type="button" className="font-semibold text-primary">Import CSV</button>
        <span className="font-semibold text-on-surface">Parts database</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="text-xs font-semibold text-secondary">Close</button>
        <button type="button" className="text-xs font-semibold text-secondary">Side-by-side view</button>
        <button type="button" className="text-xs font-semibold text-secondary">Validated only</button>
        <button type="button" className="text-xs font-semibold text-secondary">Error state only</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono px-2 py-1 rounded bg-surface-container-high">SYS-{areaCode}</span>
        <h2 className="text-lg font-semibold">{areaName} import</h2>
      </div>
      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm space-y-3">
        <h3 className="text-base font-semibold text-on-surface">1. Get the template</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="text-sm font-semibold text-primary" onClick={onDownloadTemplate}>
            {areaName} template
          </button>
          <p className="w-full text-xs text-secondary">Header row, 3 example rows and help notes</p>
          <button type="button" className="text-sm font-semibold text-on-surface" onClick={onDownloadVehicles}>
            Vehicle list
          </button>
          <p className="w-full text-xs text-secondary">Every car version with its id. Use ids to avoid wrong matches.</p>
        </div>
      </div>
      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm space-y-3">
        <h3 className="text-base font-semibold text-on-surface">2. Upload your file</h3>
        <label className="block rounded-xl border border-dashed border-outline-variant p-6 text-center cursor-pointer hover:bg-surface-container-low">
          <span className="text-sm font-semibold text-on-surface block">Drop your {areaName} .csv here, or choose a file</span>
          <span className="text-xs font-mono text-secondary mt-1 block">Choose .csv file</span>
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
        {fileName ? (
          <p className="text-xs font-mono text-on-surface-variant truncate">{fileName}</p>
        ) : null}
        <button type="button" className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
          Paste rows instead
        </button>
        <button
          type="button"
          disabled={checking || !fileName}
          className="inline-flex items-center gap-2 h-10 px-6 rounded-xl bg-primary-container text-on-primary font-semibold disabled:opacity-50"
          onClick={onUploadAndCheck}
        >
          Upload and check
        </button>
      </div>
      <ImportTemplateColumns count={templateFieldCount ?? 13} />
      {remediation?.length ? <ImportRemediationGuide messages={remediation} /> : null}
      {headerError ? (
        <div className="rounded-xl border border-error/30 bg-error-container/30 p-4 space-y-2">
          <h4 className="text-sm font-semibold text-error">The header doesn&apos;t match the {areaName} template.</h4>
          <p className="text-xs text-on-error-container">{headerError}</p>
          <button type="button" className="text-sm font-semibold text-secondary" disabled>Upload and check</button>
          <ImportRemediationGuide messages={[headerError]} />
        </div>
      ) : null}
      <p className="text-[11px] font-mono text-outline">
        VALIDATION ENGINE: {areaCode}-V{templateVersion} · STRICT {areaName.toUpperCase()} SPECIFICATION ENABLED
      </p>
    </div>
  );
}
