/**
 * Maintenance step 13 (MER-16): Report a problem → Sent, ported from docs/stitch/maintenance-rebuild-driver
 * screens 4–5 (Round 2: no "Ref #", depot queue, response-time promise, and never "Vehicle cleared for light
 * transit"). The report becomes a driver request; the fleet sees it on Requests and Work orders.
 */
import { useState } from "react";
import { api } from "../../../services/api";
import { REPORT_CATEGORIES, REPORT_URGENCY, reportPayload, reportProblem, reportSummary, type ReportDraft } from "./carServiceModel";

export function ReportProblemSheet({
  plate,
  vehicleId,
  odometer,
  onClose,
  onSent,
}: {
  plate: string;
  vehicleId?: string | null;
  odometer?: number | null;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [draft, setDraft] = useState<ReportDraft>({ category: "", urgency: "Soon", text: "", photoUrl: null });
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const problem = reportProblem(draft);

  const addPhoto = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const res = await api.uploadFile(file);
      const url = typeof res === "string" ? res : (res as { url?: string }).url;
      if (!url) throw new Error("The photo didn't upload. Try again.");
      setDraft((d) => ({ ...d, photoUrl: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The photo didn't upload. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    if (problem) return;
    setSending(true);
    setError("");
    try {
      await api.createMaintenanceRequest(reportPayload(draft, vehicleId, odometer));
      setSent(true);
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 text-slate-900"
        onClick={(e) => e.stopPropagation()}
        data-testid="report-sheet"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center" data-testid="report-sent">
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <span className="material-symbols-outlined text-[36px]">check</span>
            </span>
            <h2 className="text-[22px] font-semibold text-slate-900">Sent to the fleet</h2>
            <p className="text-[15px] text-slate-700">{reportSummary(draft)}</p>
            <div className="w-full rounded-xl bg-[#eff6ff] px-4 py-3 text-[14px] text-[#1d4ed8]">
              The fleet will reply here. You'll get a notification.
            </div>
            <button type="button" onClick={onClose} className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-emerald-600 text-[16px] font-semibold text-white">
              Back to My car kit
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] font-semibold text-slate-900">Report a car problem</h2>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[13px] font-semibold">{plate}</span>
            </div>

            <p className="mt-4 text-[15px] font-medium">What's wrong?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REPORT_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={draft.category === c}
                  onClick={() => setDraft((d) => ({ ...d, category: c }))}
                  className={`min-h-[44px] rounded-full border px-4 text-[15px] ${
                    draft.category === c ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800" : "border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  {draft.category === c ? "✓ " : ""}
                  {c}
                </button>
              ))}
            </div>

            <p className="mt-4 text-[15px] font-medium">How soon?</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {REPORT_URGENCY.map((u) => (
                <button
                  key={u.label}
                  type="button"
                  aria-pressed={draft.urgency === u.label}
                  onClick={() => setDraft((d) => ({ ...d, urgency: u.label }))}
                  className={`min-h-[48px] rounded-xl border text-[14px] font-semibold ${
                    draft.urgency === u.label ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  {u.label}
                </button>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="text-[15px] font-medium">Tell the fleet more (optional)</span>
              <textarea
                className="mt-1 min-h-[88px] w-full rounded-xl border border-slate-300 p-3 text-[15px]"
                placeholder="For example: squeak from the front when braking"
                value={draft.text}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              />
            </label>

            <div className="mt-3 flex items-center gap-3">
              <label className="flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-medium">
                <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                {uploading ? "Uploading…" : draft.photoUrl ? "Change photo" : "Add a photo"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void addPhoto(f);
                  }}
                />
              </label>
              {draft.photoUrl ? <img src={draft.photoUrl} alt="Your photo" className="h-12 w-12 rounded-lg object-cover" /> : null}
            </div>

            {error ? <p className="mt-3 text-[14px] text-red-700">{error}</p> : null}

            <button
              type="button"
              disabled={!!problem || sending || uploading}
              onClick={() => void send()}
              className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-emerald-600 text-[16px] font-semibold text-white disabled:opacity-50"
              data-testid="report-send"
            >
              {sending ? "Sending…" : "Send to the fleet"}
            </button>
            {problem && draft.category === "" ? <p className="mt-2 text-center text-[13px] text-slate-500">{problem}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
