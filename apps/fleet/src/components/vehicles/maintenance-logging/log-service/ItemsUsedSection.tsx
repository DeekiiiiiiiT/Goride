/**
 * "Items used" on a job — Stitch service-items-fleet screens 1, 3, 8 (states) and 9 (phone).
 * Surfaces and text use Fleet tokens (same values as Stitch); Stitch's orange / green accents differ
 * from Fleet's own "secondary", so those are exact hex (see ACCENT).
 */
import React from "react";
import type { LineItemDraft } from "../../../../types/maintenance";
import {
  costRecorded,
  findSuggested,
  groupJobItems,
  itemAmount,
  itemErrorText,
  money,
  newOtherItem,
  pickedPartBadge,
  qtyWithUnit,
  stepQty,
  toggleSuggested,
  type JobItem,
} from "./itemsUsed";
import type { JobItemsStatus } from "./useJobItems";
import { cleanPartNumberInput, isUnknownPart, RoamLooksItUpLine, UNKNOWN_PART_COPY } from "./unknownParts";

/** Stitch accents (service-items-fleet tailwind config). */
export const ACCENT = {
  orange: "#fd651e",
  deepOrange: "#a73a00",
  peach: "#ffdbce",
  onPeach: "#370e00",
  green: "#069669",
  greenFixed: "#85f8c4",
  onGreenFixed: "#002114",
} as const;

export const ITEMS_COPY = {
  title: "Items used",
  selected: (n: number) => `${n} Selected`,
  helper: "Tick what was used. Nothing is ticked for you.",
  usually: "Usually used",
  sometimes: "Sometimes used",
  otherItem: "Other item",
  blankCostHelper: "Leave a cost blank if you don't know it. It won't be added to the total.",
  costEach: "Cost each",
  brand: "Brand",
  brandOptional: "Brand (optional)",
  quantity: "Quantity",
  costNotRecorded: "Cost not recorded",
  customItem: "Custom service item",
  whatWasIt: "What was it?",
  qty: "Qty",
  brandOpt: "Brand",
  lineTotal: "Line total:",
  remove: "Remove",
  fitsThisCar: "Fits this car",
  fitsBySize: "Check before buying",
  typedIn: "Typed in",
  change: "Change",
  pickAPart: "Pick a part",
  loadFailTitle: "Couldn't load standard parts for this job",
  loadFailBody: "You can still enter parts manually below.",
  tryAgain: "Try again",
  noneSuggested: "No standard items suggested for this service. Add parts or supplies if any were used.",
  kindSupply: "Supply",
  kindPart: "Part",
} as const;

type Props = {
  jobItems: JobItem[];
  /** "none" = this job has no Dominion group (preset), so no May-need list. */
  status: JobItemsStatus | "none";
  onRetry: () => void;
  items: LineItemDraft[];
  onChange: (items: LineItemDraft[]) => void;
  currency: string;
  /** The job's own charge (no items), for the total pill. */
  jobCharge: number;
  onPickPart: (item: LineItemDraft) => void;
  /** Shown between the items and the total pill (inspection jobs: "What the inspection found"). */
  beforeTotal?: React.ReactNode;
  /** Log service parts gaps switch (LS-18): Other item Part number box + "Roam will look this part up…". */
  gapsEnabled?: boolean;
};

const labelSm = "text-[11px] leading-[14px] tracking-[0.02em] font-semibold";
const labelMd = "text-[12px] leading-4 tracking-[0.01em] font-medium";
const bodySm = "text-[13px] leading-[18px]";
const titleSm = "text-sm leading-5 font-semibold";

function Stepper({ item, onQty }: { item: LineItemDraft; onQty: (q: string) => void }) {
  return (
    <div className="flex items-center bg-surface-container-lowest rounded-lg p-0.5 shadow-xs">
      <button
        type="button"
        aria-label="Less"
        className="w-7 h-7 rounded flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors font-bold text-sm"
        onClick={() => onQty(stepQty(item.qty, -1))}
      >
        −
      </button>
      <input
        aria-label="Quantity"
        inputMode="decimal"
        className={`w-16 text-center bg-transparent ${labelMd} font-semibold text-on-surface tabular-nums focus:outline-none`}
        value={String(item.qty)}
        onChange={(e) => onQty(e.target.value)}
      />
      <span className={`pr-1 ${labelMd} font-semibold text-on-surface`}>{qtyWithUnit(item).replace(/^\S+\s?/, "")}</span>
      <button
        type="button"
        aria-label="More"
        className="w-7 h-7 rounded flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors font-bold text-sm"
        onClick={() => onQty(stepQty(item.qty, 1))}
      >
        +
      </button>
    </div>
  );
}

