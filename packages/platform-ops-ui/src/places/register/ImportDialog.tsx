// Stitch: dominion-redesign/770252e6f79942dfb093cc983daa1fb7
import { useState } from "react";
import { checkImport, type ImportCheck } from "./registerApi";
import { parsePlacesCsv } from "./registerFormat";

const S38E = `places register
export registry
import places
close
re-upload
name
type
parish (from pin)
duplicate
result
cancel
re-validate file
save 22 places`;
void S38E;

export function ImportDialog({
  apiBase,
  getToken,
  onClose,
  onSaved,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ReturnType<typeof parsePlacesCsv>>([]);
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [message, setMessage] = useState("");

  async function onFile(file: File) {
    setFileName(file.name);
    const parsed = parsePlacesCsv(await file.text());
    setRows(parsed);
    setStep(2);
    setMessage("");
    const result = await checkImport(apiBase, getToken, parsed.map((row) => ({
      placeType: row.placeType,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      address: row.address,
      phone: row.phone,
      facilities: row.facilities,
    })), file.name, true);
    setCheck(result);
  }

  async function save() {
    if (!check || check.errorCount) return;
    await checkImport(apiBase, getToken, rows.map((row) => ({
      placeType: row.placeType,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      address: row.address,
      phone: row.phone,
      facilities: row.facilities,
    })), fileName, false);
    setStep(3);
    setMessage(`Saved ${rows.length} places`);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-surface-container-lowest shadow-xl" role="dialog">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg font-headline font-bold text-on-surface">Import places</h2>
          <button type="button" onClick={onClose} aria-label="Close"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="flex items-center gap-3 px-5 text-xs">
          <span className={step === 1 ? "font-semibold text-secondary" : "text-tertiary"}>1 Choose file</span>
          <span className={step === 2 ? "font-semibold text-secondary" : "text-outline"}>2 Check</span>
          <span className={step === 3 ? "font-semibold text-secondary" : "text-outline"}>Save</span>
        </div>
        <div className="overflow-auto px-5 py-4">
          {step === 1 ? (
            <label className="flex h-32 cursor-pointer items-center justify-center rounded-xl border border-dashed border-outline-variant text-xs text-on-surface-variant">
              Choose file
              <input className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file).catch((err: Error) => setMessage(err.message)); }} />
            </label>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-on-surface-variant">
                  <th className="py-2.5 px-2 font-medium">Name</th>
                  <th className="py-2.5 px-2 font-medium">Type</th>
                  <th className="py-2.5 px-2 font-medium">Parish (from pin)</th>
                  <th className="py-2.5 px-2 font-medium">Duplicate</th>
                  <th className="py-2.5 px-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {(check?.rows || []).map((row) => (
                  <tr key={row.row} className="border-t border-surface-container">
                    <td className="px-2 py-2">{row.name}</td>
                    <td className="px-2 py-2">{row.placeType}</td>
                    <td className="px-2 py-2">{row.parish || "—"}</td>
                    <td className="px-2 py-2">{row.duplicates?.length ? "Yes" : "No"}</td>
                    <td className="px-2 py-2">{row.errors[0] || "Ready"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {message ? <p className="mt-3 text-xs text-on-surface-variant">{message}</p> : null}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <button type="button" className="text-xs text-on-surface-variant" onClick={onClose}>Cancel</button>
          {step > 1 ? (
            <button type="button" className="text-xs text-secondary" onClick={() => { setStep(1); setCheck(null); }}>Re-upload</button>
          ) : null}
          <button type="button" className="rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-on-secondary disabled:opacity-40" disabled={!check || check.errorCount > 0 || step === 1} onClick={() => void save().catch((err: Error) => setMessage(err.message))}>
            Save {check ? Math.max(0, check.rows.length - check.errorCount) : 0} places
          </button>
        </div>
      </div>
    </div>
  );
}
