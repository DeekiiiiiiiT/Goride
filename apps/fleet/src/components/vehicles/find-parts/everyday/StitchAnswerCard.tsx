/**
 * F6 — "the answer" card, ported from
 * docs/stitch/fleet-find-parts-everyday/front_brake_pads_the_answer_04465_b1190/code.html
 * Keep / Drop / Add: docs/roomy-brakes-full-fit-audit.md → F6.
 * Dropped from the export: "Direct Fit Pair", "Genuine geometry illustration", the marketing paragraph,
 * "Exact Fit", "recognized across auto suppliers island-wide", brand adjectives, the theme switcher.
 */
import { useState } from "react";
import { MakerLogo, TrustBadge, mapTrustLabel } from "./EverydayShared";

export type WheelSpot = "front" | "rear" | "all" | "none" | "front-left" | "front-right" | "rear-left" | "rear-right";

type AltNumber = { brand: string; number: string };
type FitRow = { make: string; model: string; isYourCar?: boolean };

const ORANGE = "#EA580C";

/** Clean line brake pad (Stitch export, unchanged geometry). */
export function StitchPadIllustration() {
  return (
    <svg
      className="h-36 w-56 text-[#0b1c30] transition-transform duration-300 group-hover:scale-105 dark:text-[#fafafa]"
      fill="none"
      viewBox="0 0 240 150"
      aria-hidden
    >
      <path
        d="M42 32C84 20 156 20 198 32C208 35 214 44 212 55L208 92C206 102 198 109 188 111C154 117 86 117 52 111C42 109 34 102 32 92L28 55C26 44 32 35 42 32Z"
        className="fill-[#E2E8F0] dark:fill-[#3a3a3d]"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      <path
        d="M52 44C88 34 152 34 188 44C194 45 198 51 197 57L194 84C193 90 188 95 182 96C152 100 88 100 58 96C52 95 47 90 46 84L43 57C42 51 46 45 52 44Z"
        className="fill-[#CBD5E1] dark:fill-[#2a2a2d]"
        stroke="currentColor"
        strokeWidth="2"
      />
      <line stroke="currentColor" strokeDasharray="3 3" strokeWidth="2" x1="120" x2="120" y1="42" y2="98" />
      <rect className="fill-[#94A3B8] dark:fill-[#52525b]" height="28" rx="3" stroke="currentColor" strokeWidth="2" width="10" x="18" y="58" />
      <rect className="fill-[#94A3B8] dark:fill-[#52525b]" height="28" rx="3" stroke="currentColor" strokeWidth="2" width="10" x="212" y="58" />
      <circle cx="70" cy="70" fill="currentColor" r="4" />
      <circle cx="170" cy="70" fill="currentColor" r="4" />
      <path d="M218 72C226 72 232 78 232 86V102" stroke="#F97316" strokeLinecap="round" strokeWidth="2.5" />
      <rect fill="#F97316" height="6" rx="1" width="8" x="228" y="102" />
    </svg>
  );
}

