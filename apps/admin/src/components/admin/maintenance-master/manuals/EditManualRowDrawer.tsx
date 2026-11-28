import { useEffect, useState } from "react";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";
import { patchManualRow, type ManualRow } from "./manualsApi";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Icon } from "./manualsUi";
import { PdfPagePreview } from "./PdfPagePreview";

const INPUT =
  "h-11 w-full rounded-[10px] border border-[#c5c6d0] bg-white px-3 font-mono text-[15px] tabular-nums text-[#30323b] focus:border-[#0153dc] focus:outline-none focus:ring-2 focus:ring-[#0153dc]/30 disabled:bg-[#f3f4fb] disabled:text-[#5d5f68]";

function str(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}
function num(s: string): number | null {
  return s.trim() === "" ? null : Number(s);
}

type Props = {
  open: boolean;
  token: string;
  manualId: string;
  manualTitle: string;
  row: ManualRow | null;
  categories: MaintenanceServiceCategory[];
  canApprove: boolean;
  onClose: () => void;
  /** Saved; `approve` = the owner pressed "Save and approve". */
  onSaved: (rowId: string, approve: boolean) => void;
};

export function EditManualRowDrawer({ open, token, manualId, manualTitle, row, categories, canApprove, onClose, onSaved }: Props) {
  const [componentId, setComponentId] = useState("");
  const [km, setKm] = useState("");
  const [months, setMonths] = useState("");
  const [firstOn, setFirstOn] = useState(false);
  const [firstKm, setFirstKm] = useState("");
  const [firstMonths, setFirstMonths] = useState("");
  const [oneFigure, setOneFigure] = useState(false);
  const [sKm, setSKm] = useState("");
  const [sMonths, setSMonths] = useState("");
  const [page, setPage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !row) return;
    setComponentId(row.component_id ?? "");
    setKm(str(row.interval_km));
    setMonths(str(row.interval_months));
    setFirstOn(row.first_interval_km != null || row.first_interval_months != null);
    setFirstKm(str(row.first_interval_km));
    setFirstMonths(str(row.first_interval_months));
    setOneFigure(Boolean(row.severe_same_as_normal));
    setSKm(str(row.severe_interval_km));
    setSMonths(str(row.severe_interval_months));
    setPage(str(row.evidence_page));
    setError("");
  }, [open, row]);

  if (!open || !row) return null;

  const save = async (approve: boolean) => {
    if (!componentId) {
      setError("Choose which part this is.");
      return;
    }
    if (km === "" && months === "") {
      setError("Fill in the km or the months.");
      return;
    }
    if (!oneFigure && sKm === "" && sMonths === "") {
      setError("Fill in the harder-driving numbers, or tick 'The manual gives one figure'.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await patchManualRow(token, row.id, {
        component_id: componentId,
        interval_km: num(km),
        interval_months: num(months),
        first_interval_km: firstOn ? num(firstKm) : null,
        first_interval_months: firstOn ? num(firstMonths) : null,
        severe_same_as_normal: oneFigure,
        severe_interval_km: oneFigure ? null : num(sKm),
        severe_interval_months: oneFigure ? null : num(sMonths),
        evidence_page: num(page),
      });
      onSaved(row.id, approve);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "That row could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const partName = categories.find((c) => c.id === componentId)?.name ?? row.part_name ?? row.task_name ?? "This row";

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/40" aria-label="Close" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-white text-[#30323b] shadow-2xl" data-testid="mm-edit-manual-row">
        <header className="flex items-start justify-between border-b border-[#e6e7ee] px-6 py-5">
          <div>
            <h2 className="text-[26px] font-semibold">{partName}</h2>
            <p className="text-[14px] text-[#5d5f68]">
              {manualTitle} · page {row.evidence_page ?? "—"}
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#c5c6d0] bg-white hover:bg-[#f3f4fb]"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {error ? (
            <p className="rounded-[10px] border border-[#f3c5c4] bg-[#fdecec] px-3 py-2 text-[14px] text-[#a83836]" role="alert">
              {error}
            </p>
          ) : null}
          {row.draft_note ? (
            <p className="flex items-start gap-2 rounded-[10px] bg-[#fff4dc] px-3 py-2 text-[14px] text-[#8a5a00]">
              <Icon name="warning" className="text-[18px]" />
              {row.draft_note}
            </p>
          ) : null}

          {row.evidence_page ? (
            <div className="rounded-2xl bg-[#f3f4fb] p-4">
              <PdfPagePreview token={token} manualId={manualId} page={row.evidence_page} width={460} zoomable={false} />
            </div>
          ) : null}

          <label className="block">
            <span className="text-[15px] font-semibold">Which part is this?</span>
            <select
              className="mt-2 h-11 w-full rounded-[10px] border border-[#c5c6d0] bg-white px-3 text-[15px]"
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
            >
              <option value="">Choose a part</option>
              {categories
                .filter((c) => c.kind === "component")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>

          <div className="rounded-2xl border border-[#e6e7ee] p-4">
            <p className="text-[15px] font-semibold">Normal driving</p>
            <div className="mt-3 flex items-center gap-2 text-[14px]">
              Every
              <input className={`${INPUT} w-32`} type="number" value={km} onChange={(e) => setKm(e.target.value)} aria-label="Normal km" />
              km or
              <input className={`${INPUT} w-20`} type="number" value={months} onChange={(e) => setMonths(e.target.value)} aria-label="Normal months" />
              months
            </div>
            <label className="mt-3 flex items-center gap-2 text-[14px]">
              <input type="checkbox" className="h-5 w-5 accent-[#0153dc]" checked={firstOn} onChange={(e) => setFirstOn(e.target.checked)} />
              Different first time
            </label>
            {firstOn ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#f3f4fb] p-3 text-[14px]">
                First at
                <input className={`${INPUT} w-32`} type="number" value={firstKm} onChange={(e) => setFirstKm(e.target.value)} aria-label="First km" />
                km or
                <input className={`${INPUT} w-20`} type="number" value={firstMonths} onChange={(e) => setFirstMonths(e.target.value)} aria-label="First months" />
                months
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[#e6e7ee] bg-[#f3f4fb] p-4">
            <p className="text-[15px] font-semibold">Harder driving (taxis, heavy traffic)</p>
            <label className="mt-3 flex items-center gap-2 text-[14px]">
              <input type="checkbox" className="h-5 w-5 accent-[#0153dc]" checked={oneFigure} onChange={(e) => setOneFigure(e.target.checked)} />
              The manual gives one figure
            </label>
            <div className="mt-3 flex items-center gap-2 text-[14px]">
              Every
              <input
                className={`${INPUT} w-32`}
                type="number"
                value={oneFigure ? km : sKm}
                disabled={oneFigure}
                onChange={(e) => setSKm(e.target.value)}
                aria-label="Harder driving km"
              />
              km or
              <input
                className={`${INPUT} w-20`}
                type="number"
                value={oneFigure ? months : sMonths}
                disabled={oneFigure}
                onChange={(e) => setSMonths(e.target.value)}
                aria-label="Harder driving months"
              />
              months
            </div>
            {oneFigure ? <p className="mt-2 text-[13px] text-[#5d5f68]">Same as normal.</p> : null}
          </div>

          <label className="block">
            <span className="text-[15px] font-semibold">Page</span>
            <input className={`${INPUT} mt-2 w-32`} type="number" min={1} value={page} onChange={(e) => setPage(e.target.value)} aria-label="Page" />
          </label>
          <p className="text-[13px] text-[#5d5f68]">Due is whichever comes first.</p>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-[#e6e7ee] px-6 py-4">
          <button type="button" className={BTN_DANGER} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <div className="flex gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => void save(false)} disabled={busy}>
              Save
            </button>
            {canApprove ? (
              <button type="button" className={BTN_PRIMARY} onClick={() => void save(true)} disabled={busy}>
                Save and approve
              </button>
            ) : null}
          </div>
        </footer>
      </aside>
    </>
  );
}
