/**
 * S1 request drawer — Stitch screens 2 (Roam found), 3 (browser check), 4 (two makers disagree) and 18 (phone sheet).
 * Keep / Drop / Add: docs/research-engine-audit.md §4b. Every value comes from the job, its proposals and the page
 * reads the engine saved; nothing about who asked, when, or how many (RE-23).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  researchApi,
  type BrowserCheckGate,
  type PartProposal,
  type ResearchJobDetail,
  type SpecProposal,
} from "../../../services/researchEngineService";
import { patchPendingPartsGroup, type PendingPartsQueueGroup } from "../../../services/pendingPartsCatalogService";
import { AddedPickPartPanel } from "../vehicle-catalog/pending-parts/AddedPickPartPanel";
import {
  D_CARD,
  D_MONO,
  D_MUTED,
  D_TXT,
  DIcon,
  PartsButton,
  RE_LABEL,
  RE_SOFT,
  ReDrawer,
  RePill,
  ReSavedText,
  ReSection,
  ReSkeleton,
  ReStatePill,
} from "./ReKit";
import {
  browserCheckTarget,
  buildDates,
  versionRowWords,
  catalogueEngineCode,
  partFinder,
  carLabel,
  gateReasonText,
  howSureLine,
  keptSources,
  placeLabel,
  proposalChecks,
  proposalConfirmed,
  readOnLabel,
  siteName,
  statePill,
} from "./researchModel";

export type DrawerOutcome = { message: string; undoJobId?: string };

type Props = {
  token: string;
  jobId: string | null;
  /** The pending request group this row stands for, when a fleet asked (hand actions live on it). */
  group?: PendingPartsQueueGroup | null;
  /** Fallback title + car while the job loads, or for a request with no research job. */
  fallbackTitle?: string;
  fallbackCar?: string;
  browserChecks?: { open: number; max: number } | null;
  onClose: () => void;
  onChanged: (outcome?: DrawerOutcome) => void;
};

