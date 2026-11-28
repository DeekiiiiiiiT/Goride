import { useMemo, useState } from "react";
import { toast } from "sonner";
import { approveAllSpecs, approveSpec, patchSpec, rejectSpec, type ManualDetail, type SpecRow } from "./manualsApi";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, CARD, Icon, MarketPill, Pill } from "./manualsUi";
import { PdfPagePreview } from "./PdfPagePreview";
import { SPEC_GROUPS, nowText, specLabel, specValueText } from "./specsFormat";

/**
 * Screen 5 (build step 6b): an owner's manual's specs. The page on the left, one card per spec on the right with
 * "Now → Manual" and the versions it is for. Approving writes only to the ticked versions; History keeps the old value.
 */
type Props = {
  token: string;
  detail: ManualDetail;
  modelName: string;
  canApprove: boolean;
  canEdit: boolean;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
};

export function CheckSpecsView({ token, detail, modelName, canApprove, canEdit, onBack, onChanged }: Props) {
  const m = detail.manual;
  const offset = Number(m.page_offset ?? 0);
  const specs = useMemo(() => (detail.specs ?? []).filter((s) => s.status !== "rejected"), [detail.specs]);
  const versions = detail.versions ?? [];
  const pdfPages = useMemo(() => {
    const listed = (m.pages ?? []).length ? (m.pages as number[]) : specs.map((s) => s.evidence_page ?? 0).filter(Boolean);
    return [...new Set(listed)].sort((a, b) => a - b);
  }, [m.pages, specs]);
  const firstWithSpecs = specs.find((s) => s.evidence_page)?.evidence_page ?? pdfPages[0] ?? 1;
  const [page, setPage] = useState<number>(firstWithSpecs);
  const [ticks, setTicks] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SpecRow | null>(null);
  const [editValue, setEditValue] = useState("");
  const [rejecting, setRejecting] = useState<SpecRow | null>(null);
  const [reason, setReason] = useState("");
  const [allOpen, setAllOpen] = useState(false);

  const ticked = (s: SpecRow) => ticks[s.id] ?? s.version_ids;
  const toggle = (s: SpecRow, id: string) =>
    setTicks((prev) => {
      const cur = prev[s.id] ?? s.version_ids;
      return { ...prev, [s.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });

  const approved = specs.filter((s) => s.status === "active").length;
  const left = specs.filter((s) => s.status !== "active");
  const sureLeft = left.filter((s) => s.confidence !== "uncertain");
  // A front page before printed page 1 has no printed number: it is named the way the upload form names it.
  const printed = (pdf: number) => (pdf - offset >= 1 ? String(pdf - offset) : `Front page ${pdf}`);
  const onPage = specs.filter((s) => s.evidence_page === page);
  const shown = onPage.length ? onPage : specs;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 text-[#30323b]" data-testid="mm-check-specs">
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={BTN_SECONDARY} onClick={onBack}>
          <Icon name="arrow_back" className="text-[18px]" />
          {modelName.replace(/\s\d{4}.*$/, "")}
        </button>
        <div>
          <h2 className="text-[26px] font-semibold">Check the specs</h2>
          <p className="flex flex-wrap items-center gap-2 text-[14px] text-[#5d5f68]">
            {m.title} · <MarketPill market={m.market} /> · {pdfPages.length} pages
          </p>
        </div>
      </div>

      <div className={`${CARD} mt-4 flex flex-wrap items-center gap-4 px-5 py-3`}>
        <p className="text-[16px] font-semibold">
          {approved} of {specs.length} checked
        </p>
        <div className="h-2 w-48 overflow-hidden rounded-full bg-[#e6e7ee]">
          <div className="h-full bg-[#006e31]" style={{ width: `${specs.length ? (approved / specs.length) * 100 : 0}%` }} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-semibold uppercase tracking-wide text-[#5d5f68]">Pages</span>
          {pdfPages.map((p) => {
            const has = specs.some((s) => s.evidence_page === p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={p === page}
                className={`h-9 min-w-[48px] rounded-full border px-3 font-mono text-[13px] ${
                  p === page
                    ? "border-[#0153dc] bg-[#0153dc] text-white"
                    : has
                      ? "border-[#c5c6d0] bg-white text-[#30323b] hover:bg-[#f3f4fb]"
                      : "border-[#e6e7ee] bg-white text-[#9a9ba4]"
                }`}
                onClick={() => setPage(p)}
              >
                {printed(p)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[45fr_55fr]">
        <section className={`${CARD} self-start p-5`}>
          <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
            <Icon name="picture_as_pdf" className="text-[20px] text-[#0153dc]" />
            {page - offset >= 1 ? `Page ${printed(page)}` : printed(page)}
          </p>
          <PdfPagePreview token={token} manualId={m.id} page={page} width={440} />
        </section>

        <section className="space-y-6">
          {!onPage.length && specs.length ? (
            <p className="text-[13px] text-[#5d5f68]">No specs on this page. Showing every spec found.</p>
          ) : null}
          {!specs.length ? (
            <div className={`${CARD} p-6 text-[14px] text-[#5d5f68]`}>Roam found no specs in this manual yet.</div>
          ) : null}
          {SPEC_GROUPS.map((g) => {
            const rows = shown.filter((s) => s.kind === g.kind);
            if (!rows.length) return null;
            return (
              <div key={g.kind}>
                <p className="mb-2 flex items-center justify-between text-[12px] font-semibold uppercase tracking-wide text-[#5d5f68]">
                  <span className="flex items-center gap-2">
                    <Icon name={g.icon} className="text-[18px] text-[#0153dc]" />
                    {g.title}
                  </span>
                  <span>{rows.length}</span>
                </p>
                <ul className="space-y-3">
                  {rows.map((s) => {
                    const isApproved = s.status === "active";
                    const now = nowText({ now: s.now, version_ids: ticked(s) });
                    const manual = specValueText(s);
                    const same = s.matches || (now !== "—" && now.toLowerCase() === manual.toLowerCase());
                    return (
                      <li
                        key={s.id}
                        className={`${CARD} p-4 ${s.confidence === "uncertain" && !isApproved ? "border-2 border-[#e0b44a] bg-[#fffdf5]" : ""}`}
                        data-testid="mm-spec-row"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[17px] font-semibold">{specLabel(s)}</p>
                            {s.applies_to ? <p className="text-[13px] text-[#5d5f68]">As printed: {s.applies_to}</p> : null}
                          </div>
                          {isApproved ? (
                            <Pill tone="green" icon="check">
                              Approved
                            </Pill>
                          ) : s.confidence === "uncertain" ? (
                            <Pill tone="amber" icon="priority_high">
                              Needs checking
                            </Pill>
                          ) : null}
                        </div>
                        {s.draft_note && !isApproved ? (
                          <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-[#fff4dc] px-3 py-2 text-[14px] text-[#8a5a00]">
                            <Icon name="warning" className="text-[18px]" />
                            {s.draft_note}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f3f4fb] px-4 py-3">
                          <span className="text-[13px] text-[#5d5f68]">Now {now}</span>
                          {same ? (
                            <Pill tone="green" icon="check">
                              Matches
                            </Pill>
                          ) : (
                            <span className="flex items-center gap-2 font-mono text-[15px]">
                              <Icon name="arrow_forward" className="text-[16px] text-[#5d5f68]" />
                              <b>{manual}</b>
                            </span>
                          )}
                        </div>
                        {versions.length ? (
                          <div className="mt-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5d5f68]">Apply to versions</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {versions.map((v) => {
                                const on = ticked(s).includes(v.id);
                                return (
                                  <label
                                    key={v.id}
                                    className={`flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-[13px] ${
                                      on ? "border-[#0153dc] bg-[#f3f6ff]" : "border-[#c5c6d0] bg-white"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 accent-[#0153dc]"
                                      checked={on}
                                      disabled={isApproved || !canEdit}
                                      onChange={() => toggle(s, v.id)}
                                    />
                                    {v.label}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-3 flex items-center justify-between">
                          <p className="text-[13px] text-[#5d5f68]">Found on page {s.printed_page ?? "—"}</p>
                          {!isApproved ? (
                            <div className="flex gap-2">
                              {canEdit ? (
                                <button
                                  type="button"
                                  className={`${BTN_SECONDARY} h-9 text-[14px]`}
                                  onClick={() => {
                                    setEditing(s);
                                    setEditValue(specValueText(s));
                                  }}
                                >
                                  Edit
                                </button>
                              ) : null}
                              {canApprove ? (
                                <>
                                  <button
                                    type="button"
                                    className={`${BTN_DANGER} h-9 text-[14px]`}
                                    onClick={() => {
                                      setRejecting(s);
                                      setReason("");
                                    }}
                                  >
                                    Reject
                                  </button>
                                  <button
                                    type="button"
                                    className={`${BTN_SECONDARY} h-9 border-[#0153dc] text-[14px] text-[#0153dc]`}
                                    disabled={busy || !ticked(s).length}
                                    onClick={() => void run(() => approveSpec(token, s.id, ticked(s)), `${specLabel(s)} approved.`)}
                                  >
                                    <Icon name="check" className="text-[18px]" />
                                    Approve
                                  </button>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      </div>

      {canApprove && left.length ? (
        <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-[#e6e7ee] bg-white/95 backdrop-blur md:-mx-8">
          <div className="flex flex-wrap items-center gap-3 px-6 py-3">
            <p className="flex flex-1 items-center gap-2 text-[14px] text-[#5d5f68]">
              <Icon name="info" className="text-[18px]" />
              Approved specs replace what Roam has for the ticked versions, and the old value is kept in History.
            </p>
            <button type="button" className={BTN_SECONDARY} onClick={onBack}>
              Save and finish later
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy || !sureLeft.length} onClick={() => setAllOpen(true)}>
              Approve all {sureLeft.length}
              <Icon name="arrow_forward" className="text-[18px]" />
            </button>
          </div>
        </div>
      ) : null}

      {allOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-[520px] rounded-[20px] bg-white p-8 shadow-2xl">
            <h3 className="text-[22px] font-semibold">Approve {sureLeft.length} specs?</h3>
            <p className="mt-2 text-[15px] text-[#5d5f68]">Each one is written to the versions it is ticked for. {modelName} versions switch to them now.</p>
            {left.length > sureLeft.length ? (
              <p className="mt-2 text-[14px] text-[#8a5a00]">{left.length - sureLeft.length} that need checking are left for you.</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={BTN_DANGER} onClick={() => setAllOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await approveAllSpecs(token, m.id);
                    setAllOpen(false);
                  }, "Specs approved.")
                }
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-[560px] rounded-[20px] bg-white p-8 shadow-2xl">
            <h3 className="text-[22px] font-semibold">{specLabel(editing)}</h3>
            <p className="mt-1 text-[14px] text-[#5d5f68]">Page {editing.printed_page ?? "—"}. Type the value as the manual prints it.</p>
            <label className="mt-4 block text-[14px] font-medium">
              Value
              <input
                className="mt-1 h-11 w-full rounded-[10px] border border-[#c5c6d0] px-3 font-mono text-[15px]"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={BTN_DANGER} onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={busy || !editValue.trim()}
                onClick={() =>
                  void run(async () => {
                    const v = { ...((editing.value ?? {}) as Record<string, unknown>) };
                    if (editing.kind === "tyre") v.size = editValue.trim();
                    else if (editing.kind === "bulb") {
                      const [ref, w] = editValue.split("·").map((x) => x.trim());
                      v.bulb_ref = ref;
                      if (w) v.wattage_w = w.replace(/\s*W$/i, "");
                      v.is_led = /^led$/i.test(ref);
                    } else v.value = editValue.trim();
                    await patchSpec(token, editing.id, { value: v, version_ids: ticked(editing) });
                    setEditing(null);
                  }, "Saved.")
                }
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejecting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-[520px] rounded-[20px] bg-white p-8 shadow-2xl">
            <h3 className="text-[22px] font-semibold">Reject {specLabel(rejecting)}?</h3>
            <p className="mt-2 text-[15px] text-[#5d5f68]">This value will not be used. What Roam has now stays.</p>
            <label className="mt-4 block text-[14px] font-medium">
              Why?
              <textarea
                className="mt-1 h-24 w-full rounded-[10px] border border-[#c5c6d0] p-3 text-[15px]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example: this is the turbo figure"
              />
            </label>
            <p className="mt-1 text-[13px] text-[#5d5f68]">At least 10 characters.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setRejecting(null)} disabled={busy}>
                Keep it
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-[10px] bg-[#a83836] px-5 text-[15px] font-semibold text-white disabled:opacity-50"
                disabled={busy || reason.trim().length < 10}
                onClick={() =>
                  void run(async () => {
                    await rejectSpec(token, rejecting.id, reason.trim());
                    setRejecting(null);
                  }, "Value rejected.")
                }
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