/** Top-down car with the matching wheels lit orange (Stitch export geometry). */
export function StitchCarPosition({ spot }: { spot: WheelSpot }) {
  const lit = (w: "fl" | "fr" | "rl" | "rr") => {
    if (spot === "all") return true;
    if (spot === "none") return false;
    if (spot === "front") return w === "fl" || w === "fr";
    if (spot === "rear") return w === "rl" || w === "rr";
    return (
      (spot === "front-left" && w === "fl") ||
      (spot === "front-right" && w === "fr") ||
      (spot === "rear-left" && w === "rl") ||
      (spot === "rear-right" && w === "rr")
    );
  };
  // Viewed from above, front at the top: the car's left is on the viewer's left.
  const wheels: Array<{ w: "fl" | "fr" | "rl" | "rr"; x: number; y: number; h: number }> = [
    { w: "fl", x: 8, y: 18, h: 16 },
    { w: "fr", x: 55, y: 18, h: 16 },
    { w: "rl", x: 8, y: 66, h: 15 },
    { w: "rr", x: 55, y: 66, h: 15 },
  ];
  return (
    <svg className="h-full w-full text-[#78767d] dark:text-[#52525b]" fill="none" viewBox="0 0 70 100" aria-hidden>
      <rect className="fill-[#F8FAFC] dark:fill-[#2a2a2d]" height="80" rx="12" stroke="currentColor" strokeWidth="1.5" width="34" x="18" y="10" />
      <path d="M22 28H48" stroke="currentColor" strokeWidth="1.2" />
      <path d="M22 68H48" stroke="currentColor" strokeWidth="1.2" />
      <path d="M22 34C28 31 42 31 48 34" stroke="currentColor" strokeWidth="1.5" />
      <path d="M24 64C30 66 40 66 46 64" stroke="currentColor" strokeWidth="1.5" />
      {wheels.map(({ w, x, y, h }) =>
        lit(w) ? (
          <rect key={w} fill={ORANGE} height={h} rx="2" width="7" x={x} y={y} />
        ) : (
          <rect key={w} className="fill-[#94A3B8] dark:fill-[#52525b]" height={h} rx="2" width="7" x={x} y={y} />
        ),
      )}
    </svg>
  );
}