export function ResearchJobDrawer({ token, jobId, group, fallbackTitle, fallbackCar, browserChecks, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<ResearchJobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const open = Boolean(jobId || group);

  const load = useCallback(async () => {
    if (!jobId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      setDetail(await researchApi.job(token, jobId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load this item");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [token, jobId]);

  useEffect(() => {
    setEditing(false);
    setPicking(false);
    void load();
  }, [load]);

  const job = detail?.job ?? null;
  const itemName = detail?.spec?.label || detail?.partType?.name || fallbackTitle || "Part";
  const place = placeLabel(job?.fit_descriptor);
  const carName = detail?.car ? carLabel(detail.car) : fallbackCar || "";
  const openConflict = (detail?.conflicts ?? []).find((c) => !c.closed_at) ?? null;
  const pill = statePill(job?.state ?? null, Boolean(openConflict));
  const readAt = useMemo(() => new Map((detail?.reads ?? []).map((r) => [r.id, r.read_at])), [detail]);

  const shownProposals = useMemo(() => {
    const all = detail?.proposals ?? [];
    const live = all.filter((p) => p.status !== "rejected");
    return live.length ? live : [];
  }, [detail]);
  const reviewProposal = shownProposals.find((p) => p.status === "open") ?? null;
  const openSpec = (detail?.specProposals ?? []).find((p) => p.status === "open") ?? null;
  const promotedSpec = (detail?.specProposals ?? []).find((p) => p.status === "promoted") ?? null;

  async function run(label: string, fn: () => Promise<unknown>, outcome?: DrawerOutcome, close = true) {
    setBusy(true);
    try {
      await fn();
      onChanged(outcome ?? { message: label });
      if (close) onClose();
      else await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={`truncate text-[18px] font-semibold tracking-tight ${D_TXT}`} data-testid="drawer-title">
          {itemName}
        </h2>
        {job ? <ReStatePill pill={pill} testId="drawer-state-pill" /> : null}
      </div>
      <p className={`mt-0.5 truncate text-[13px] ${D_MUTED}`}>{[carName, place].filter(Boolean).join(" · ")}</p>
    </div>
  );

  // ---------------------------------------------------------------- footers
  const state = job?.state ?? null;
  const groupOpen = Boolean(group && !group.groupId.startsWith("legacy:") && group.status !== "resolved");
  const handOnly = !jobId || (state === "added" && shownProposals.length === 0 && !promotedSpec);

  let footer: ReactNode = null;
  if (state === "browser_check" && detail) {
    footer = null; // the browser-check card carries its own sticky footer (below)
  } else if (openConflict) {
    footer = null;
  } else if (state === "needs_review" && (reviewProposal || openSpec)) {
    footer = (
      <>
        <PartsButton
          variant="primary"
          disabled={busy}
          data-testid="looks-right"
          onClick={() =>
            reviewProposal
              ? void run("Added", () => researchApi.looksRight(token, jobId!, reviewProposal.id), {
                  message: `Added ${itemName}${reviewProposal.part_number ? ` (${reviewProposal.part_number})` : ""} for ${carName}.`,
                })
              : void run("Added", () => researchApi.approveSpec(token, openSpec!.id), {
                  message: `Added ${itemName} ${openSpec!.value}${openSpec!.unit ? ` ${openSpec!.unit}` : ""} for ${carName}.`,
                })
          }
        >
          <DIcon name="check" className="text-[16px]" /> Looks right — add it
        </PartsButton>
        <div className="flex flex-wrap items-center gap-2">
          {reviewProposal ? (
            <PartsButton variant="secondary" disabled={busy} onClick={() => setEditing((v) => !v)} data-testid="edit-and-add">
              Edit and add
            </PartsButton>
          ) : null}
          <PartsButton variant="secondary" disabled={busy} onClick={() => void run("Researching again", () => researchApi.retry(token, jobId!), { message: `${itemName} is back in the queue.` })}>
            Research again
          </PartsButton>
          <PartsButton variant="danger" disabled={busy} data-testid="couldnt-find" onClick={() => void run("Couldn't find", () => researchApi.notFound(token, jobId!), { message: `${itemName} marked Couldn't find.` })}>
            Couldn&apos;t find it
          </PartsButton>
        </div>
      </>
    );
  } else if (state === "auto_added") {
    footer = (
      <>
        <span className={`text-[13px] ${D_MUTED}`}>Roam added this on its own.</span>
        <PartsButton variant="danger" disabled={busy} data-testid="undo-auto-add" onClick={() => void run("Undone", () => researchApi.undo(token, jobId!), { message: `Auto-add undone. ${itemName} is back for review.` })}>
          Undo auto-add
        </PartsButton>
      </>
    );
  } else if (state === "queued" || state === "browser_check_queued") {
    footer = (
      <PartsButton variant="secondary" disabled={busy} data-testid="research-next" onClick={() => void run("Next", () => researchApi.researchNext(token, jobId!), { message: `${itemName} moves to the front of the queue.` }, false)}>
        <DIcon name="vertical_align_top" className="text-[16px]" /> Research next
      </PartsButton>
    );
  } else if (state === "not_found" || state === "failed") {
    footer = (
      <PartsButton variant="secondary" disabled={busy} onClick={() => void run("Again", () => researchApi.retry(token, jobId!), { message: `${itemName} is back in the queue.` })}>
        <DIcon name="refresh" className="text-[16px]" /> Research again
      </PartsButton>
    );
  }

  // Hand actions on the fleet request (live since 412399b0); no robot buttons on hand-added requests.
  const groupFooter =
    groupOpen && !openConflict && state !== "browser_check" && state !== "auto_added" ? (
      picking ? null : (
        <div className="flex w-full flex-wrap items-center justify-between gap-2" data-testid="group-actions">
          <PartsButton variant="secondary" disabled={busy} data-testid="added-pick-part-open" onClick={() => setPicking(true)}>
            Added — pick the part
          </PartsButton>
          <div className="flex gap-2">
            <PartsButton
              variant="danger"
              disabled={busy}
              onClick={() => void run("Can't find", () => patchPendingPartsGroup(token, group!.groupId, { action: "cant_find" }), { message: `${itemName} marked Can't find.` })}
            >
              Can&apos;t find it
            </PartsButton>
            <PartsButton
              variant="primary"
              disabled={busy}
              onClick={() => void run("Looking", () => patchPendingPartsGroup(token, group!.groupId, { action: "looking" }), { message: `${itemName} marked as looking.` })}
            >
              Mark as looking
            </PartsButton>
          </div>
        </div>
      )
    ) : null;

  const footerNode = footer || groupFooter ? (
    <div className="flex w-full flex-col gap-3">
      {footer ? <div className="flex w-full flex-wrap items-center justify-between gap-2">{footer}</div> : null}
      {groupFooter}
    </div>
  ) : undefined;

  return (
    <ReDrawer open={open} onClose={onClose} header={header} footer={state === "browser_check" ? undefined : footerNode} testId="research-drawer">
      {loading && !detail ? <ReSkeleton rows={3} /> : null}

      {picking && group ? (
        <AddedPickPartPanel
          accessToken={token}
          groupId={group.groupId}
          onCancel={() => setPicking(false)}
          onDone={() => {
            setPicking(false);
            onChanged({ message: `${itemName} answered with a part on file.` });
            onClose();
          }}
        />
      ) : null}

      {detail && openConflict ? (
        <MakersDisagree
          detail={detail}
          conflictId={openConflict.id}
          proposalIds={openConflict.proposal_ids}
          readAt={readAt}
          busy={busy}
          onPick={(p) =>
            void run("Picked", () => researchApi.resolveConflict(token, openConflict.id, { resolution: "picked", proposalId: p.id }), {
              message: `Added ${itemName} (${p.brand} ${p.part_number}) for ${carName}. The other number is set aside.`,
            })
          }
          onNeither={() =>
            void run("Neither", () => researchApi.resolveConflict(token, openConflict.id, { resolution: "both_wrong" }), {
              message: `Neither number added. ${itemName} marked Couldn't find.`,
            })
          }
        />
      ) : null}

      {detail && !openConflict && state === "browser_check" ? (
        <BrowserCheckCard
          token={token}
          detail={detail}
          itemName={itemName}
          browserChecks={browserChecks ?? null}
          busy={busy}
          onConfirm={(pasted, url, number) =>
            void run("Confirmed", () => researchApi.confirmBrowserCheck(token, jobId!, pasted, url, number), {
              message: `Confirmed ${itemName} for ${carName} from your browser check.`,
            })
          }
          onNotOnPage={() =>
            void run("Not on page", () => researchApi.notOnPage(token, jobId!), { message: `${itemName} marked Couldn't find.` })
          }
        />
      ) : null}

      {detail && !openConflict && state !== "browser_check" ? (
        <>
          {shownProposals.length > 0 ? (
            <ReSection title="Roam found">
              {shownProposals.map((p) => (
                <RoamFoundCard key={p.id} p={p} carName={carName} chassis={detail.car?.chassis_code ?? null} readAt={readAt} />
              ))}
            </ReSection>
          ) : null}
          {openSpec || promotedSpec ? (
            <ReSection title="Roam found">
              <SpecFoundCard p={(openSpec ?? promotedSpec)!} carName={carName} readAt={readAt} />
            </ReSection>
          ) : null}
          {reviewProposal ? (
            <ReSection title="Checks">
              <div className={`${D_CARD} flex flex-col gap-1 p-2`} data-testid="checks-list">
                {proposalChecks(reviewProposal).map((row) => (
                  <div key={row.label} className="flex items-center gap-2 rounded-xl px-4 py-2">
                    {row.ok ? (
                      <DIcon name="check_circle" filled className="text-[18px] text-[#006e31] dark:text-[#4ade80]" />
                    ) : (
                      <span className="flex h-[18px] w-[18px] items-center justify-center" data-testid="check-amber-dot">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#d97706]" />
                      </span>
                    )}
                    <span className={`text-[14px] ${D_TXT}`}>{row.label}</span>
                  </div>
                ))}
              </div>
            </ReSection>
          ) : null}
          {editing && reviewProposal ? (
            <EditAndAdd
              p={reviewProposal}
              itemName={itemName}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={(body) =>
                void run("Added", () => researchApi.editAndAdd(token, jobId!, body), {
                  message: `Added ${itemName} (${body.partNumber}) for ${carName}.`,
                })
              }
            />
          ) : null}
          {shownProposals.length === 0 && !openSpec && !promotedSpec && !handOnly ? (
            <div className={`${D_CARD} p-5 text-[14px] ${D_MUTED}`} data-testid="nothing-found-yet">
              {state === "not_found" || state === "failed"
                ? "Roam didn't find a trusted catalogue that lists this."
                : state === "added"
                  ? "Added. Nothing more to do."
                  : "Roam hasn't found anything yet."}
            </div>
          ) : null}
          {handOnly && !picking ? (
            <p className={`text-center text-[13px] ${D_MUTED}`} data-testid="drawer-hand-added">
              {state === "added" ? "Added by hand. Nothing more to do." : "No research for this one. Answer it by hand below."}
            </p>
          ) : null}
        </>
      ) : null}
    </ReDrawer>
  );
}

// ------------------------------------------------------------------ Screen 2: Roam found

function RoamFoundCard({ p, carName, chassis, readAt }: { p: PartProposal; carName: string; chassis: string | null; readAt: Map<string, string> }) {
  const [showText, setShowText] = useState(false);
  const kept = keptSources(p);
  const first = kept[0];
  const confirmed = proposalConfirmed(p);
  const place = placeLabel(p.position_key);
  const fit = [carName, place, chassis ? `frame ${chassis}` : null].filter(Boolean).join(" · ");
  const firstRead = first?.readId ? readAt.get(first.readId) : undefined;
  return (
    <div className={`${D_CARD} flex flex-col gap-4 p-6`} data-testid="roam-found-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-[18px] font-semibold tracking-tight ${D_MONO} ${D_TXT}`} data-testid="found-number">
          {[p.brand, p.part_number].filter(Boolean).join(" ")}
        </span>
        {p.status === "promoted" ? (
          <RePill tone="green" icon="check">Added</RePill>
        ) : confirmed ? (
          <RePill tone="green" icon="check">Confirmed</RePill>
        ) : (
          <RePill tone="amber">Needs checking</RePill>
        )}
      </div>
      <div className={`rounded-xl p-4 ${RE_SOFT}`}>
        <p className={`text-[14px] ${D_TXT}`}>
          <span className={`font-medium ${D_MUTED}`}>Fits:</span> {fit}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {kept.length ? (
            kept.map((s) => (
              <span
                key={`${s.domain}-${s.readId}`}
                className={`inline-flex items-center gap-1.5 rounded-md bg-[#ededf9] px-2 py-1 text-[13px] ${D_MONO} ${D_TXT} dark:bg-[#1e293b]`}
                data-testid="found-site"
              >
                <DIcon name="language" className="text-[14px] text-[#0153dc]" />
                {s.domain}
              </span>
            ))
          ) : (
            <span className={`text-[13px] ${D_MUTED}`}>No page saved</span>
          )}
          {firstRead ? <span className={`text-[13px] ${D_MUTED}`}>{readOnLabel(firstRead)}</span> : null}
        </div>
        {first?.block ? (
          <PartsButton variant="secondary" onClick={() => setShowText((v) => !v)} data-testid="see-saved-text">
            See the saved page text
          </PartsButton>
        ) : null}
      </div>
      {showText && first?.block ? (
        <ReSavedText title={`Saved page text · ${first.domain}`} text={kept.map((s) => `${s.domain}: ${s.block}`).join("\n\n")} onHide={() => setShowText(false)} />
      ) : null}
      <div className={`flex items-start gap-2 rounded-lg px-4 py-2 ${RE_SOFT}`}>
        <DIcon name="info" className={`mt-0.5 text-[18px] ${D_MUTED}`} />
        <p className={`text-[13px] ${D_MUTED}`} data-testid="how-sure">
          {howSureLine(p)}
        </p>
      </div>
    </div>
  );
}

function SpecFoundCard({ p, carName, readAt }: { p: SpecProposal; carName: string; readAt: Map<string, string> }) {
  const first = p.evidence_read_ids[0];
  const when = first ? readAt.get(first) : undefined;
  return (
    <div className={`${D_CARD} flex flex-col gap-4 p-6`} data-testid="roam-found-spec">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-[18px] font-semibold ${D_MONO} ${D_TXT}`}>{[p.value, p.unit].filter(Boolean).join(" ")}</span>
        {p.status === "promoted" ? <RePill tone="green" icon="check">Added</RePill> : <RePill tone="amber">Needs checking</RePill>}
      </div>
      <div className={`rounded-xl p-4 ${RE_SOFT}`}>
        <p className={`text-[14px] ${D_TXT}`}>
          <span className={`font-medium ${D_MUTED}`}>For:</span> {carName}
        </p>
      </div>
      {when ? <span className={`text-[13px] ${D_MUTED}`}>{readOnLabel(when)}</span> : null}
    </div>
  );
}

function EditAndAdd({
  p,
  itemName,
  busy,
  onCancel,
  onSave,
}: {
  p: PartProposal;
  itemName: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: { brand: string; partNumber: string; partName: string; sourceUrl: string }) => void;
}) {
  const firstUrl = keptSources(p).find((s) => s.url)?.url ?? "";
  const [brand, setBrand] = useState(p.brand ?? "");
  const [number, setNumber] = useState(p.part_number ?? "");
  const [url, setUrl] = useState(firstUrl);
  const urlOk = /^https:\/\//.test(url.trim());
  const input =
    "h-10 w-full rounded-lg border border-[#c5c6d0] bg-white px-3 text-[14px] text-[#30323b] outline-none focus:ring-2 focus:ring-[#0153dc] dark:border-[#334155] dark:bg-[#0b1220] dark:text-[#e2e8f0]";
  return (
    <div className={`${D_CARD} flex flex-col gap-3 p-5`} data-testid="edit-and-add-form">
      <h3 className={RE_LABEL}>Edit and add</h3>
      <label className={`flex flex-col gap-1 text-[13px] ${D_MUTED}`}>
        Brand
        <input className={input} value={brand} onChange={(e) => setBrand(e.target.value)} />
      </label>
      <label className={`flex flex-col gap-1 text-[13px] ${D_MUTED}`}>
        Part number
        <input className={`${input} ${D_MONO}`} value={number} onChange={(e) => setNumber(e.target.value)} />
      </label>
      <label className={`flex flex-col gap-1 text-[13px] ${D_MUTED}`}>
        Catalogue page it is on
        <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        {url && !urlOk ? <span className="text-[12px] text-[#a83836]">Needs https</span> : null}
      </label>
      <div className="flex justify-end gap-2">
        <PartsButton variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </PartsButton>
        <PartsButton
          variant="primary"
          disabled={busy || !number.trim() || !urlOk}
          onClick={() => onSave({ brand: brand.trim(), partNumber: number.trim(), partName: p.part_name || itemName, sourceUrl: url.trim() })}
        >
          Add it
        </PartsButton>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Screen 3 / 18: browser check

function BrowserCheckCard({
  token,
  detail,
  itemName,
  browserChecks,
  busy,
  onConfirm,
  onNotOnPage,
}: {
  token: string;
  detail: ResearchJobDetail;
  itemName: string;
  browserChecks: { open: number; max: number } | null;
  busy: boolean;
  onConfirm: (pasted: string, url: string, number?: string) => void;
  onNotOnPage: () => void;
}) {
  const [pasted, setPasted] = useState("");
  // RE-57: when the page shows a different number than Roam suggested, the owner types it; it must be on the line.
  const [typedNumber, setTypedNumber] = useState("");
  // RE-61: the page the owner actually used is the proof link (pre-filled with Roam's link; same trusted-site rule).
  // Starts empty: Roam's link may be the version list, which never shows the part (code review).
  const [pageUrl, setPageUrl] = useState("");
  // Another check opened in the same drawer starts clean (keyed on the job only, so a refetch keeps the work).
  useEffect(() => {
    setPasted("");
    setTypedNumber("");
    setPageUrl("");
  }, [detail.job.id]);
  const [gate, setGate] = useState<BrowserCheckGate | null>(null);
  const url = detail.browserCheckUrl;
  const site = siteName(url);
  const target = browserCheckTarget(detail.car, itemName);
  const finder = partFinder(itemName, detail.car?.make);
  // Step 1 opens the remembered version when Roam knows it, else Roam's (list) link.
  const openUrl = detail.knownVersion?.url || url;
  // Step 2 (only when needed): the version's name if remembered, else the row in the catalogue's own words.
  const versionStep = detail.knownVersion?.url ? null : detail.knownVersion ? detail.knownVersion.code : versionRowWords(detail.car);
  const jobType = detail.job.job_type === "spec" ? "spec" : "part";

  // The server reads the line with the same rule Confirm uses (part → car + number; spec → car + a value of its shape).
  useEffect(() => {
    // Any edit clears the old reading, so Confirm never acts on a number the screen no longer shows.
    setGate(null);
    if (!pasted.trim()) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void researchApi
        .previewBrowserCheck(token, detail.job.id, pasted, typedNumber.trim() || undefined)
        .then((g) => {
          if (!cancelled) setGate(g);
        })
        .catch(() => {
          if (!cancelled) setGate(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [pasted, typedNumber, token, detail.job.id]);

  const canConfirm = Boolean(gate?.ok && pageUrl.trim().startsWith("https://"));
  const askNumber =
    jobType === "part" && pasted.trim() !== "" && (typedNumber !== "" || (gate !== null && !gate.ok && (gate.reason === "no_number" || gate.reason === "number_not_on_line")));

  async function pasteFromClipboard() {
    try {
      setPasted(await navigator.clipboard.readText());
    } catch {
      toast.error("Couldn't read the clipboard. Paste into the box instead.");
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="browser-check-card">
      {/* RE-65: five short steps, nothing else (owner, 21 Nov: "just give me the correct direction"). */}
      <div className="flex flex-col gap-4 rounded-2xl bg-[#dbe1ff] p-6 text-[14px] text-[#00174b] dark:bg-[#1e3a8a]/40 dark:text-[#dbe1ff]">
        <div className="flex items-center gap-2">
          <StepDot n={1} />
          {openUrl ? (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="parts-btn parts-btn--primary !min-h-[40px] w-full justify-center md:w-auto"
              data-testid="open-catalogue-page"
            >
              Open {site} <DIcon name="open_in_new" className="text-[16px]" />
            </a>
          ) : (
            <span className={D_MUTED}>No {site} link for this one. Use Not on this page.</span>
          )}
        </div>
        {versionStep ? (
          <div className="flex items-start gap-2" data-testid="browser-check-instruction">
            <StepDot n={2} />
            <p className="pt-0.5">
              {detail.knownVersion ? "Click " : "Click the row with "}
              <span className={`rounded bg-white/80 px-1.5 py-0.5 font-semibold ${D_MONO} dark:bg-[#0b1220]/60`}>{versionStep}</span>
            </p>
          </div>
        ) : null}
        <div className="flex items-start gap-2" data-testid="guide-find-part">
          <StepDot n={versionStep ? 3 : 2} />
          <p className="pt-0.5">
            {jobType === "part" ? (
              <>
                Search <span className="font-semibold">{finder.search}</span>
                {finder.rowName ? (
                  <>
                    {" "}→ find <span className="font-semibold">{finder.rowName}</span>
                  </>
                ) : null}
              </>
            ) : (
              <>
                Find the <span className="font-semibold">{(detail.spec?.label ?? target.item).toLowerCase()}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <StepDot n={versionStep ? 4 : 3} />
          <div className="flex w-full flex-col gap-2">
            <p className="pt-0.5">Copy the bold title line and the part&apos;s row. Paste here:</p>
            <textarea
              rows={3}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              data-testid="browser-check-paste"
              className="w-full resize-none rounded-lg bg-white p-3 text-[14px] text-[#30323b] shadow-sm outline-none focus:ring-2 focus:ring-[#0153dc] dark:bg-[#0b1220] dark:text-[#e2e8f0]"
            />
            <div className="flex gap-2 md:hidden">
              <PartsButton variant="secondary" onClick={() => void pasteFromClipboard()}>
                <DIcon name="content_paste" className="text-[16px]" /> Paste
              </PartsButton>
              <PartsButton variant="danger" onClick={() => setPasted("")} disabled={!pasted}>
                Clear
              </PartsButton>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <StepDot n={versionStep ? 5 : 4} />
          <label className="flex w-full flex-col gap-2">
            <span className="pt-0.5">Copy the address bar. Paste here:</span>
            <input
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://"
              data-testid="browser-check-page-url"
              className={`h-10 w-full rounded-lg bg-white px-3 text-[13px] text-[#30323b] shadow-sm outline-none focus:ring-2 focus:ring-[#0153dc] dark:bg-[#0b1220] dark:text-[#e2e8f0] ${D_MONO}`}
            />
          </label>
        </div>
      </div>

      {pasted.trim() ? (
        <div className="flex flex-col gap-1" data-testid="browser-check-readback">
          <span className={RE_LABEL}>Roam read from pasted line</span>
          <div className={`flex items-center justify-between gap-2 rounded-xl px-4 py-4 ${RE_SOFT}`}>
            {gate?.ok ? (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <DIcon name="check_circle" className="text-[18px] text-[#006e31] dark:text-[#4ade80]" />
                  <span className={`truncate text-[13px] ${D_MONO} ${D_TXT}`} data-testid="detected-value">
                    Detected: {gate.detected}
                  </span>
                </div>
                <RePill tone="green">Matched</RePill>
              </>
            ) : (
              <span className={`text-[13px] ${D_MUTED}`}>{gate ? gateReasonText(gate.reason, jobType, detail.car) : "Reading…"}</span>
            )}
          </div>
        </div>
      ) : null}

      {askNumber ? (
        <label className={`flex flex-col gap-1 text-[13px] ${D_MUTED}`}>
          Number shown on the page
          <input
            value={typedNumber}
            onChange={(e) => setTypedNumber(e.target.value)}
            placeholder="Type the part number exactly as the page shows it"
            maxLength={40}
            data-testid="browser-check-typed-number"
            className={`h-10 w-full rounded-lg border border-[#c5c6d0] bg-white px-3 text-[14px] text-[#30323b] outline-none focus:ring-2 focus:ring-[#0153dc] dark:border-[#334155] dark:bg-[#0b1220] dark:text-[#e2e8f0] ${D_MONO}`}
          />
        </label>
      ) : null}

      <div className="sticky bottom-0 -mx-6 -mb-6 mt-auto flex flex-col gap-3 bg-white px-6 py-4 shadow-[0_-4px_16px_rgba(1,83,220,0.04)] dark:bg-[#111a2e]">
        {browserChecks ? (
          <p className={`text-[13px] ${D_MUTED}`} data-testid="browser-check-counter">
            Browser checks waiting for you: <span className={`font-medium ${D_TXT}`}>{browserChecks.open} of {browserChecks.max}</span> · a check
            left for 30 days closes as <span className={`font-medium ${D_TXT}`}>Couldn&apos;t find</span>.
          </p>
        ) : null}
        <div className="flex flex-col gap-2 md:flex-row">
          <PartsButton
            variant="primary"
            className="!min-h-[40px] flex-1"
            disabled={busy || !canConfirm}
            data-testid="browser-check-confirm"
            onClick={() => onConfirm(pasted, pageUrl.trim(), typedNumber.trim() || undefined)}
          >
            <DIcon name="check" className="text-[18px]" /> Confirm
          </PartsButton>
          <PartsButton variant="danger" className="!min-h-[40px]" disabled={busy} data-testid="not-on-page" onClick={onNotOnPage}>
            Not on this page
          </PartsButton>
        </div>
      </div>
    </div>
  );
}

function StepDot({ n }: { n: number }) {
  return (
    <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0153dc] text-[12px] font-medium text-white">
      {n}
    </span>
  );
}

// ------------------------------------------------------------------ Screen 4: two makers disagree

function MakersDisagree({
  detail,
  proposalIds,
  readAt,
  busy,
  onPick,
  onNeither,
}: {
  detail: ResearchJobDetail;
  conflictId: string;
  proposalIds: string[];
  readAt: Map<string, string>;
  busy: boolean;
  onPick: (p: PartProposal) => void;
  onNeither: () => void;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const cards = proposalIds
    .map((id) => detail.proposals.find((p) => p.id === id))
    .filter((p): p is PartProposal => Boolean(p));
  const shownCard = cards.find((c) => c.id === shown) ?? null;
  return (
    <div className="flex flex-col gap-6" data-testid="makers-disagree">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((p) => {
          const first = keptSources(p)[0];
          const when = first?.readId ? readAt.get(first.readId) : undefined;
          return (
            <div key={p.id} className={`${D_CARD} flex flex-col justify-between gap-4 p-6`} data-testid="maker-card">
              <div className="flex flex-col gap-4">
                <div className="flex h-11 min-w-[44px] items-center justify-center self-start rounded-lg bg-[#ededf9] px-2 text-[16px] font-semibold text-[#30323b] dark:bg-[#1e293b] dark:text-[#e2e8f0]">
                  {p.brand || siteName(first?.domain)}
                </div>
                <div className="flex flex-col gap-1">
                  <span className={`text-[15px] ${D_MONO} ${D_TXT}`}>{p.part_number}</span>
                  {when ? <span className={`text-[13px] ${D_MUTED}`}>{readOnLabel(when)}</span> : null}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <PartsButton variant="secondary" disabled={!first?.block} onClick={() => setShown(shown === p.id ? null : p.id)}>
                  See the saved page text
                </PartsButton>
                <PartsButton variant="primary" disabled={busy} data-testid="use-this-one" onClick={() => onPick(p)}>
                  Use this one
                </PartsButton>
              </div>
            </div>
          );
        })}
      </div>
      {shownCard ? (
        <ReSavedText
          title={`Saved page text · ${keptSources(shownCard)[0]?.domain ?? ""}`}
          text={keptSources(shownCard).map((s) => s.block).join("\n\n")}
          onHide={() => setShown(null)}
        />
      ) : null}
      <div className="flex flex-col gap-2">
        <PartsButton variant="danger" className="w-full !min-h-[40px]" disabled={busy} data-testid="neither-is-right" onClick={onNeither}>
          Neither is right
        </PartsButton>
        <p className={`text-center text-[13px] ${D_MUTED}`}>Nothing is added until you choose. The other number is set aside.</p>
      </div>
    </div>
  );
}
