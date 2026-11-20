/**
 * Slice C — "Parts that fit this car" on a part job in Log service (Stitch screens 1–4, 9, 10;
 * docs/log-service-parts-gaps-audit.md LC-01, LC-02, LC-05). Replaces the Brand / Part number / Link part boxes
 * while the log_service_parts_gaps switch is on. Never asks for a part number; no prices, stock or selling.
 */
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../services/api";
import { LS, LT } from "./logServiceStitch";
import {
  askNeedText,
  carSizeLine,
  brandNumbersFromLookup,
  partCopyText,
  findQueryFor,
  makerTile,
  PARTS_FIT_COPY as C,
  partsFromFindBody,
  shortDate,
  type FindAsk,
  type FitLabel,
  type FitPart,
  type PartsForJob,
} from "./partsThatFit";
import type { StoreBrandNumber } from "../../find-parts/everyday/storeCopyText";
import type { PartPick } from "./partPick";
import { OtherPartSearch } from "./OtherPartSearch";

function Sym({ name, size, className = "", fill = false }: { name: string; size: number; className?: string; fill?: boolean }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: size, ...(fill ? { fontVariationSettings: "'FILL' 1" } : {}) }}
      aria-hidden
    >
      {name}
    </span>
  );
}

const BTN_SOFT = `${LS.lowest} ${LS.text} ${LS.hoverMid} shadow-sm border border-[#e2e8f0] dark:border-[#32333e] transition-colors`;

const BADGE: Record<FitLabel, { cls: string; icon: string }> = {
  made_for_car: { cls: "bg-[#ecfdf5] text-[#059669] dark:bg-[#064e3b] dark:text-[#34d399]", icon: "verified_user" },
  also_fits: { cls: "bg-[#eff6ff] text-[#2563eb] dark:bg-[#172554] dark:text-[#93c5fd]", icon: "link" },
  fits_by_size: { cls: "bg-[#eff6ff] text-[#2563eb] dark:bg-[#172554] dark:text-[#93c5fd]", icon: "straighten" },
  check_before_buying: { cls: "bg-[#fffbeb] text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24]", icon: "warning" },
};

export function FitBadge({ label }: { label: FitLabel }) {
  const b = BADGE[label];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${LT.labelSm} shrink-0 ${b.cls}`}
      data-testid="parts-fit-badge"
      data-fit={label}
    >
      <Sym name={b.icon} size={14} />
      {C.badge[label]}
    </span>
  );
}

export function MakerTile({ brand, size = "md" }: { brand: string; size?: "sm" | "md" }) {
  const t = makerTile(brand || "?");
  return (
    <div
      className={`${size === "sm" ? "w-7 h-7 text-[9px]" : "w-11 h-11 text-[11px]"} rounded-full flex items-center justify-center shrink-0 font-extrabold tracking-tighter leading-none ${t.cls}`}
      aria-hidden
    >
      {t.text}
    </div>
  );
}

/** Copies the full part info (same block as Find parts' "Copy part info"); just the number when no text is given. */
export function CopyNumberButton({ number, text }: { number: string; text?: string | (() => string) }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title="Copy part info"
      data-testid="parts-fit-copy"
      onClick={(e) => {
        e.stopPropagation();
        const value = (typeof text === "function" ? text() : text) || number;
        const write = navigator.clipboard?.writeText?.(value);
        if (!write) {
          toast.error(C.copyFailed);
          return;
        }
        write.then(
          () => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1500);
          },
          () => toast.error(C.copyFailed),
        );
      }}
      className={`inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-lg shrink-0 ${BTN_SOFT}`}
    >
      <Sym name={done ? "check" : "content_copy"} size={14} className={LS.muted} />
      {done ? C.copied : C.copy}
    </button>
  );
}

function PartCard({
  part,
  chosen,
  dimmed,
  onPick,
  copyText,
  readOnly = false,
}: {
  part: FitPart;
  chosen: boolean;
  dimmed: boolean;
  onPick: () => void;
  /** Full "Copy part info" text (car, part, numbers). */
  copyText: () => string;
  /** Read-only ("Parts to buy"): the card can't be picked. */
  readOnly?: boolean;
}) {
  const pickable = readOnly
    ? {}
    : {
        role: "button",
        tabIndex: 0,
        "aria-pressed": chosen,
        onClick: onPick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPick();
          }
        },
      };
  return (
    <div
      {...pickable}
      data-testid="parts-fit-card"
      data-part-id={part.partId}
      className={`relative rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${readOnly ? "" : "cursor-pointer hover:shadow-md"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b41e1] ${LS.lowest} ${
        chosen
          ? "ring-2 ring-black/90 dark:ring-white/80 shadow-[0_2px_8px_rgba(3,2,19,0.04)]"
          : "ring-1 ring-[#e5eeff] dark:ring-[#32333e] shadow-[0_2px_6px_rgba(3,2,19,0.02)]"
      } ${dimmed ? "opacity-50" : ""}`}
    >
      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
        <MakerTile brand={part.brand} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className={`${LT.titleSm} text-[15px] ${LS.text} leading-snug`}>{part.name}</h4>
            <span className="sm:hidden">
              <FitBadge label={part.fitLabel} />
            </span>
          </div>
          {part.brand ? <span className={`${LT.bodySm} ${LS.muted} block`}>{part.brand}</span> : null}
          {part.number ? (
            <div className={`flex items-center gap-2 mt-1.5 flex-wrap rounded-lg sm:rounded-none p-2 sm:p-0 ${LS.low} sm:bg-transparent sm:dark:bg-transparent`}>
              <span className={`${LT.labelMd} ${LS.muted}`}>{C.forTheStore}</span>
              <span
                className={`font-mono text-[13px] font-semibold tracking-wide px-2 py-0.5 rounded ${LS.text} ${LS.mid}`}
                data-testid="parts-fit-number"
              >
                {part.number}
              </span>
              <CopyNumberButton number={part.number} text={copyText} />
            </div>
          ) : null}
          {chosen ? (
            <p className={`sm:hidden mt-2.5 flex items-center gap-1.5 ${LT.labelMd} text-[#4b41e1] dark:text-[#c3c0ff]`}>
              <Sym name="check_circle" size={16} fill />
              Selected for this service
            </p>
          ) : null}
        </div>
      </div>
      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
        <FitBadge label={part.fitLabel} />
      </div>
    </div>
  );
}

