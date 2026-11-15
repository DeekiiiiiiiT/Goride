import React from "react";
import { Loader2 } from "lucide-react";
import { Checkbox } from "../../../ui/checkbox";
import { Input } from "../../../ui/input";
import { Label } from "../../../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../ui/select";
import { MaintenanceIcon } from "../../MaintenanceIcon";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import type { MaintenanceLineAction, MaintenanceServiceCategory } from "../../../../types/maintenance";
import { MAINTENANCE_LINE_ACTIONS } from "../../../../types/maintenance";
import { actionLabel } from "./systemSections";
import type { CompatiblePartsItem } from "../../../../types/partSourcing";

const TIRE_BRAKE_POSITIONS = ["LF", "RF", "LR", "RR"] as const;

export type LogServiceLineDetailsStepProps = {
  category: MaintenanceServiceCategory;
  systemName?: string | null;
  action: MaintenanceLineAction;
  onActionChange: (action: MaintenanceLineAction) => void;
  categoryFields: React.ReactNode;
  laborHours: number | null;
  laborRate: number | null;
  onLaborHoursChange: (v: number | null) => void;
  onLaborRateChange: (v: number | null) => void;
  brand: string;
  partNumber: string;
  onBrandChange: (v: string) => void;
  onPartNumberChange: (v: string) => void;
  showPositions: boolean;
  positions: string[];
  onTogglePosition: (pos: string) => void;
  warranty: boolean;
  complimentary: boolean;
  onWarrantyChange: (v: boolean) => void;
  onComplimentaryChange: (v: boolean) => void;
  partsLoading: boolean;
  compatibleParts: CompatiblePartsItem[];
  partId: string | null;
  onPartSelect: (
    partId: string | null,
    offerId: string | null,
    brand?: string,
    partNumber?: string,
    partConfirmedFit?: boolean,
  ) => void;
  lineTotalLabel: string;
  currency: string;
  lineTotal: number;
  /** Fixed boxes to hide for this job: "labor_hours", "labor_rate", "brand", "part_number" (see hiddenLineFieldsFor). */
  hiddenFields?: string[];
  /** One-axle jobs (stabilizer links): show these buttons (Left / Right) instead of the four wheels. */
  sideOptions?: { value: string; label: string }[] | null;
  /** Set for service jobs (alignment, rotation…): shows the short form — wheels + cost only. */
  serviceForm?: {
    costMode: "total" | "per_wheel";
    amount: number | null;
    onCostModeChange: (mode: "total" | "per_wheel") => void;
    onAmountChange: (v: number | null) => void;
    onToggleAllPositions: () => void;
  };
  /** "Items used" block (service items on). Replaces the line-total box with its own total pill. */
  itemsSlot?: React.ReactNode;
  /** Inside the multi-job list the page already has the "Line details" title. */
  hideHeading?: boolean;
};

function PositionButtons({
  positions,
  onTogglePosition,
  onToggleAll,
}: {
  positions: string[];
  onTogglePosition: (pos: string) => void;
  onToggleAll?: () => void;
}) {
  const allOn = TIRE_BRAKE_POSITIONS.every((p) => positions.includes(p));
  return (
    <div className="flex flex-wrap gap-2">
      {TIRE_BRAKE_POSITIONS.map((pos) => {
        const on = positions.includes(pos);
        return (
          <button
            key={pos}
            type="button"
            aria-pressed={on}
            onClick={() => onTogglePosition(pos)}
            className={`min-h-11 min-w-11 px-3 rounded-lg border-2 text-sm font-semibold transition-colors ${
              on
                ? "border-primary bg-primary text-on-primary"
                : "border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant hover:border-primary/40"
            }`}
          >
            {pos}
          </button>
        );
      })}
      {onToggleAll ? (
        <button
          type="button"
          aria-pressed={allOn}
          onClick={onToggleAll}
          className={`min-h-11 px-4 rounded-lg border-2 text-sm font-semibold transition-colors ${
            allOn
              ? "border-primary bg-primary text-on-primary"
              : "border-outline-variant/40 bg-surface-container-lowest text-on-surface hover:border-primary/40"
          }`}
        >
          {LOG_SERVICE_COPY.allFourWheels}
        </button>
      ) : null}
    </div>
  );
}