/** Page header: bordered Back button, title, "for your …", plate chip with the orange dot. */
export function StitchAnswerHeader({
  title,
  carLabel,
  plate,
  backLabel,
  onBack,
}: {
  title: string;
  carLabel: string;
  plate?: string;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="mb-8 flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-[#cbd5e1] bg-white px-3 py-1.5 text-sm font-medium text-[#47464c] transition-colors hover:text-[#0b1c30] dark:border-[#3a3a3d] dark:bg-[#2a2a2d] dark:text-[#a1a1aa] dark:hover:text-[#fafafa]"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        <span>{backLabel}</span>
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-[#0b1c30] dark:text-[#fafafa]">{title}</h1>
        <span className="hidden text-sm text-[#47464c] dark:text-[#a1a1aa] sm:inline">·</span>
        <span className="text-sm text-[#47464c] dark:text-[#a1a1aa]">for your {carLabel}</span>
        {plate ? (
          <span className="inline-flex items-center gap-1 rounded bg-[#dce9ff] px-2.5 py-1 text-[13px] font-semibold uppercase tracking-wide text-[#0b1c30] shadow-sm dark:bg-[#3a3a3d] dark:text-[#fafafa]">
            <span className="h-2 w-2 rounded-full bg-[#d95f00]" />
            {plate}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function StitchAnswerCard({
  name,
  trust,
  brand,
  qtyLine,
  positionTitle,
  positionBody,
  spot,
  number,
  alts,
  fits,
  sourceUrl,
  onCopy,
  onSeeEveryCar,
  onUseInService,
  defaultAltsOpen = false,
}: {
  name: string;
  trust: string;
  brand?: string;
  qtyLine: string;
  positionTitle: string;
  positionBody: string;
  spot: WheelSpot;
  number: string;
  alts: AltNumber[];
  fits: FitRow[];
  sourceUrl?: string;
  onCopy: (text: string) => void;
  onSeeEveryCar: () => void;
  onUseInService?: () => void;
  defaultAltsOpen?: boolean;
}) {
  const [altsOpen, setAltsOpen] = useState(defaultAltsOpen);
  const [copied, setCopied] = useState(false);

  const others = fits.filter((r) => !r.isYourCar);
  const makers: string[] = [];
  for (const r of fits) if (r.make && !makers.includes(r.make)) makers.push(r.make);
  const shownMakers = makers.slice(0, 6);
  const extraMakers = makers.slice(6);
  // Name other cars, not other versions of your own model; one model per maker first so the line shows variety.
  const yourModels = fits.filter((r) => r.isYourCar).map((r) => r.model);
  const otherModels = others.filter((r) => r.model && !yourModels.includes(r.model));
  const models: string[] = [];
  const makersUsed = new Set<string>();
  for (const r of otherModels) {
    if (!makersUsed.has(r.make) && !models.includes(r.model)) {
      models.push(r.model);
      makersUsed.add(r.make);
    }
  }
  for (const r of otherModels) if (!models.includes(r.model)) models.push(r.model);
  const namesLine = models.length > 4 ? `${models.slice(0, 4).join(", ")} & more` : models.join(", ");

  function copyMain() {
    onCopy(number);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="relative w-full overflow-hidden rounded-[20px] bg-white p-6 shadow-xl dark:bg-[#1c1c1e] lg:p-8">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Left: picture + where it goes */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          <div className="group relative flex min-h-[260px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#eff4ff] p-6 dark:bg-[#2a2a2d]">
            <StitchPadIllustration />
          </div>
          <div className="flex w-full items-center gap-4 rounded-2xl bg-[#eff4ff] p-4 dark:bg-[#2a2a2d]">
            <div className="relative flex h-24 w-20 shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-sm dark:bg-[#1c1c1e]">
              <StitchCarPosition spot={spot} />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-semibold text-[#0b1c30] dark:text-[#fafafa]">{positionTitle}</span>
              <span className="text-sm text-[#47464c] dark:text-[#a1a1aa]">{positionBody}</span>
            </div>
          </div>
        </div>

        {/* Right: details */}
        <div className="flex flex-col gap-6 lg:col-span-8">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <TrustBadge trust={mapTrustLabel(trust)} />
              <span className="text-sm text-[#47464c] dark:text-[#a1a1aa]">· {qtyLine}</span>
            </div>
            <h2 className="text-[26px] font-semibold tracking-tight text-[#0b1c30] dark:text-[#fafafa]">{name}</h2>
            {brand ? <p className="text-base text-[#47464c] dark:text-[#a1a1aa]">Genuine {brand} part</p> : null}
          </div>

          {/* The number to give the store */}
          <div className="relative flex flex-col justify-between gap-5 overflow-hidden rounded-2xl bg-[#eff4ff] p-6 shadow-md dark:bg-[#2a2a2d] md:flex-row md:items-center">
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-[#47464c] dark:text-[#a1a1aa]">
                Give the store this number
              </span>
              <span
                className="font-['JetBrains_Mono',monospace] text-[22px] font-semibold leading-7 tracking-[0.08em] text-[#0b1c30] dark:text-white"
                data-testid="everyday-primary-number"
              >
                {number}
              </span>
            </div>
            <button
              type="button"
              onClick={copyMain}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#030213] px-5 py-3 text-base font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] dark:bg-[#fafafa] dark:text-[#1c1c1e]"
            >
              <span className="material-symbols-outlined text-[20px]">{copied ? "check" : "content_copy"}</span>
              <span>{copied ? "Copied" : "Copy number"}</span>
            </button>
          </div>

          {/* Other numbers */}
          {alts.length ? (
            <div className="flex flex-col gap-4 rounded-2xl bg-[#eff4ff]/60 p-5 dark:bg-[#2a2a2d]">
              <button
                type="button"
                className="group flex w-full items-center justify-between text-left"
                onClick={() => setAltsOpen((v) => !v)}
                aria-expanded={altsOpen}
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px] text-[#0b1c30] dark:text-[#fafafa]">swap_horiz</span>
                  <span className="text-[20px] font-semibold leading-7 tracking-[-0.01em] text-[#0b1c30] dark:text-[#fafafa]">
                    Other numbers stores may use
                  </span>
                  <span className="rounded-full bg-[#e5eeff] px-2 py-0.5 text-[12px] font-semibold text-[#47464c] dark:bg-[#3a3a3d] dark:text-[#a1a1aa]">
                    {alts.length}
                  </span>
                </div>
                <span className="material-symbols-outlined rounded-lg border border-[#cbd5e1] p-1 text-[#47464c] dark:border-[#3a3a3d] dark:text-[#a1a1aa]">
                  {altsOpen ? "expand_less" : "expand_more"}
                </span>
              </button>
              {altsOpen ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-2">
                    {alts.map((row, i) => (
                      <div
                        key={`${row.brand}-${row.number}`}
                        className={`flex items-center justify-between rounded-xl bg-white p-3.5 shadow-sm dark:bg-[#1c1c1e] ${
                          alts.length % 2 === 1 && i === alts.length - 1 ? "md:col-span-2" : ""
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-[12px] text-[#47464c] dark:text-[#a1a1aa]">{row.brand}</span>
                          <span className="font-['JetBrains_Mono',monospace] text-[16px] font-semibold tracking-wide text-[#0b1c30] dark:text-[#fafafa]">
                            {row.number}
                          </span>
                        </div>
                        <button
                          type="button"
                          title="Copy number"
                          aria-label={`Copy ${row.number}`}
                          onClick={() => onCopy(row.number)}
                          className="rounded-lg border border-[#cbd5e1] p-2 text-[#47464c] transition-colors hover:bg-[#eff4ff] hover:text-[#0b1c30] dark:border-[#3a3a3d] dark:text-[#a1a1aa] dark:hover:bg-[#2a2a2d] dark:hover:text-[#fafafa]"
                        >
                          <span className="material-symbols-outlined text-[18px]">content_copy</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-2.5 rounded-xl bg-white p-3 text-[#47464c] dark:bg-[#1c1c1e] dark:text-[#a1a1aa]">
                    <span className="material-symbols-outlined mt-0.5 text-[18px]">info</span>
                    <span className="text-sm leading-relaxed">These are the same pads made by other brands.</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Also fits */}
          {others.length ? (
            <div className="flex flex-col justify-between gap-4 rounded-2xl bg-[#eff4ff]/40 p-5 dark:bg-[#2a2a2d]/60 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-3.5">
                <div className="flex shrink-0 -space-x-2">
                  {shownMakers.map((m) => (
                    <div key={m} title={m} className="rounded-full shadow-sm ring-2 ring-white dark:ring-[#1c1c1e]">
                      <MakerLogo make={m} size={32} />
                    </div>
                  ))}
                </div>
                <div className="flex min-w-0 flex-col">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-base font-semibold text-[#0b1c30] dark:text-[#fafafa]">
                      Also fits {others.length} other {others.length === 1 ? "car" : "cars"}
                    </span>
                    {extraMakers.map((m) => (
                      <span
                        key={m}
                        className="rounded-full bg-[#e5eeff] px-2 py-0.5 text-[11px] font-semibold text-[#47464c] dark:bg-[#3a3a3d] dark:text-[#a1a1aa]"
                      >
                        + {m}
                      </span>
                    ))}
                  </div>
                  {namesLine ? <span className="truncate text-sm text-[#47464c] dark:text-[#a1a1aa]">{namesLine}</span> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={onSeeEveryCar}
                className="flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-medium text-[#0b1c30] shadow-sm transition-colors hover:bg-[#e5eeff] dark:border-[#3a3a3d] dark:bg-[#1c1c1e] dark:text-[#fafafa] md:self-auto"
              >
                <span>See every car ({fits.length})</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          ) : null}

          {/* Bottom actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            {onUseInService ? (
              <button
                type="button"
                onClick={onUseInService}
                className="flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-[#e5eeff] px-5 py-2.5 text-sm font-medium text-[#0b1c30] transition-colors hover:bg-[#dce9ff] dark:border-[#3a3a3d] dark:bg-[#2a2a2d] dark:text-[#fafafa]"
              >
                <span className="material-symbols-outlined text-[18px]">post_add</span>
                <span>Use in a service log</span>
              </button>
            ) : (
              <span />
            )}
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-medium text-[#47464c] no-underline transition-colors hover:text-[#0b1c30] dark:border-[#3a3a3d] dark:bg-[#1c1c1e] dark:text-[#a1a1aa] dark:hover:text-[#fafafa]"
              >
                <span>Open the maker&apos;s page</span>
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
