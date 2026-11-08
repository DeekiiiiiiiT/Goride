import { useState, type ReactNode } from "react";
import { PartsButton } from "../../PartsButton";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { CatalogPageDraft, SourceType } from "../addPartsTypes";
import { fetchSelfServeLinkHints } from "../addPartsApi";
import { MakerLogo } from "../../../vehicle-catalog/MakerLogo";
import { D_MUTED, D_TINT, D_TXT, DFooter, DIconTile, DPill, DQuestion } from "./dominionKit";

export function CatalogStep1Page({
  draft,
  setDraft,
  onNext,
  onCancel,
}: {
  draft: CatalogPageDraft;
  setDraft: (d: CatalogPageDraft) => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [unknownStep, setUnknownStep] = useState<"kind" | "maker" | null>(null);

  async function applyUrl(url: string) {
    const t = url.trim();
    if (!t) {
      setDraft({ ...draft, evidenceUrl: "", linkHints: null });
      return;
    }
    if (!/^https?:\/\//i.test(t)) {
      setUrlError("That doesn't look like a web link. Copy it from your browser's address bar.");
      return;
    }
    setUrlError("");
    setLoading(true);
    try {
      const hints = await fetchSelfServeLinkHints(t);
      const maker = hints.catalogMaker ?? draft.catalogCarMaker;
      const trusted = hints.trustedSite === true;
      setDraft({
        ...draft,
        evidenceUrl: t,
        linkHints: hints,
        catalogCarMaker: maker ?? "",
        madeByCarMaker: hints.sourceTrust === "confirmed" ? true : draft.madeByCarMaker,
        sourceType: trusted ? "car_maker_catalogue" : draft.sourceType === "car_maker_catalogue" && !trusted ? "other" : draft.sourceType,
        partKind: maker ? "oem" : draft.partKind,
        brandDefault: maker ?? draft.brandDefault,
      });
      if (!trusted && hints.sourceTrust === "needs_checking") setUnknownStep("kind");
    } catch {
      setUrlError("Could not read that link. Check it and try again.");
    } finally {
      setLoading(false);
    }
  }

  const hints = draft.linkHints;
  const siteLabel = hints?.host ?? (draft.evidenceUrl ? "Link" : "");
  const trusted = hints?.trustedSite;

  const urlHost = (() => { try { return new URL(draft.evidenceUrl).hostname; } catch { return ""; } })();
  const siteName = (hints?.host || urlHost) ? (hints?.host || urlHost).replace(/^www\./, "").replace(/\.(com|net|org|jp|co\.jp)$/i, "") : "";
  const sitePretty = siteName ? siteName.charAt(0).toUpperCase() + siteName.slice(1) : "";
  const COMMON_MAKERS = ["Toyota", "Daihatsu", "Subaru", "Suzuki", "Honda", "Nissan"];
  const COMMON_BRANDS = ["NiBK", "SB", "Brembo", "Akebono", "KYB", "MANN-FILTER", "Denso", "NGK"];

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

  const nextBtn = (
    <PartsButton variant="primary" onClick={onNext} disabled={!draft.evidenceUrl.trim()}>
      Next: the cars <MaterialIcon name="arrow_forward" className="text-[18px]" />
    </PartsButton>
  );

  return (
    <div className="flex flex-col">
      <DQuestion
        title="Paste the page you're looking at"
        hint="The catalogue page that shows the part numbers — e.g. a Partsouq, Amayama or Megazip diagram, or the part maker's own website."
        actions={nextBtn}
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

      {draft.evidenceUrl && hints?.ok !== false && siteLabel ? (
        <div className="mt-6 flex flex-col gap-2">
          <p className={`text-[14px] font-semibold ${D_TXT}`}>What we worked out</p>
          <div className={`${D_TINT} flex flex-col gap-2 p-2`}>
            {answerRow(
              "public",
              <>
                <span className={D_MUTED}>Site:</span> <span className="font-semibold">{sitePretty}</span>
                {trusted ? <DPill tone="green" icon="verified_user">Trusted site</DPill> : <DPill tone="amber">Needs checking</DPill>}
              </>,
              () => setDraft({ ...draft, evidenceUrl: "", linkHints: null }),
            )}
            {hints?.catalogMaker
              ? answerRow(
                  "menu_book",
                  <>
                    <span className={D_MUTED}>Whose catalogue:</span>
                    <span className="font-semibold">{hints.catalogMaker}&apos;s own catalogue</span>
                  </>,
                  () => setUnknownStep("kind"),
                )
              : null}
            {draft.madeByCarMaker !== false && hints?.catalogMaker
              ? answerRow(
                  "precision_manufacturing",
                  <>
                    <span className="font-semibold">Genuine {hints.catalogMaker} parts</span>
                    <span className={`text-[13px] ${D_MUTED}`}>(made by the car maker)</span>
                  </>,
                  () => setUnknownStep("kind"),
                )
              : null}
          </div>
        </div>
      ) : null}

      {unknownStep && !trusted ? (
        <div className="mt-6 flex flex-col gap-5 rounded-xl border border-[#e6e7ee] bg-[#f9f9fd] p-5 dark:border-[#1e293b] dark:bg-[#0b1220]">
          <div>
            <p className={`text-[18px] font-semibold ${D_TXT}`}>Who made these parts?</p>
            <p className={`text-[14px] ${D_MUTED}`}>The car maker&apos;s own parts, or another brand&apos;s.</p>
          </div>
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
                  onClick={() => {
                    if (c.key) {
                      setDraft({ ...draft, madeByCarMaker: true, partKind: "oem", sourceType: "car_maker_catalogue" });
                      setUnknownStep("maker");
                    } else {
                      setDraft({ ...draft, madeByCarMaker: false, partKind: "aftermarket", sourceType: "part_maker_catalogue" });
                      setUnknownStep("maker");
                    }
                  }}
                  className={`flex items-center gap-3 rounded-xl border bg-white p-4 text-left transition-all dark:bg-[#111a2e] ${
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

          {unknownStep === "maker" && draft.madeByCarMaker === true ? (
            <div className="flex flex-col gap-3">
              <p className={`text-[15px] font-semibold ${D_TXT}`}>Which car maker?</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {COMMON_MAKERS.map((m) => {
                  const on = draft.catalogCarMaker === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDraft({ ...draft, catalogCarMaker: m, brandDefault: m })}
                      className={`flex flex-col items-center gap-2 rounded-xl border bg-white p-3 dark:bg-[#111a2e] ${
                        on ? "border-[#0153dc] ring-2 ring-[#0153dc]/20" : "border-[#e6e7ee] hover:border-[#c5c6d0] dark:border-[#1e293b]"
                      }`}
                    >
                      <MakerLogo make={m} size={36} />
                      <span className={`text-[13px] font-medium ${on ? "text-[#0153dc]" : D_TXT}`}>{m}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {unknownStep === "maker" && draft.madeByCarMaker === false ? (
            <div className="flex flex-col gap-3">
              <p className={`text-[15px] font-semibold ${D_TXT}`}>Which brand?</p>
              <input
                className="h-10 max-w-sm rounded-lg border border-[#c5c6d0] bg-white px-3 dark:border-[#1e293b] dark:bg-[#111a2e]"
                placeholder="Type the brand"
                value={draft.brandDefault}
                onChange={(e) => setDraft({ ...draft, brandDefault: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                {COMMON_BRANDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setDraft({ ...draft, brandDefault: b })}
                    className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium ${
                      draft.brandDefault === b
                        ? "border-[#0153dc] bg-[#dbe1ff] text-[#0153dc]"
                        : `border-[#c5c6d0] bg-white dark:border-[#1e293b] dark:bg-[#111a2e] ${D_TXT}`
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col justify-between gap-3 rounded-xl border border-[#f5d28a] bg-[#fff4dc] p-4 dark:border-[#78350f] dark:bg-[#451a03] sm:flex-row sm:items-center">
            <p className="flex items-start gap-2 text-[14px] text-[#8a5a00] dark:text-[#fbbf24]">
              <MaterialIcon name="warning" className="text-[20px]" />
              This site isn&apos;t on your trusted list, so these fits will save as Needs checking.
            </p>
            <PartsButton
              variant="secondary"
              className="shrink-0"
              onClick={() => { window.location.search = "?page=parts-catalog&tab=Trusted%20sources"; }}
            >
              Add this site to trusted sources
            </PartsButton>
          </div>
        </div>
      ) : null}

      <DFooter
        left={<PartsButton variant="danger" onClick={onCancel}>Cancel</PartsButton>}
        right={nextBtn}
      />
    </div>
  );
}