function CostBox({ item, currency, onCost }: { item: LineItemDraft; currency: string; onCost: (c: string) => void }) {
  return (
    <label className="bg-surface-container-lowest rounded-lg px-2.5 py-1.5 shadow-xs flex items-center gap-1">
      <span className={`${labelSm} text-outline font-medium max-lg:hidden`}>{ITEMS_COPY.costEach}</span>
      <span className={`${labelMd} text-on-surface-variant`}>{currency === "JMD" ? "J$" : currency}</span>
      <input
        inputMode="decimal"
        aria-label={`${ITEMS_COPY.costEach} — ${item.itemName || "item"}`}
        className={`w-20 bg-transparent ${labelMd} font-semibold text-on-surface tabular-nums focus:outline-none`}
        value={item.unitCost == null ? "" : String(item.unitCost)}
        onChange={(e) => onCost(e.target.value)}
      />
    </label>
  );
}

function Amount({ item, currency }: { item: LineItemDraft; currency: string }) {
  if (!costRecorded(item)) {
    return <span className={`${labelMd} italic text-outline`}>{ITEMS_COPY.costNotRecorded}</span>;
  }
  return (
    <span className="text-[15px] leading-5 font-bold text-on-surface tabular-nums">{money(currency, itemAmount(item))}</span>
  );
}

function KindPill({ kind }: { kind: JobItem["kind"] }) {
  return (
    <span className={`bg-surface-container-high text-on-surface-variant ${labelSm} font-medium px-2 py-0.5 rounded-full`}>
      {kind === "supply" ? ITEMS_COPY.kindSupply : ITEMS_COPY.kindPart}
    </span>
  );
}