/** The car's own size (e.g. "Toyota lists for your car · Battery size: M-42 · EFB") above the parts. */
function CarSizeBox({ data, hasParts }: { data: PartsForJob; hasParts: boolean }) {
  if (!data.carSizes.length) return null;
  return (
    <div className={`rounded-xl p-3 px-4 flex items-start gap-3 ${LS.low}`} data-testid="parts-fit-car-size">
      <Sym name="verified" size={20} className="text-[#4b41e1] dark:text-[#c3c0ff] mt-0.5 shrink-0" />
      <div className="min-w-0">
        {data.carSizes.map((size) => (
          <div key={size.specKey}>
            <span className={`${LT.labelSm} ${LS.muted} block`}>{C.carSizeTitle(data.carMake, size.fromCarMaker)}</span>
            <span className={`${LT.titleSm} text-[15px] ${LS.text}`} data-testid="parts-fit-car-size-line">{carSizeLine(size)}</span>
          </div>
        ))}
        {hasParts ? <span className={`${LT.bodySm} ${LS.muted} block mt-0.5`}>{C.carSizeFitsBelow}</span> : null}
      </div>
    </div>
  );
}

function PlanItButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="parts-fit-plan-it"
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg ${LT.labelMd} ${BTN_SOFT}`}
    >
      <Sym name="calendar_today" size={16} className={LS.muted} />
      {label}
    </button>
  );
}

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ok"; data: PartsForJob };

export type PartsThatFitPanelProps = {
  vehicleId: string;
  jobId: string;
  /** The job's name in lower case for sentences ("rear oxygen sensor"). */
  jobName: string;
  /** Places picked on the job ("before_cat", "LF"…). */
  places: string[];
  /** The same places in words ("Rear (Oxygen sensor No.2)"). */
  placeLabels: string[];
  /** The job has places and none is picked yet: the panel waits. */
  needsPlace: boolean;
  /** The line's chosen part. */
  partId: string | null;
  /** The chosen part when it isn't in today's list (an older saved line). */
  chosenInfo?: { name: string; brand: string; number: string } | null;
  onPick: (part: FitPart | null) => void;
  /** Shown only on a new service (not when editing one, not on Log it now). */
  onPlanIt?: (part: FitPart | null) => void;
  /**
   * LC-10 "Parts to buy": an inspection's not-done-yet job. Same cards + Copy part info, nothing to pick,
   * no Skip / Plan it (the job is already on the car's list). Ask Roam stays when nothing is on file.
   */
  toBuy?: boolean;
  /** LC-21: the part used when it isn't a tapped card (found by its label, by size, or added); null when none. */
  otherPick?: PartPick | null;
  /** LC-21: shows "I used a different …". Null clears the pick. */
  onPickOther?: (pick: PartPick | null) => void;
};

export function PartsThatFitPanel(props: PartsThatFitPanelProps) {
  const { vehicleId, jobId, places, needsPlace, onPick, toBuy = false } = props;
  const onPickOther = toBuy ? undefined : props.onPickOther;
  const other = onPickOther ? props.otherPick ?? null : null;
  // A found / added part is the line's part: no card reads as chosen while it is in use.
  const partId = toBuy || other ? null : props.partId;
  const onPlanIt = toBuy ? undefined : props.onPlanIt;
  const typeIn = (data: PartsForJob | null) =>
    onPickOther ? (
      <OtherPartSearch
        vehicleId={vehicleId}
        jobId={jobId}
        jobName={props.jobName}
        data={data}
        pick={other}
        onPickOther={onPickOther}
        onPickListed={(p) => onPick(p)}
      />
    ) : null;
  const typed = other;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [asking, setAsking] = useState(false);
  const [askOverride, setAskOverride] = useState<FindAsk | null>(null);
  /** Other brands' numbers per part, loaded ahead so Copy works at once (same lookup Find parts uses). */
  const [brandNumbers, setBrandNumbers] = useState<Map<string, StoreBrandNumber[]>>(new Map());
  const placesKey = places.join(",");

  const load = useCallback(() => {
    let live = true;
    setState({ kind: "loading" });
    setAskOverride(null);
    api
      .findParts(findQueryFor(vehicleId, jobId, placesKey ? placesKey.split(",") : []))
      .then((body: unknown) => live && setState({ kind: "ok", data: partsFromFindBody(body) }))
      .catch(() => live && setState({ kind: "error" }));
    return () => {
      live = false;
    };
  }, [vehicleId, jobId, placesKey]);

  useEffect(() => {
    if (needsPlace) return;
    return load();
  }, [load, needsPlace]);

  const loadedParts = state.kind === "ok" ? state.data.parts : null;
  const variantId = state.kind === "ok" ? state.data.copyCar.variantId : null;
  useEffect(() => {
    if (!loadedParts?.length) return;
    let live = true;
    for (const p of loadedParts) {
      api
        .partsLookup(p.partId, variantId ?? undefined)
        .then((body: unknown) => {
          if (!live) return;
          const list = brandNumbersFromLookup(body);
          setBrandNumbers((prev) => new Map(prev).set(p.partId, list));
        })
        .catch(() => undefined); // Copy still gives the car, part and number.
    }
    return () => {
      live = false;
    };
  }, [loadedParts, variantId]);

  const header = (
    <div className="flex items-start gap-2.5">
      <Sym name="directions_car" size={20} className={`mt-0.5 ${LS.text}`} />
      <div>
        <h3 className={`text-[16px] leading-5 font-semibold ${LS.text}`} data-testid="parts-fit-title">
          {(toBuy ? C.toBuyTitle : C.title)(state.kind === "ok" ? state.data.carName : null)}
        </h3>
        <p className={`${LT.bodySm} ${LS.muted} mt-0.5`}>{toBuy ? C.toBuyHelper : C.helper}</p>
      </div>
    </div>
  );

  const wrap = (body: React.ReactNode) => (
    <div
      className={toBuy ? "pt-3 space-y-3" : "pt-4 border-t border-[#e5eeff] dark:border-[#32333e] space-y-3.5"}
      data-testid="parts-fit-panel"
      data-mode={toBuy ? "to-buy" : "pick"}
    >
      {body}
    </div>
  );
  // Owner 20 Nov: no "Skip — I don't know the part". Tapping a part is optional (no tap = no part on the line);
  // Change undoes a pick; a different part goes in "I used a different …" (LC-20).

  if (needsPlace) {
    return wrap(
      <>
        {header}
        <p className={`flex items-center gap-1.5 ${LT.bodySm} ${LS.outline}`} data-testid="parts-fit-pick-place">
          <Sym name="touch_app" size={16} />
          {C.pickPlaceFirst}
        </p>
      </>,
    );
  }

  if (state.kind === "loading") {
    return wrap(
      <>
        {header}
        <div className="space-y-3" aria-label={C.loading} data-testid="parts-fit-loading">
          {[0, 1].map((i) => (
            <div key={i} className={`rounded-2xl p-4 flex items-center gap-3.5 animate-pulse ${LS.lowest} ring-1 ring-[#e5eeff] dark:ring-[#32333e]`}>
              <div className={`w-11 h-11 rounded-full ${LS.highest}`} />
              <div className="flex-1 space-y-2">
                <div className={`h-3 w-2/5 rounded ${LS.highest}`} />
                <div className={`h-2.5 w-3/5 rounded ${LS.high}`} />
              </div>
              <div className={`h-6 w-28 rounded-full ${LS.high}`} />
            </div>
          ))}
        </div>
      </>,
    );
  }

  if (state.kind === "error") {
    return wrap(
      <>
        {header}
        <div className="rounded-xl bg-[#fff1f2] dark:bg-[#450a0a] p-3 flex items-start justify-between gap-3" data-testid="parts-fit-error">
          <div className="flex items-start gap-2">
            <Sym name="error" size={18} className="text-[#d4183d] dark:text-[#f87171] mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold text-[#d4183d] dark:text-[#f87171]">{C.loadFailed}</p>
              <p className={`${LT.bodySm} ${LS.muted}`}>{C.loadFailedBody}</p>
            </div>
          </div>
          <button type="button" onClick={() => load()} className={`h-8 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1 shrink-0 ${BTN_SOFT}`}>
            <Sym name="refresh" size={16} />
            {C.tryAgain}
          </button>
        </div>
        {typeIn(null)}
      </>,
    );
  }

  const { data } = state;

  if (!data.linked) {
    return wrap(
      <>
        {header}
        <p className={`rounded-xl p-3 ${LS.low} ${LT.bodySm} ${LS.muted}`} data-testid="parts-fit-not-linked">
          {C.notLinked}
        </p>
        {typeIn(data)}
      </>,
    );
  }

  const chosen = partId ? data.parts.find((p) => p.partId === partId) ?? null : null;
  const listed = data.parts;
  // A saved line's part that today's list doesn't show still reads as chosen.
  const orphan = partId && !chosen && props.chosenInfo ? props.chosenInfo : null;

  if (listed.length === 0 && !orphan) {
    const ask = askOverride ?? data.ask ?? { state: "none", askedAt: null, byYou: false };
    if (ask.state === "looking") {
      return wrap(
        <>
        <div className="rounded-xl p-4 sm:p-6 flex flex-col gap-4 bg-[#e2dfff]/30 dark:bg-[#2e2a5c]/40" data-testid="parts-fit-looking">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-[#e2dfff] dark:bg-[#3323cc]/40 flex items-center justify-center shrink-0 shadow-sm text-[#4b41e1] dark:text-[#c3c0ff]">
              <Sym name="schedule" size={26} />
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-[17px] font-semibold leading-snug text-[#1b192e] dark:text-[#e4e1ec]">{C.lookingTitle}</h3>
                {ask.askedAt ? (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full ${LS.lowest} text-[#069669] dark:text-[#34d399] shadow-xs`}>
                    <Sym name="check_circle" size={14} fill />
                    <span className={LT.labelSm} data-testid="parts-fit-asked-on">{C.askedOn(shortDate(ask.askedAt))}</span>
                  </span>
                ) : null}
              </div>
              <p className={`${LT.bodyMd} ${LS.muted} leading-relaxed`}>{C.lookingBody(props.jobName, data.carName)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onPlanIt ? <PlanItButton label={C.planItLater} onClick={() => onPlanIt(null)} /> : null}
          </div>
        </div>
        {typeIn(data)}
        </>,
      );
    }
    const sendAsk = async () => {
      setAsking(true);
      try {
        await api.requestFindPart({
          kind: "add_part_info",
          vehicleId,
          maintenanceComponentId: jobId,
          positionCodes: places,
          needText: askNeedText(props.jobName, props.placeLabels),
        });
        setAskOverride({ state: "looking", askedAt: new Date().toISOString(), byYou: true });
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : C.askFailed);
      } finally {
        setAsking(false);
      }
    };
    return wrap(
      <>
      <CarSizeBox data={data} hasParts={false} />
      <div className={`rounded-2xl p-6 shadow-sm ${LS.low}`} data-testid="parts-fit-none">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className={`w-14 h-14 rounded-2xl ${LS.lowest} text-[#4b41e1] dark:text-[#c3c0ff] flex items-center justify-center shrink-0 shadow-sm`}>
            <Sym name="manage_search" size={32} />
          </div>
          <div className="flex-1">
            <h4 className={`${LT.headlineMd} ${LS.text} mb-1.5`}>{C.noneTitle(data.carName)}</h4>
            <p className={`${LT.bodyMd} ${LS.muted} leading-relaxed mb-4`}>{C.noneBody(props.jobName)}</p>
            <div className="flex flex-col gap-2 items-start">
              <button
                type="button"
                disabled={asking}
                onClick={() => void sendAsk()}
                data-testid="parts-fit-ask"
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4b41e1] hover:bg-[#3323cc] text-white ${LT.labelMd} font-semibold shadow-md transition-colors disabled:opacity-60`}
              >
                <Sym name="travel_explore" size={18} />
                {asking ? C.asking : C.ask}
              </button>
              {toBuy ? null : <span className={`${LT.bodySm} ${LS.muted}`}>{C.saveAnyway}</span>}
            </div>
          </div>
        </div>
      </div>
      {typeIn(data)}
      </>,
    );
  }

  return wrap(
    <>
      {header}
      <div className="space-y-3">
        <CarSizeBox data={data} hasParts={listed.length > 0} />
        {orphan ? (
          <div className={`rounded-2xl p-4 flex items-center gap-3.5 ring-2 ring-black/90 dark:ring-white/80 ${LS.lowest}`} data-testid="parts-fit-chosen-saved">
            <MakerTile brand={orphan.brand} />
            <div className="min-w-0">
              <h4 className={`${LT.titleSm} text-[15px] ${LS.text}`}>{orphan.name}</h4>
              {orphan.brand ? <span className={`${LT.bodySm} ${LS.muted} block`}>{orphan.brand}</span> : null}
              {orphan.number ? (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={`${LT.labelMd} ${LS.muted}`}>{C.forTheStore}</span>
                  <span className={`font-mono text-[13px] font-semibold tracking-wide px-2 py-0.5 rounded ${LS.text} ${LS.mid}`}>{orphan.number}</span>
                  <CopyNumberButton number={orphan.number} text={() => partCopyText(data.copyCar, orphan, undefined, props.placeLabels)} />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {listed.map((p) => (
          <PartCard
            key={p.partId}
            part={p}
            chosen={p.partId === partId}
            dimmed={Boolean(typed) || (Boolean(partId) && p.partId !== partId)}
            onPick={() => onPick(p)}
            readOnly={toBuy}
            copyText={() => partCopyText(data.copyCar, p, brandNumbers.get(p.partId), props.placeLabels)}
          />
        ))}
      </div>
      {chosen || orphan ? (
        <div className="p-3 px-4 rounded-xl bg-[#ecfdf5] dark:bg-[#064e3b]/60 flex items-center justify-between gap-3 shadow-sm" data-testid="parts-fit-using">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[#059669] text-white flex items-center justify-center shrink-0">
              <Sym name="check" size={16} />
            </div>
            <span className={`${LT.labelMd} font-semibold text-[#059669] dark:text-[#34d399]`}>
              {chosen ? C.using(chosen.brand, chosen.name) : C.using(orphan!.brand, orphan!.name)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onPick(null)}
            data-testid="parts-fit-change"
            className={`px-3 py-1 text-xs font-semibold rounded-lg shrink-0 ${BTN_SOFT}`}
          >
            {C.change}
          </button>
        </div>
      ) : null}
      {chosen || orphan ? null : typeIn(data)}
      {!toBuy && onPlanIt ? (
        <div className="pt-2 flex items-center gap-2">
          <PlanItButton label={C.planIt} onClick={() => onPlanIt(chosen)} />
          <span className={`${LT.bodySm} ${LS.muted} hidden md:inline`}>{C.planItHelper}</span>
        </div>
      ) : null}
    </>,
  );
}
