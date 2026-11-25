import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";
import { PartsButton } from "../../PartsButton";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { CatalogPageDraft } from "../addPartsTypes";
import { fetchSelfServeLinkHints } from "../addPartsApi";
import { useAuth } from "../../../../auth/AuthContext";
import { researchApi } from "../../../../../services/researchEngineService";
import { MakerLogo } from "../../../vehicle-catalog/MakerLogo";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../../ui/alert-dialog";
import {
  D_MUTED,
  D_TINT,
  D_TXT,
  DFooter,
  DIconTile,
  DPill,
  DQuestion,
} from "./dominionKit";
import { PartNumberGuideDialog } from "./CatalogHelpBits";

const COMMON_MAKERS = ["Toyota", "Daihatsu", "Subaru", "Suzuki", "Honda", "Nissan"];
const COMMON_BRANDS = ["NiBK", "SB", "Brembo", "Akebono", "KYB", "MANN-FILTER", "Denso", "NGK"];

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function CatalogStep1Page({
  draft,
  setDraft,
  onNext,
  onCancel,
  owner,
}: {
  draft: CatalogPageDraft;
  setDraft: Dispatch<SetStateAction<CatalogPageDraft>>;
  onNext: () => void;
  onCancel: () => void;
  owner: boolean;
}) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [loading, setLoading] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [makerPicking, setMakerPicking] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const [trustBusy, setTrustBusy] = useState(false);
  const [trustError, setTrustError] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  const hints = draft.linkHints;
  const trusted = hints?.trustedSite === true;
  const maker = draft.catalogCarMaker.trim();
  const brand = draft.brandDefault.trim();
  const siteDomain = hints?.host?.replace(/^www\./, "") || domainOf(draft.evidenceUrl);
  const sitePretty = siteDomain ? siteDomain.charAt(0).toUpperCase() + siteDomain.slice(1).replace(/\.(com|net|org|co\.jp|jp)$/i, "") : "";

  /**
   * Every link read or trust re-check takes a number; only the newest one may write
   * its answer. A slow, older answer is dropped (CR-01).
   */
  const readSeq = useRef(0);

  /** The person picked the maker themselves (it differs from what the link said). */
  function makerWasPicked(d: CatalogPageDraft): boolean {
    const current = d.catalogCarMaker.trim();
    const fromLink = (d.linkHints?.catalogMaker ?? "").trim();
    return Boolean(current) && current.toLowerCase() !== fromLink.toLowerCase();
  }

  /**
   * The one cleanup for a cleared, not-a-link or replaced page (CR-07, CR-08). Only a maker the
   * person truly picked survives, with its brand and "who made" answer; anything the old link
   * worked out (maker, brand, the automatic genuine answer) goes with it.
   */
  function clearedPage(cur: CatalogPageDraft, evidenceUrl: string, allowKeepPicked: boolean): CatalogPageDraft {
    const keepPicked = allowKeepPicked && makerWasPicked(cur);
    return {
      ...cur,
      evidenceUrl,
      linkHints: null,
      catalogCarMaker: keepPicked ? cur.catalogCarMaker : "",
      brandDefault: keepPicked ? cur.brandDefault : "",
      madeByCarMaker: keepPicked ? cur.madeByCarMaker : null,
      partKind: keepPicked ? cur.partKind : "oem",
    };
  }

  async function applyUrl(raw: string) {
    const seq = ++readSeq.current;
    const t = raw.trim();
    if (!t) {
      setDraft((cur) => clearedPage(cur, "", true));
      setUrlError("");
      setLoading(false);
      setRechecking(false);
      return;
    }
    if (!/^https?:\/\//i.test(t)) {
      setUrlError("That doesn't look like a web link. Copy it from your browser's address bar.");
      // CR-07: text that isn't a web address never shows trust or a maker read from an older link.
      setDraft((cur) => clearedPage(cur, raw, true));
      setLoading(false);
      setRechecking(false);
      return;
    }
    setUrlError("");
    // Show what was typed straight away; the answers follow when the read finishes.
    setDraft((cur) => ({ ...cur, evidenceUrl: t }));
    setLoading(true);
    // A maker the person picked wins over the link's maker, and trust is checked for it (CR-03, F-01).
    const pickedMaker = makerWasPicked(draft) ? draft.catalogCarMaker.trim() : "";
    try {
      const next = pickedMaker ? await fetchSelfServeLinkHints(t, pickedMaker) : await fetchSelfServeLinkHints(t);
      if (seq !== readSeq.current) return;
      setDraft((cur) => {
        const foundMaker = next.catalogMaker ?? "";
        const oldMaker = cur.catalogCarMaker.trim();
        const keepPicked = makerWasPicked(cur);
        const effMaker = keepPicked ? oldMaker : foundMaker || cur.catalogCarMaker;
        // The person's "who made these parts" choice is theirs: re-reading the link
        // never flips it and never types the car maker in as another brand (QA-01, F-09).
        const choiceMade = cur.madeByCarMaker !== null;
        const genuine = choiceMade ? cur.madeByCarMaker === true : next.trustedSite === true ? true : null;
        const brandNow = cur.brandDefault.trim();
        const brandFollowsMaker = genuine !== false && effMaker && (!brandNow || brandNow === oldMaker);
        return {
          ...cur,
          evidenceUrl: t,
          // next.catalogMaker is always the link's own maker, so a picked maker stays recognisable as picked.
          linkHints: next,
          catalogCarMaker: effMaker,
          madeByCarMaker: genuine,
          sourceType: !choiceMade && next.trustedSite === true ? "car_maker_catalogue" : cur.sourceType,
          partKind: genuine === false ? "aftermarket" : genuine === true ? "oem" : cur.partKind,
          brandDefault: brandFollowsMaker ? effMaker : cur.brandDefault,
        };
      });
      // A link that does not name the maker asks for it straight away (plan §4 Step 1).
      setMakerPicking(!pickedMaker && !next.catalogMaker);
    } catch {
      if (seq !== readSeq.current) return;
      setUrlError("Could not read that link. Check it and try again.");
    } finally {
      if (seq === readSeq.current) setLoading(false);
    }
  }

  /** Picking the maker re-checks trust for that maker, in place: no reload, nothing lost (F-01). */
  async function pickMaker(nextMaker: string) {
    const trimmed = nextMaker.trim();
    if (!trimmed) return;
    const seq = ++readSeq.current;
    setDraft((cur) => ({
      ...cur,
      catalogCarMaker: trimmed,
      brandDefault: cur.madeByCarMaker !== false ? trimmed : cur.brandDefault,
    }));
    setMakerPicking(false);
    setLoading(false);
    if (!draft.evidenceUrl) return;
    setRechecking(true);
    try {
      const refreshed = await fetchSelfServeLinkHints(draft.evidenceUrl, trimmed);
      if (seq !== readSeq.current) return;
      setDraft((cur) => ({
        ...cur,
        linkHints: { ...(cur.linkHints ?? {}), ...refreshed },
        sourceType: refreshed.trustedSite ? "car_maker_catalogue" : cur.sourceType,
      }));
    } catch {
      if (seq !== readSeq.current) return;
      toast.error("Could not check that maker. Try again.");
    } finally {
      if (seq === readSeq.current) setRechecking(false);
    }
  }

  function chooseKind(genuine: boolean) {
    setDraft({
      ...draft,
      madeByCarMaker: genuine,
      partKind: genuine ? "oem" : "aftermarket",
      sourceType: genuine ? "car_maker_catalogue" : "part_maker_catalogue",
      // Never carry the car maker's name across as an "another brand" (F-09).
      brandDefault: genuine ? (maker || draft.brandDefault) : draft.brandDefault === maker ? "" : draft.brandDefault,
    });
  }

  async function confirmTrustSite() {
    const trustKind = draft.partKind === "aftermarket" ? "part_maker" : "car_maker";
    const trustTarget = trustKind === "part_maker" ? draft.brandDefault.trim() : maker;
    if (!owner || !token || !siteDomain || !trustTarget) return;
    setTrustBusy(true);
    setTrustError("");
    try {
      await researchApi.addSite(token, {
        domain: siteDomain,
        kind: trustKind,
        makers: [trustTarget],
        automatedRead: "not_checked",
      });
      const seq = ++readSeq.current;
      const refreshed = await fetchSelfServeLinkHints(
        draft.evidenceUrl,
        trustKind === "car_maker" ? maker : undefined,
      );
      if (seq === readSeq.current) {
        setDraft((cur) => ({
          ...cur,
          linkHints: { ...(cur.linkHints ?? {}), ...refreshed },
          sourceType: "car_maker_catalogue",
        }));
      }
      toast.success(`${sitePretty || siteDomain} is now trusted for ${trustTarget}.`);
      setTrustOpen(false);
    } catch (error) {
      setTrustError(error instanceof Error ? error.message : "Couldn't add that site. Try again.");
    } finally {
      setTrustBusy(false);
    }
  }

  const blocker = !draft.evidenceUrl.trim()
    ? "Paste the page first."
    : urlError
      ? "Paste a working web link first."
      : loading || rechecking
      ? "Reading your link…"
      : !maker
        ? "Pick the car maker."
        : draft.madeByCarMaker === null
          ? "Choose who made these parts."
          : draft.partKind === "aftermarket" && !brand
            ? "Type or pick the brand."
            : "";

  function answerRow(icon: string, label: ReactNode, onChange: () => void) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 dark:bg-[#111a2e]">
        <DIconTile name={icon} size="sm" />
        <div className="min-w-0 flex-1">
          <div className={`flex flex-wrap items-center gap-2 text-[15px] ${D_TXT}`}>{label}</div>
          <p className={`text-[12px] ${D_MUTED}`}>Worked out from your link</p>
        </div>
        <PartsButton variant="secondary" className="!h-8 !px-3 text-[13px]" onClick={onChange}>
          Change
        </PartsButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <DQuestion
        title="Paste the page you're looking at"
        hint="The catalogue page that shows the part numbers — e.g. a Partsouq, Amayama or Megazip diagram, or the part maker's own website."
      />
      <div className={`${D_TINT} flex items-center gap-2 p-2`}>
        <MaterialIcon name="link" className="ml-2 text-[20px] text-[#5d5f68]" />
        <input
          aria-label="Catalogue page link"
          className={`h-11 min-w-0 flex-1 rounded-lg border bg-white px-3 text-[14px] dark:bg-[#111a2e] ${urlError ? "border-error ring-2 ring-error/20" : "border-[#e6e7ee] dark:border-[#1e293b]"}`}
          placeholder="https://…"
          value={draft.evidenceUrl}
          onChange={(e) => void applyUrl(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            window.setTimeout(() => void applyUrl(t), 0);
          }}
        />
        <PartsButton
          type="button"
          variant="secondary"
          className="!h-11"
          onClick={() => void navigator.clipboard.readText().then(applyUrl).catch(() => undefined)}
        >
          <MaterialIcon name="content_paste" className="text-[18px]" /> Paste
        </PartsButton>
      </div>
      {urlError ? <p className="mt-2 text-error font-body-sm">{urlError}</p> : null}
      {loading ? <p className={`mt-2 text-[14px] ${D_MUTED}`}>Reading your link…</p> : null}
      <PartsButton
        variant="secondary"
        className="mt-3 self-start"
        onClick={() => setGuideOpen(true)}
      >
        <MaterialIcon name="menu_book" className="text-[18px]" /> How to find the part number
      </PartsButton>

      {draft.evidenceUrl && hints?.ok !== false && siteDomain ? (
        <div className="mt-6 flex flex-col gap-2">
          <p className={`text-[14px] font-semibold ${D_TXT}`}>What we worked out</p>
          <div className={`${D_TINT} flex flex-col gap-2 p-2`}>
            {answerRow(
              "public",
              <>
                <span className={D_MUTED}>Site:</span> <span className="font-semibold">{sitePretty}</span>
                {trusted ? <DPill tone="green" icon="verified_user">Trusted site</DPill> : <DPill tone="amber">Needs checking</DPill>}
              </>,
              () => {
                readSeq.current += 1;
                setLoading(false);
                setRechecking(false);
                setUrlError("");
                // A new page: nothing from the old one carries over, not even a picked maker.
                setDraft((cur) => clearedPage(cur, "", false));
                setMakerPicking(false);
              },
            )}
            {maker ? (
              answerRow(
                "menu_book",
                <>
                  <span className={D_MUTED}>Whose catalogue:</span>
                  <span className="font-semibold">{maker}&apos;s own catalogue</span>
                </>,
                () => setMakerPicking(true),
              )
            ) : null}
          </div>
          <p className={`text-[13px] ${D_MUTED}`}>
            {rechecking
              ? "Checking trust for this maker…"
              : trusted
                ? `${sitePretty} is trusted for ${maker || "this maker"}.`
                : "This site is not on the trusted list."}
          </p>
        </div>
      ) : null}

      {draft.evidenceUrl ? (
        <div className="mt-6 flex flex-col gap-4">
          <div>
            <p className={`text-[18px] font-semibold ${D_TXT}`}>Which car maker are these parts for?</p>
            {maker && !makerPicking ? null : (
              <p className={`text-[14px] ${D_MUTED}`}>
                We could not read the maker from this link. Pick the maker the page belongs to.
              </p>
            )}
          </div>
          {maker && !makerPicking ? null : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {COMMON_MAKERS.map((m) => {
                const on = maker === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => void pickMaker(m)}
                    className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border bg-white p-2 dark:bg-[#111a2e] ${
                      on ? "border-[#0153dc] ring-2 ring-[#0153dc]/20" : "border-[#c5c6d0] hover:border-[#0153dc]"
                    }`}
                  >
                    <MakerLogo make={m} className="h-6 w-6" />
                    <span className={`text-[13px] font-medium ${on ? "text-[#0153dc]" : D_TXT}`}>{m}</span>
                  </button>
                );
              })}
              <div className="flex min-h-[44px] flex-col justify-center gap-1 rounded-xl border border-[#c5c6d0] bg-white p-2 dark:bg-[#111a2e]">
                <input
                  aria-label="Other maker"
                  className="h-7 rounded-md border border-[#e6e7ee] px-1 text-[12px] dark:border-[#1e293b] dark:bg-[#0b1220]"
                  placeholder="Type the maker"
                  value={COMMON_MAKERS.includes(maker) ? "" : maker}
                  onChange={(e) => void pickMaker(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}

      {draft.evidenceUrl ? (
        <div className="mt-6 flex flex-col gap-3">
          <p className={`text-[18px] font-semibold ${D_TXT}`}>Who made these parts?</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { key: true, title: "The car maker (genuine)", sub: "Original factory parts", icon: "directions_car" },
              { key: false, title: "Another brand", sub: "A part maker's own parts", icon: "inventory_2" },
            ].map((c) => {
              const on = draft.madeByCarMaker === c.key;
              return (
                <button
                  key={String(c.key)}
                  type="button"
                  onClick={() => chooseKind(c.key)}
                  className={`flex min-h-[44px] items-center gap-3 rounded-xl border bg-white p-4 text-left transition-all dark:bg-[#111a2e] ${
                    on ? "border-[#0153dc] ring-2 ring-[#0153dc]/20" : "border-[#c5c6d0] hover:border-[#0153dc] dark:border-[#1e293b]"
                  }`}
                >
                  <DIconTile name={c.icon} tone={on ? "blue" : "grey"} />
                  <div className="flex-1">
                    <p className={`text-[15px] font-semibold ${D_TXT}`}>{c.title}</p>
                    <p className={`text-[13px] ${D_MUTED}`}>{c.sub}</p>
                  </div>
                  {on ? <MaterialIcon name="check_circle" className="text-[22px] text-[#0153dc]" /> : null}
                </button>
              );
            })}
          </div>
          {draft.partKind === "aftermarket" ? (
            <div className="flex flex-col gap-2 rounded-xl bg-[#f3f4fb] p-4 dark:bg-[#0b1220]">
              <label className={`text-[14px] font-semibold ${D_TXT}`} htmlFor="catalog-brand">
                Brand
              </label>
              <input
                id="catalog-brand"
                aria-label="Brand"
                className="h-11 rounded-lg border border-[#c5c6d0] bg-white px-3 text-[14px] dark:bg-[#111a2e] dark:border-[#1e293b]"
                placeholder="Search or type the brand (e.g. Brembo, Denso)"
                value={draft.brandDefault}
                onChange={(e) => setDraft({ ...draft, brandDefault: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                {COMMON_BRANDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setDraft({ ...draft, brandDefault: b })}
                    className={`min-h-[32px] rounded-full border px-3 text-[13px] ${
                      draft.brandDefault.toLowerCase() === b.toLowerCase()
                        ? "border-[#0153dc] bg-[#dbe1ff] text-[#0153dc] font-semibold"
                        : "border-[#c5c6d0] bg-white text-[#30323b] dark:bg-[#111a2e] dark:text-[#e2e8f0]"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {draft.evidenceUrl && hints && !trusted ? (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-[#f5d28a] bg-[#fff4dc] p-4 dark:border-[#78350f] dark:bg-[#451a03] sm:flex-row sm:items-center">
          <p className="flex items-start gap-2 text-[14px] text-[#8a5a00] dark:text-[#fbbf24]">
            <MaterialIcon name="warning" className="text-[20px]" />
            This site isn&apos;t on the trusted list, so these fits will save as Needs checking.
          </p>
          {owner ? (
            <PartsButton variant="secondary" className="shrink-0" onClick={() => setTrustOpen(true)}>
              Trust this site
            </PartsButton>
          ) : (
            <p className={`shrink-0 text-[13px] ${D_MUTED}`}>Ask the owner to trust this site.</p>
          )}
        </div>
      ) : null}

      <DFooter
        left={<PartsButton variant="danger" onClick={onCancel}>Cancel</PartsButton>}
        right={
          <div className="flex flex-col items-end gap-1">
            <PartsButton variant="primary" onClick={onNext} disabled={Boolean(blocker)}>
              Next: the cars <MaterialIcon name="arrow_forward" className="text-[18px]" />
            </PartsButton>
            {blocker ? <p className="text-[13px] text-error">{blocker}</p> : null}
          </div>
        }
      />

      <PartNumberGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />

      <AlertDialog open={trustOpen} onOpenChange={(next) => { if (!next) setTrustOpen(false); }}>
        <AlertDialogContent className="max-w-[480px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Trust this site?</AlertDialogTitle>
            <AlertDialogDescription>Nothing you typed is lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="flex flex-col gap-2 text-[14px]">
            <div className="flex items-center justify-between gap-3">
              <dt className={D_MUTED}>Site</dt>
              <dd className="font-semibold text-[#30323b] dark:text-[#e2e8f0]">{siteDomain || "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className={D_MUTED}>{draft.partKind === "aftermarket" ? "Brand" : "Maker"}</dt>
              <dd className="flex items-center gap-2 font-semibold text-[#30323b] dark:text-[#e2e8f0]">
                {maker ? <MakerLogo make={draft.partKind === "aftermarket" ? draft.brandDefault : maker} className="h-5 w-5" /> : null}
                {(draft.partKind === "aftermarket" ? draft.brandDefault.trim() : maker) || "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className={D_MUTED}>Trust it as</dt>
              <dd className="rounded-full bg-[#dbe1ff] px-3 py-1 text-[13px] font-semibold text-[#0153dc]">
                {draft.partKind === "aftermarket" ? "Part maker's own site" : "Car-maker catalogue"}
              </dd>
            </div>
          </dl>
          <p className="rounded-xl bg-[#f3f4fb] p-3 text-[13px] text-[#5d5f68] dark:bg-[#0b1220] dark:text-[#94a3b8]">
            Verified means we trust this site to confirm a part for {maker || "this maker"}. Reference sites can suggest a
            number but never confirm one.
          </p>
          <p className={`text-[13px] ${D_MUTED}`}>Only the platform owner can change trusted sites.</p>
          {trustError ? <p className="text-[13px] text-error">{trustError}</p> : null}
          <AlertDialogFooter>
            <PartsButton variant="secondary" onClick={() => setTrustOpen(false)}>
              Cancel
            </PartsButton>
            <PartsButton variant="primary" onClick={() => void confirmTrustSite()} disabled={trustBusy}>
              {trustBusy ? "Adding…" : "Trust this site"}
            </PartsButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