function SuggestedRow({
  job,
  item,
  currency,
  onToggle,
  onUpdate,
  onPickPart,
  gapsEnabled,
}: {
  gapsEnabled?: boolean;
  job: JobItem;
  item: LineItemDraft | undefined;
  currency: string;
  onToggle: () => void;
  onUpdate: (patch: Partial<LineItemDraft>) => void;
  onPickPart: () => void;
}) {
  const ticked = Boolean(item);
  const err = item ? itemErrorText(item) : null;
  const badge = item ? pickedPartBadge(item) : "typed";
  return (
    <div
      data-testid={`may-need-row-${job.linkId}`}
      className={`rounded-xl p-3.5 flex flex-col gap-2 shadow-xs transition-colors ${
        ticked ? "bg-surface-container-low hover:bg-surface-container" : "bg-surface-container-low/60 hover:bg-surface-container-low"
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start justify-between gap-2 min-w-0">
        <label className="flex items-center gap-2 min-w-0 cursor-pointer">
          <input
            type="checkbox"
            checked={ticked}
            onChange={onToggle}
            aria-label={`Used ${job.name}`}
            className="w-4 h-4 rounded accent-black cursor-pointer shrink-0"
          />
          <span
            className="w-9 h-9 rounded-lg bg-surface-container-lowest flex items-center justify-center shadow-xs shrink-0"
            style={{ color: job.kind === "supply" ? ACCENT.orange : ACCENT.deepOrange }}
          >
            <span className="material-symbols-outlined text-[20px]">
              {job.kind === "supply" ? "cleaning_services" : "settings"}
            </span>
          </span>
          <span className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className={`${titleSm} text-on-surface`}>{job.name}</span>
            <KindPill kind={job.kind} />
          </span>
        </label>
        {item ? (
          <span className="lg:hidden shrink-0 text-right">
            <Amount item={item} currency={currency} />
          </span>
        ) : null}
        </div>
        {item ? (
          <div className="grid grid-cols-2 gap-2 pl-7 lg:pl-0 lg:flex lg:flex-wrap lg:items-center lg:justify-end">
            <div className="flex flex-col gap-1">
              <span className={`lg:hidden ${labelMd} text-on-surface-variant`}>{ITEMS_COPY.quantity}</span>
              <Stepper item={item} onQty={(qty) => onUpdate({ qty })} />
            </div>
            <div className="flex flex-col gap-1">
              <span className={`lg:hidden ${labelMd} text-on-surface-variant`}>{ITEMS_COPY.costEach}</span>
              <CostBox item={item} currency={currency} onCost={(unitCost) => onUpdate({ unitCost })} />
            </div>
            {job.kind === "supply" ? (
              <div className="col-span-2 lg:col-span-1 flex flex-col gap-1">
                <span className={`lg:hidden ${labelMd} text-on-surface-variant`}>{ITEMS_COPY.brandOptional}</span>
                <label className="bg-surface-container-lowest rounded-lg px-2 py-1 max-lg:py-2 shadow-xs flex items-center gap-1">
                  <span className={`${labelSm} text-outline font-medium max-lg:hidden`}>{ITEMS_COPY.brand}:</span>
                  <input
                    aria-label={`${ITEMS_COPY.brand} — ${job.name}`}
                    className={`w-20 max-lg:w-full bg-transparent ${labelMd} text-on-surface focus:outline-none`}
                    value={item.brand ?? ""}
                    onChange={(e) => onUpdate({ brand: e.target.value })}
                  />
                </label>
              </div>
            ) : null}
            <div className="max-lg:hidden min-w-20 text-right">
              <Amount item={item} currency={currency} />
            </div>
          </div>
        ) : null}
      </div>
      {item && job.kind === "part_type" ? (
        <div className="ml-7 bg-surface-container-lowest rounded-lg p-2.5 px-3 flex flex-wrap items-center justify-between gap-2">
          {item.partLabel ? (
            <span className="flex items-center gap-1.5 flex-wrap">
              {/* Green tick only for a part from this car's own list (pickedPartBadge); size / typed never. */}
              {badge === "car" ? (
                <span className="material-symbols-outlined text-[18px]" style={{ color: ACCENT.green }}>
                  verified
                </span>
              ) : (
                <span className="material-symbols-outlined text-[18px] text-outline">
                  {badge === "size" ? "straighten" : "edit_note"}
                </span>
              )}
              <span className={`${bodySm} text-on-surface font-medium`}>{item.partLabel}</span>
              <span
                className={`${labelSm} px-2 py-0.5 rounded-full ${badge === "typed" ? "bg-surface-container text-on-surface-variant" : ""}`}
                style={
                  badge === "car"
                    ? { backgroundColor: `${ACCENT.greenFixed}80`, color: ACCENT.onGreenFixed }
                    : badge === "size"
                      ? { backgroundColor: ACCENT.peach, color: ACCENT.deepOrange }
                      : undefined
                }
              >
                {badge === "car" ? ITEMS_COPY.fitsThisCar : badge === "size" ? ITEMS_COPY.fitsBySize : ITEMS_COPY.typedIn}
              </span>
            </span>
          ) : (
            <span className={`${bodySm} text-on-surface-variant`}>{job.name}</span>
          )}
          <button
            type="button"
            onClick={onPickPart}
            className={`bg-surface-container hover:bg-surface-container-high text-on-surface ${labelSm} font-medium px-2.5 py-1 rounded-md transition-colors`}
          >
            {item.partLabel ? ITEMS_COPY.change : ITEMS_COPY.pickAPart}
          </button>
        </div>
      ) : null}
      {gapsEnabled && item && job.kind === "part_type" && isUnknownPart(item) ? <RoamLooksItUpLine className="ml-7" /> : null}
      {err ? <p className={`ml-7 ${labelMd} text-error`}>{err}</p> : null}
    </div>
  );
}

function OtherItemBlock({
  item,
  currency,
  onUpdate,
  onRemove,
  gapsEnabled,
}: {
  gapsEnabled?: boolean;
  item: LineItemDraft;
  currency: string;
  onUpdate: (patch: Partial<LineItemDraft>) => void;
  onRemove: () => void;
}) {
  const err = itemErrorText(item);
  const field = "w-full h-10 px-3 bg-surface-container-lowest rounded-lg text-sm text-on-surface focus:outline-none";
  return (
    <div className="bg-surface-container-low rounded-xl p-3 flex flex-col gap-2 shadow-xs" data-testid="other-item-block">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1 ${labelSm} uppercase tracking-wider`} style={{ color: ACCENT.deepOrange }}>
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          {ITEMS_COPY.customItem}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className={`flex items-center gap-1 bg-error-container text-on-error-container hover:bg-error-container/80 ${labelSm} px-2 py-0.5 rounded-md`}
        >
          <span className="material-symbols-outlined text-[14px]">delete</span>
          {ITEMS_COPY.remove}
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1.2fr_1.2fr] gap-2">
        <label className="col-span-2 md:col-span-1 flex flex-col gap-1">
          <span className={`${labelMd} text-on-surface-variant`}>{ITEMS_COPY.whatWasIt}</span>
          <input
            className={field}
            value={item.itemName}
            maxLength={120}
            onChange={(e) => onUpdate({ itemName: e.target.value })}
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className={`${labelMd} text-on-surface-variant`}>{ITEMS_COPY.qty}</span>
          <Stepper item={item} onQty={(qty) => onUpdate({ qty })} />
        </div>
        <label className="flex flex-col gap-1">
          <span className={`${labelMd} text-on-surface-variant`}>{ITEMS_COPY.costEach}</span>
          <span className="flex items-center h-10 px-3 bg-surface-container-lowest rounded-lg gap-1">
            <span className="text-sm text-on-surface-variant">{currency === "JMD" ? "J$" : currency}</span>
            <input
              inputMode="decimal"
              aria-label={`${ITEMS_COPY.costEach} — other item`}
              className="w-full bg-transparent text-sm text-on-surface focus:outline-none"
              value={item.unitCost == null ? "" : String(item.unitCost)}
              onChange={(e) => onUpdate({ unitCost: e.target.value })}
            />
          </span>
        </label>
        <label className="col-span-2 md:col-span-1 flex flex-col gap-1">
          <span className={`${labelMd} text-on-surface-variant`}>
            {ITEMS_COPY.brandOpt} <span className="text-outline">(opt)</span>
          </span>
          <input
            className={field}
            placeholder="e.g. CRC"
            value={item.brand ?? ""}
            onChange={(e) => onUpdate({ brand: e.target.value })}
          />
        </label>
      </div>
      {gapsEnabled ? (
        // Stitch F2: Part number (optional) + its helper, under the other fields.
        <label className="flex flex-col gap-1 md:max-w-[50%]">
          <span className={`${labelMd} text-on-surface-variant`}>{UNKNOWN_PART_COPY.partNumber}</span>
          <input
            className={`${field} font-mono font-semibold tracking-wide`}
            data-testid="other-item-part-number"
            value={item.partNumber ?? ""}
            maxLength={80}
            onChange={(e) => onUpdate({ partNumber: cleanPartNumberInput(e.target.value) || null })}
          />
          <span className={`${labelMd} text-on-surface-variant`}>{UNKNOWN_PART_COPY.partNumberHelper}</span>
        </label>
      ) : null}
      {gapsEnabled ? <RoamLooksItUpLine /> : null}
      <div className="flex items-center justify-between gap-2">
        {err ? <p className={`${labelMd} text-error`}>{err}</p> : <span />}
        <span className="flex items-center gap-2">
          <span className={`${labelMd} text-on-surface-variant`}>{ITEMS_COPY.lineTotal}</span>
          <Amount item={item} currency={currency} />
        </span>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-2" data-testid="items-used-loading">
      {[0, 1].map((i) => (
        <div key={i} className="bg-surface-container-low rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <span className="w-4 h-4 rounded bg-surface-container-high" />
          <span className="w-8 h-8 rounded-lg bg-surface-container-high" />
          <span className="flex-1 flex flex-col gap-1.5">
            <span className="h-3 w-2/5 rounded bg-surface-container-high" />
            <span className="h-2.5 w-1/4 rounded bg-surface-container-high" />
          </span>
          <span className="h-7 w-20 rounded-lg bg-surface-container-high" />
          <span className="h-3 w-16 rounded bg-surface-container-high" />
        </div>
      ))}
      <span className="h-9 w-36 rounded-lg bg-surface-container-low animate-pulse" />
    </div>
  );
}

