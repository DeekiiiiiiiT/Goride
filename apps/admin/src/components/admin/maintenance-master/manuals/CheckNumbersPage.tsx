import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";
import { approveManualRows, getManual, rejectManual, type ManualDetail, type ManualRow } from "./manualsApi";
import { EditManualRowDrawer } from "./EditManualRowDrawer";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, CARD, Icon, MarketPill, Pill, everyText } from "./manualsUi";
import { PdfPagePreview } from "./PdfPagePreview";
import { CheckSpecsView } from "./CheckSpecsView";
import { pageListText } from "./specsFormat";

type Props = {
  token: string;
  manualId: string;
  modelName: string;
  categories: MaintenanceServiceCategory[];
  canApprove: boolean;
  canEdit: boolean;
  onBack: () => void;
  onChanged: () => void;
};

function severeText(r: ManualRow): string {
  if (r.severe_same_as_normal) return "";
  if (r.severe_interval_km == null && r.severe_interval_months == null) return "";
  return everyText(r.severe_interval_km, r.severe_interval_months).replace(/^Every/, "every");
}

function normalText(r: ManualRow): string {
  if (r.first_interval_km != null || r.first_interval_months != null) {
    const first = everyText(r.first_interval_km, r.first_interval_months).replace(/^Every /, "");
    return `First at ${first}, then ${everyText(r.interval_km, r.interval_months).toLowerCase()}`;
  }
  return everyText(r.interval_km, r.interval_months).replace(/^Every/, "every");
}