function ServiceJobForm(props: LogServiceLineDetailsStepProps & { serviceForm: NonNullable<LogServiceLineDetailsStepProps["serviceForm"]> }) {
  const { serviceForm: sf, showPositions, positions, onTogglePosition, complimentary, onComplimentaryChange, currency, lineTotal, lineTotalLabel } = props;
  const perWheel = sf.costMode === "per_wheel";
  const wheelCount = positions.length;
  if (props.itemsSlot) {
    // Stitch screen 1: one "Service charge" block — words left; switch, amount and "No charge" right.
    return (
      <>
        {showPositions ? (
          <div className="space-y-2">
            <Label>{LOG_SERVICE_COPY.whichWheels}</Label>
            <PositionButtons positions={positions} onTogglePosition={onTogglePosition} onToggleAll={sf.onToggleAllPositions} />
          </div>
        ) : null}
        <div
          className="bg-surface-container-low/50 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
          data-testid="log-service-service-charge"
        >
          <div className="flex flex-col">
            <Label htmlFor="service-amount" className="text-sm font-semibold text-on-surface">
              {LOG_SERVICE_COPY.serviceChargeLabel}
            </Label>
            <span className="text-[13px] leading-[18px] text-on-surface-variant">{LOG_SERVICE_COPY.serviceChargeHelper}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showPositions ? (
              <div className="bg-surface-container-high p-1 rounded-xl flex items-center gap-1">
                {(["total", "per_wheel"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={sf.costMode === mode}
                    onClick={() => sf.onCostModeChange(mode)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                      sf.costMode === mode ? "bg-black text-white shadow-xs" : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {mode === "total" ? LOG_SERVICE_COPY.costModeTotal : LOG_SERVICE_COPY.costModePerWheel}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-on-surface-variant">
                {currency === "JMD" ? "J$" : currency}
              </span>
              <Input
                id="service-amount"
                type="number"
                min={0}
                inputMode="decimal"
                disabled={complimentary}
                className="w-40 h-10 pl-9 bg-surface-container-lowest border-0 rounded-xl text-[15px] font-semibold tabular-nums shadow-xs"
                placeholder={perWheel ? LOG_SERVICE_COPY.perWheelPlaceholder : LOG_SERVICE_COPY.totalPlaceholder}
                value={sf.amount ?? ""}
                onChange={(e) => sf.onAmountChange(e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <Checkbox
                id="complimentary"
                checked={complimentary}
                onCheckedChange={(checked: boolean | "indeterminate") => onComplimentaryChange(checked === true)}
              />
              <span className="text-[13px] text-on-surface-variant">{LOG_SERVICE_COPY.noChargeLabel}</span>
            </label>
          </div>
        </div>
        {perWheel && showPositions ? (
          <p className="text-xs text-stitch-secondary -mt-2">
            {wheelCount === 0
              ? LOG_SERVICE_COPY.pickWheelsForPerWheel
              : LOG_SERVICE_COPY.perWheelMath(currency, sf.amount ?? 0, wheelCount)}
          </p>
        ) : null}
        {props.itemsSlot}
      </>
    );
  }
  return (
    <>
      {showPositions ? (
        <div className="space-y-2">
          <Label>{LOG_SERVICE_COPY.whichWheels}</Label>
          <PositionButtons positions={positions} onTogglePosition={onTogglePosition} onToggleAll={sf.onToggleAllPositions} />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="service-amount">{LOG_SERVICE_COPY.serviceCostLabel}</Label>
        {showPositions ? (
          <div className="inline-flex rounded-lg border border-outline-variant/40 p-1 bg-surface-container-low gap-1">
            {(["total", "per_wheel"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={sf.costMode === mode}
                onClick={() => sf.onCostModeChange(mode)}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  sf.costMode === mode
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                }`}
              >
                {mode === "total" ? LOG_SERVICE_COPY.costModeTotal : LOG_SERVICE_COPY.costModePerWheel}
              </button>
            ))}
          </div>
        ) : null}
        <div className="relative max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-stitch-secondary">
            {currency}
          </span>
          <Input
            id="service-amount"
            type="number"
            min={0}
            inputMode="decimal"
            disabled={complimentary}
            className="pl-12 bg-surface-container-lowest border-outline-variant/40"
            placeholder={perWheel ? LOG_SERVICE_COPY.perWheelPlaceholder : LOG_SERVICE_COPY.totalPlaceholder}
            value={sf.amount ?? ""}
            onChange={(e) => sf.onAmountChange(e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
        {perWheel && showPositions ? (
          <p className="text-xs text-stitch-secondary">
            {wheelCount === 0
              ? LOG_SERVICE_COPY.pickWheelsForPerWheel
              : LOG_SERVICE_COPY.perWheelMath(currency, sf.amount ?? 0, wheelCount)}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          id="complimentary"
          checked={complimentary}
          onCheckedChange={(checked: boolean | "indeterminate") => onComplimentaryChange(checked === true)}
        />
        <Label htmlFor="complimentary" className="cursor-pointer">
          {LOG_SERVICE_COPY.noChargeLabel}
        </Label>
      </div>

      <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low px-4 py-3 flex justify-between items-center">
        <span className="text-sm text-stitch-secondary">{lineTotalLabel}</span>
        <span className="font-semibold text-on-surface">
          {currency} {lineTotal.toLocaleString()}
        </span>
      </div>
    </>
  );
}

export function LogServiceLineDetailsStep(props: LogServiceLineDetailsStepProps) {
  const {
    category,
    systemName,
    action,
    onActionChange,
    categoryFields,
    laborHours,
    laborRate,
    onLaborHoursChange,
    onLaborRateChange,
    brand,
    partNumber,
    onBrandChange,
    onPartNumberChange,
    showPositions,
    positions,
    onTogglePosition,
    warranty,
    complimentary,
    onWarrantyChange,
    onComplimentaryChange,
    partsLoading,
    compatibleParts,
    partId,
    onPartSelect,
    lineTotalLabel,
    currency,
    lineTotal,
  } = props;

  const actionPill = actionLabel(action);
  return (
    <div className="space-y-5">
      {props.hideHeading ? null : (
        <div>
          <h2 className="text-2xl font-semibold text-on-surface">{LOG_SERVICE_COPY.lineDetailsTitle}</h2>
          <p className="text-sm text-stitch-secondary mt-1">{LOG_SERVICE_COPY.lineDetailsSubtitle}</p>
        </div>
      )}

      {/* Stitch screen 1 job header: icon tile, job name, action pill. No internal codes on Fleet (6a). */}
      <div className="flex items-center gap-2.5" data-testid="log-service-job-header">
        <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface shrink-0">
          <MaintenanceIcon iconKey={category.icon_key} className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <h3 className="text-base font-bold text-on-surface">{category.name}</h3>
          {actionPill ? (
            <span className="bg-surface-container-high text-on-surface-variant text-[11px] font-medium px-2.5 py-0.5 rounded-full">
              {actionPill}
            </span>
          ) : null}
          {systemName && !props.itemsSlot ? (
            <span className="text-xs text-stitch-secondary">{systemName}</span>
          ) : null}
        </div>
      </div>

      {props.serviceForm ? (
        <ServiceJobForm {...props} serviceForm={props.serviceForm} />
      ) : (
      <>
      <div className="space-y-2">
        <Label>Action</Label>
        <Select value={action} onValueChange={(v: string) => onActionChange(v as MaintenanceLineAction)}>
          <SelectTrigger className="bg-surface-container-lowest border-outline-variant/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MAINTENANCE_LINE_ACTIONS.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{categoryFields}</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {!props.hiddenFields?.includes("labor_hours") ? (
        <div className="space-y-2">
          <Label htmlFor="labor-hours">Labor hours</Label>
          <Input
            id="labor-hours"
            type="number"
            step="0.1"
            className="bg-surface-container-lowest border-outline-variant/40"
            value={laborHours ?? ""}
            onChange={(e) =>
              onLaborHoursChange(e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </div>
        ) : null}
        {!props.hiddenFields?.includes("labor_rate") ? (
        <div className="space-y-2">
          <Label htmlFor="labor-rate">Labor rate</Label>
          <Input
            id="labor-rate"
            type="number"
            className="bg-surface-container-lowest border-outline-variant/40"
            value={laborRate ?? ""}
            onChange={(e) =>
              onLaborRateChange(e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </div>
        ) : null}
        {!props.hiddenFields?.includes("brand") ? (
        <div className="space-y-2">
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            className="bg-surface-container-lowest border-outline-variant/40"
            value={brand}
            onChange={(e) => onBrandChange(e.target.value)}
          />
        </div>
        ) : null}
        {!props.hiddenFields?.includes("part_number") ? (
        <div className="space-y-2">
          <Label htmlFor="part-number">Part number</Label>
          <Input
            id="part-number"
            className="bg-surface-container-lowest border-outline-variant/40"
            value={partNumber}
            onChange={(e) => onPartNumberChange(e.target.value)}
          />
        </div>
        ) : null}
      </div>

      {showPositions ? (
        <div className="space-y-2">
          <Label>{props.sideOptions ? "Side" : "Positions"}</Label>
          <div className="flex flex-wrap gap-2">
            {(props.sideOptions ?? TIRE_BRAKE_POSITIONS.map((p) => ({ value: p, label: p }))).map(({ value: pos, label: posLabel }) => {
              const on = positions.includes(pos);
              return (
                <button
                  key={pos}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onTogglePosition(pos)}
                  className={`min-h-11 min-w-11 px-3 rounded-lg border text-sm font-semibold ${
                    on
                      ? "border-primary bg-primary/10 text-on-surface"
                      : "border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant"
                  }`}
                >
                  {posLabel}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-3">
          <Checkbox
            id="warranty"
            checked={warranty}
            onCheckedChange={(checked: boolean | "indeterminate") =>
              onWarrantyChange(checked === true)
            }
          />
          <Label htmlFor="warranty" className="cursor-pointer">
            Warranty
          </Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox
            id="complimentary"
            checked={complimentary}
            onCheckedChange={(checked: boolean | "indeterminate") =>
              onComplimentaryChange(checked === true)
            }
          />
          <Label htmlFor="complimentary" className="cursor-pointer">
            Complimentary labor
          </Label>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Link part (optional)</Label>
        {partsLoading ? (
          <p className="text-xs text-stitch-secondary flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading compatible parts…
          </p>
        ) : compatibleParts.length === 0 ? (
          <p className="text-xs text-stitch-secondary">No compatible parts for this vehicle/component.</p>
        ) : (
          <Select
            value={partId || "__none__"}
            onValueChange={(v: string) => {
              if (v === "__none__") {
                onPartSelect(null, null, undefined, undefined, false);
                return;
              }
              const item = compatibleParts.find((p) => p.part.id === v);
              const offerId = item?.offers?.[0]?.id ?? null;
              onPartSelect(
                v,
                offerId,
                item?.part.name,
                item?.part.oem_part_number ?? undefined,
                item?.confirmedFit === true,
              );
            }}
          >
            <SelectTrigger className="bg-surface-container-lowest border-outline-variant/40">
              <SelectValue placeholder="Select a part…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {compatibleParts.map((item) => (
                <SelectItem key={item.part.id} value={item.part.id}>
                  {item.part.name}
                  {item.part.oem_part_number ? ` · ${item.part.oem_part_number}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {props.itemsSlot ?? (
        <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-stitch-secondary">{lineTotalLabel}</span>
          <span className="font-semibold text-on-surface">
            {currency} {lineTotal.toLocaleString()}
          </span>
        </div>
      )}
      </>
      )}
    </div>
  );
}