export function ItemsUsedSection({ jobItems, status, onRetry, items, onChange, currency, jobCharge, onPickPart, beforeTotal, gapsEnabled }: Props) {
  const { usually, sometimes } = groupJobItems(jobItems);
  const itemsTotal = items.reduce((s, i) => s + itemAmount(i), 0);
  const others = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.source === "other");
  const update = (idx: number, patch: Partial<LineItemDraft>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const updateSuggested = (linkId: string, patch: Partial<LineItemDraft>) =>
    onChange(items.map((it) => (it.source === "suggested" && it.jobItemId === linkId ? { ...it, ...patch } : it)));
  const addOther = () => onChange([...items, newOtherItem()]);

  const otherButton = (
    <button
      type="button"
      data-testid="items-used-add-other"
      onClick={addOther}
      className={`self-start bg-surface-container-low hover:bg-surface-container-high text-on-surface px-3.5 py-2 rounded-xl ${titleSm} flex items-center gap-1.5 transition-colors`}
    >
      <span className="material-symbols-outlined text-[18px]">add</span>
      {ITEMS_COPY.otherItem}
    </button>
  );

  const group = (label: string, list: JobItem[]) =>
    list.length ? (
      <div className="flex flex-col gap-1.5 mt-1">
        <span className={`${labelSm} text-outline uppercase tracking-wider font-bold`}>{label}</span>
        {list.map((job) => (
          <SuggestedRow
            key={job.linkId}
            job={job}
            item={findSuggested(items, job.linkId)}
            currency={currency}
            onToggle={() => onChange(toggleSuggested(items, job))}
            onUpdate={(patch) => updateSuggested(job.linkId, patch)}
            gapsEnabled={gapsEnabled}
            onPickPart={() => {
              const it = findSuggested(items, job.linkId);
              if (it) onPickPart(it);
            }}
          />
        ))}
      </div>
    ) : null;

  return (
    <section className="flex flex-col gap-2 pt-1" data-testid="items-used">
      <div className="flex items-baseline justify-between flex-wrap gap-1">
        <div className="flex items-center gap-1.5">
          <h4 className="text-base leading-6 font-bold text-on-surface">{ITEMS_COPY.title}</h4>
          {items.length > 0 ? (
            <span
              className={`${labelSm} px-2 py-0.5 rounded-full`}
              style={{ backgroundColor: `${ACCENT.peach}99`, color: ACCENT.onPeach }}
            >
              {ITEMS_COPY.selected(items.length)}
            </span>
          ) : null}
        </div>
        <span className={`${bodySm} text-on-surface-variant`}>{ITEMS_COPY.helper}</span>
      </div>

      {status === "loading" ? (
        <Skeleton />
      ) : status === "error" ? (
        <div className="bg-error-container/60 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2" role="alert">
          <span className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[20px] text-error">error</span>
            <span className="flex flex-col">
              <span className={`${titleSm} text-on-surface`}>{ITEMS_COPY.loadFailTitle}</span>
              <span className={`${bodySm} text-on-surface-variant`}>{ITEMS_COPY.loadFailBody}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={onRetry}
            className={`bg-surface-container-lowest hover:bg-surface-container text-on-surface px-3 py-1.5 rounded-lg ${titleSm} flex items-center gap-1 shadow-xs`}
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            {ITEMS_COPY.tryAgain}
          </button>
        </div>
      ) : jobItems.length === 0 && others.length === 0 ? (
        <div className="bg-surface-container-low/60 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2" data-testid="items-used-empty">
          <span className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">build_circle</span>
            </span>
            <span className={`${bodySm} text-on-surface-variant`}>{ITEMS_COPY.noneSuggested}</span>
          </span>
          <button
            type="button"
            data-testid="items-used-add-other"
            onClick={addOther}
            className={`bg-surface-container-lowest hover:bg-surface-container text-on-surface px-3 py-1.5 rounded-lg ${titleSm} flex items-center gap-1 shadow-xs`}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {ITEMS_COPY.otherItem}
          </button>
        </div>
      ) : null}

      {status === "ok" || status === "none" ? (
        <>
          {group(ITEMS_COPY.usually, usually)}
          {group(ITEMS_COPY.sometimes, sometimes)}
        </>
      ) : null}

      {others.map(({ it, idx }) => (
        <OtherItemBlock
          key={idx}
          item={it}
          currency={currency}
          onUpdate={(patch) => update(idx, patch)}
          onRemove={() => onChange(items.filter((_, i) => i !== idx))}
          gapsEnabled={gapsEnabled}
        />
      ))}

      {status === "loading" || (jobItems.length === 0 && others.length === 0 && status !== "error") ? null : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
          {otherButton}
          <span className={`${bodySm} text-outline italic`}>{ITEMS_COPY.blankCostHelper}</span>
        </div>
      )}

      {beforeTotal}

      <div
        className="self-end mt-1 bg-surface-container-low text-on-surface px-4 py-2 rounded-full text-sm font-semibold tabular-nums shadow-xs hidden sm:flex items-center gap-2"
        data-testid="items-used-total"
      >
        <span className="material-symbols-outlined text-[18px]" style={{ color: ACCENT.deepOrange }}>
          receipt_long
        </span>
        <span>
          Job {money(currency, jobCharge)} + items {money(currency, itemsTotal)} ={" "}
          <strong className="text-on-surface font-bold text-xl">{money(currency, jobCharge + itemsTotal)}</strong>
        </span>
      </div>
    </section>
  );
}