export function CheckNumbersPage({ token, manualId, modelName, categories, canApprove, canEdit, onBack, onChanged }: Props) {
  const [detail, setDetail] = useState<ManualDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState<number | null>(null);
  const [editing, setEditing] = useState<ManualRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [approveAllOpen, setApproveAllOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getManual(token, manualId);
      setDetail(d);
      setLoadError("");
      setPage((p) => p ?? (d.rows.find((r) => r.evidence_page)?.evidence_page ?? d.progress.page_from));
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "This manual could not be loaded.");
    }
  }, [token, manualId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = useMemo(() => {
    if (!detail) return [];
    // Only the pages this document was told to read (DOC-03).
    const listed = (detail.manual.pages ?? []).filter((p) => Number.isInteger(p));
    if (listed.length) return [...new Set(listed)].sort((a, b) => a - b);
    const out: number[] = [];
    for (let p = detail.progress.page_from; p <= detail.progress.page_to; p += 1) out.push(p);
    return out;
  }, [detail]);

  const rows = detail?.rows ?? [];
  const onPage = rows.filter((r) => r.evidence_page === page);
  const approved = rows.filter((r) => r.status === "active").length;
  const left = rows.filter((r) => r.status !== "active");
  const certainLeft = left.filter((r) => !r.needs_checking);
  const readOnly = detail?.manual.status === "checked" && left.length === 0;

  const approveOne = async (id: string) => {
    setBusy(true);
    try {
      const res = await approveManualRows(token, manualId, { rule_ids: [id] });
      if (res.message) toast.message(res.message);
      await load();
      onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "That row could not be approved.");
    } finally {
      setBusy(false);
    }
  };

  const approveAll = async () => {
    setBusy(true);
    try {
      const res = await approveManualRows(token, manualId, { all: true });
      toast.success(
        `${res.approved ?? 0} number${res.approved === 1 ? "" : "s"} approved.${
          res.skipped_uncertain ? ` ${res.skipped_uncertain} left for you to check.` : ""
        }`,
      );
      setApproveAllOpen(false);
      await load();
      onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "The numbers could not be approved.");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (reason.trim().length < 10) return;
    setBusy(true);
    try {
      await rejectManual(token, manualId, reason.trim());
      toast.success("Manual rejected. Its numbers were not used.");
      setRejectOpen(false);
      onChanged();
      onBack();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "The manual could not be rejected.");
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="mt-6 space-y-3">
        <button type="button" className={BTN_SECONDARY} onClick={onBack}>
          <Icon name="arrow_back" className="text-[18px]" />
          {modelName}
        </button>
        <p className="rounded-[10px] bg-[#fdecec] px-3 py-2 text-[14px] text-[#a83836]">{loadError}</p>
        <button type="button" className={BTN_SECONDARY} onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }
  if (!detail || page == null) {
    return <p className="mt-6 text-[14px] text-[#5d5f68]">Loading the numbers…</p>;
  }
  // An owner's manual is checked for its specs (screen 5); a schedule for its numbers.
  if (detail.manual.doc_type === "owners_manual" && (detail.specs ?? []).length) {
    return (
      <CheckSpecsView
        token={token}
        detail={detail}
        modelName={modelName}
        canApprove={canApprove}
        canEdit={canEdit}
        onBack={onBack}
        onChanged={async () => {
          await load();
          onChanged();
        }}
      />
    );
  }

  const m = detail.manual;
  const total = rows.length;

  return (
    <div className="mt-2 text-[#30323b]" data-testid="mm-check-numbers">
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={BTN_SECONDARY} onClick={onBack}>
          <Icon name="arrow_back" className="text-[18px]" />
          {modelName.replace(/\s\d{4}.*$/, "")}
        </button>
        <div>
          <h2 className="text-[26px] font-semibold">{readOnly ? "The numbers" : "Check the numbers"}</h2>
          <p className="flex flex-wrap items-center gap-2 text-[14px] text-[#5d5f68]">
            {m.title} · <MarketPill market={m.market} /> · pages {m.printed_pages?.length ? pageListText(m.printed_pages) : `${m.page_from}–${m.page_to}`}
          </p>
        </div>
      </div>

      <div className={`${CARD} mt-4 flex flex-wrap items-center gap-4 px-5 py-3`}>
        <p className="text-[16px] font-semibold">
          {approved} of {total} checked
        </p>
        <div className="h-2 w-48 overflow-hidden rounded-full bg-[#e6e7ee]">
          <div className="h-full bg-[#006e31]" style={{ width: `${total ? (approved / total) * 100 : 0}%` }} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-semibold uppercase tracking-wide text-[#5d5f68]">Pages</span>
          {pages.map((p) => {
            const has = rows.some((r) => r.evidence_page === p);
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
                {p - Number(detail.manual.page_offset ?? 0) >= 1 ? p - Number(detail.manual.page_offset ?? 0) : `Front page ${p}`}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[45fr_55fr]">
        <section className={`${CARD} p-5`}>
          <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
            <Icon name="picture_as_pdf" className="text-[20px] text-[#0153dc]" />
            Page {page}
          </p>
          <PdfPagePreview token={token} manualId={manualId} page={page} width={440} />
        </section>

        <section>
          <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
            <Icon name="check_circle" className="text-[20px] text-[#0153dc]" />
            Numbers found on page {page}
          </p>
          {onPage.length === 0 ? (
            <div className={`${CARD} p-6 text-[14px] text-[#5d5f68]`}>Roam found no maintenance numbers on this page.</div>
          ) : (
            <ul className="space-y-3">
              {onPage.map((r) => {
                const isApproved = r.status === "active";
                const sev = severeText(r);
                return (
                  <li
                    key={r.id}
                    className={`${CARD} p-4 ${r.needs_checking && !isApproved ? "border-2 border-[#e0b44a] bg-[#fffdf5]" : ""}`}
                    data-testid="mm-check-row"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dbe1ff] text-[#0153dc]">
                          <Icon name="build" className="text-[20px]" />
                        </span>
                        <div className="pt-1">
                          <p className="text-[17px] font-semibold">{r.part_name ?? r.task_name ?? "Not matched to a part"}</p>
                          {/* The printed line, so "Engine oil (Except turbo)" and "(Turbo)" can be told apart. */}
                          {r.task_name && r.task_name !== r.part_name ? (
                            <p className="text-[13px] text-[#5d5f68]">As printed: {r.task_name}</p>
                          ) : null}
                        </div>
                      </div>
                      {isApproved ? (
                        <Pill tone="green" icon="check">
                          Approved
                        </Pill>
                      ) : r.needs_checking ? (
                        <Pill tone="amber" icon="priority_high">
                          Needs checking
                        </Pill>
                      ) : null}
                    </div>
                    {r.needs_checking && r.draft_note && !isApproved ? (
                      <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-[#fff4dc] px-3 py-2 text-[14px] text-[#8a5a00]">
                        <Icon name="warning" className="text-[18px]" />
                        {r.draft_note}
                      </p>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-[#e6e7ee] bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5d5f68]">Normal driving</p>
                        <p className="mt-1 font-mono text-[14px]">{normalText(r)}</p>
                      </div>
                      <div className="rounded-xl bg-[#f3f4fb] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5d5f68]">Harder driving</p>
                        <p className="mt-1 font-mono text-[14px]">
                          {r.severe_same_as_normal ? "Same as normal (the manual gives one figure)" : sev || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-[13px] text-[#5d5f68]">Found on page {r.printed_page ?? r.evidence_page}</p>
                      {!isApproved && (canEdit || canApprove) ? (
                        <div className="flex gap-2">
                          {canEdit ? (
                            <button type="button" className={`${BTN_SECONDARY} h-9 text-[14px]`} onClick={() => setEditing(r)}>
                              Edit
                            </button>
                          ) : null}
                          {canApprove && !r.needs_checking ? (
                            <button
                              type="button"
                              className={`${BTN_SECONDARY} h-9 border-[#0153dc] text-[14px] text-[#0153dc]`}
                              disabled={busy || !r.component_id}
                              onClick={() => void approveOne(r.id)}
                            >
                              <Icon name="check" className="text-[18px]" />
                              Approve
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {!readOnly ? (
        <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-[#e6e7ee] bg-white/95 backdrop-blur md:-mx-8">
          <div className="flex flex-wrap items-center gap-3 px-6 py-3">
            <p className="flex flex-1 items-center gap-2 text-[14px] text-[#5d5f68]">
              <Icon name="info" className="text-[18px]" />
              Approved numbers replace Roam policy for every {modelName} right away.
            </p>
            {canApprove ? (
              <button type="button" className={BTN_DANGER} onClick={() => setRejectOpen(true)} disabled={busy}>
                <Icon name="cancel" className="text-[18px]" />
                Reject this manual
              </button>
            ) : null}
            <button type="button" className={BTN_SECONDARY} onClick={onBack}>
              Save and finish later
            </button>
            {canApprove ? (
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={() => setApproveAllOpen(true)}
                disabled={busy || certainLeft.length === 0}
              >
                Approve all {certainLeft.length} left
                <Icon name="arrow_forward" className="text-[18px]" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {approveAllOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-[520px] rounded-[20px] bg-white p-8 shadow-2xl">
            <h3 className="text-[22px] font-semibold">Approve {certainLeft.length} numbers?</h3>
            <p className="mt-2 text-[15px] text-[#5d5f68]">Every {modelName} switches to them now.</p>
            {left.length > certainLeft.length ? (
              <p className="mt-2 text-[14px] text-[#8a5a00]">
                {left.length - certainLeft.length} that need checking are left for you to check one by one.
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={BTN_DANGER} onClick={() => setApproveAllOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className={BTN_PRIMARY} onClick={() => void approveAll()} disabled={busy}>
                Approve
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-[520px] rounded-[20px] bg-white p-8 shadow-2xl">
            <h3 className="text-[22px] font-semibold">Reject this manual?</h3>
            <p className="mt-2 text-[15px] text-[#5d5f68]">None of its numbers will be used. Every {modelName} keeps what it has now.</p>
            <label className="mt-4 block text-[14px] font-medium">
              Why?
              <textarea
                className="mt-1 h-24 w-full rounded-[10px] border border-[#c5c6d0] p-3 text-[15px]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example: wrong car, these are the Japan figures"
              />
            </label>
            <p className="mt-1 text-[13px] text-[#5d5f68]">At least 10 characters.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setRejectOpen(false)} disabled={busy}>
                Keep it
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-[10px] bg-[#a83836] px-5 text-[15px] font-semibold text-white disabled:opacity-50"
                onClick={() => void reject()}
                disabled={busy || reason.trim().length < 10}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <EditManualRowDrawer
        open={Boolean(editing)}
        token={token}
        manualId={manualId}
        manualTitle={m.title}
        row={editing}
        categories={categories}
        canApprove={canApprove}
        onClose={() => setEditing(null)}
        onSaved={(id, approve) => {
          setEditing(null);
          if (approve) void approveOne(id);
          else void load();
        }}
      />
    </div>
  );
}
