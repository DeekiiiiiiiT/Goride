// Stitch: dominion-redesign/parts_import_template_upload
import type { ImportColumnRow } from "./importCsvHeader";
import { MaterialIcon } from "./MaterialIcon";

function statusLabel(row: ImportColumnRow) {
  switch (row.status) {
    case "template":
      return "In template";
    case "in_file":
      return "In your file";
    case "missing_required":
      return "Missing — required";
    case "missing_optional":
      return "Missing — optional";
    case "extra":
      return "Not in template";
    default:
      return row.status;
  }
}

function rowClass(row: ImportColumnRow) {
  switch (row.status) {
    case "template":
      return row.required
        ? "bg-[#ecfdf3]/35 border-l-4 border-l-[#006e31]/25"
        : "bg-[#fef3c7]/25 border-l-4 border-l-[#b45309]/20";
    case "in_file":
      return "bg-[#ecfdf3] border-l-4 border-l-[#006e31]";
    case "missing_required":
      return "bg-error-container/40 border-l-4 border-l-error";
    case "missing_optional":
      return "bg-[#fef3c7]/60 border-l-4 border-l-[#b45309]";
    case "extra":
      return "bg-[#fce8f3] border-l-4 border-l-[#9c004a]";
    default:
      return "";
  }
}

function badgeClass(row: ImportColumnRow) {
  switch (row.status) {
    case "template":
      return "bg-surface-container text-secondary";
    case "in_file":
      return "bg-[#006e31]/10 text-[#006e31]";
    case "missing_required":
      return "bg-error/15 text-error";
    case "missing_optional":
      return "bg-[#fef3c7] text-[#92400e]";
    case "extra":
      return "bg-[#9c004a]/10 text-[#9c004a]";
    default:
      return "bg-surface-container text-secondary";
  }
}

export function ImportTemplateColumns({
  rows,
  areaName,
}: {
  rows: ImportColumnRow[];
  areaName?: string;
}) {
  const templateCount = rows.filter((r) => r.status !== "extra").length;
  const inFile = rows.filter((r) => r.status === "in_file").length;
  const fileLoaded = rows.some((r) => r.status !== "template");

  return (
    <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-headline-md text-headline-md font-semibold text-on-surface">Columns in this template</h3>
          {areaName ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {fileLoaded
                ? `Compared to your uploaded header · ${inFile} of ${templateCount} template fields in file`
                : `All ${templateCount} fields for this template — upload a file to compare`}
            </p>
          ) : null}
        </div>
        <span className="font-mono-sm text-mono-sm px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant uppercase">
          {templateCount} fields
        </span>
      </div>

      <div className="flex flex-wrap gap-space-md font-label-xs text-label-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#ecfdf3] border border-[#006e31]/40" aria-hidden />
          In file
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-error-container/50 border border-error/30" aria-hidden />
          Missing (required)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#fef3c7] border border-[#b45309]/30" aria-hidden />
          Missing (optional)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#fce8f3] border border-[#9c004a]/30" aria-hidden />
          Extra column
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-outline-variant/30">
        <table className="w-full text-left font-body-sm text-body-sm min-w-[640px]">
          <thead className="bg-surface-container font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="py-2.5 px-space-md">Column name</th>
              <th className="py-2.5 px-space-md">Status</th>
              <th className="py-2.5 px-space-md">Requirement</th>
              <th className="py-2.5 px-space-md">Format &amp; rules</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.status}-${row.name}`} className={`border-t border-outline-variant/20 ${rowClass(row)}`}>
                <td className="py-2 px-space-md font-mono-md text-mono-md font-semibold text-on-surface">
                  {row.rawHeader && row.rawHeader !== row.name ? (
                    <>
                      {row.name}
                      <span className="block text-[10px] font-normal text-on-surface-variant">as &quot;{row.rawHeader}&quot;</span>
                    </>
                  ) : (
                    row.name
                  )}
                </td>
                <td className="py-2 px-space-md">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-xs text-label-xs font-semibold ${badgeClass(row)}`}>
                    {row.status === "in_file" ? <MaterialIcon name="check" className="text-[14px]" /> : null}
                    {row.status === "missing_required" || row.status === "extra" ? (
                      <MaterialIcon name="error" className="text-[14px]" />
                    ) : null}
                    {statusLabel(row)}
                  </span>
                </td>
                <td className="py-2 px-space-md">
                  {row.status === "extra" ? (
                    <span className="font-label-xs text-label-xs text-[#9c004a] font-semibold">Remove</span>
                  ) : (
                    <span
                      className={`px-2 py-0.5 rounded font-label-xs text-label-xs font-semibold ${
                        row.required ? "bg-surface-container text-on-surface" : "bg-surface-container text-secondary font-medium"
                      }`}
                    >
                      {row.required ? "Required" : "Optional"}
                    </span>
                  )}
                </td>
                <td className="py-2 px-space-md text-secondary">{row.format}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
