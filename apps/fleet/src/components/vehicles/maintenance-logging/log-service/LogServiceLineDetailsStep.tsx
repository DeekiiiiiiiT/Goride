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
  onPartSelect: (partId: string | null, offerId: string | null, brand?: string, partNumber?: string) => void;
  lineTotalLabel: string;
  currency: string;
  lineTotal: number;
};

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

  return (
    <div className="space-y-6">
      <div>
        <span className="text-[11px] text-secondary uppercase tracking-wider font-semibold">
          {LOG_SERVICE_COPY.wizardEyebrow}
        </span>
        <h2 className="text-2xl font-semibold text-on-surface mt-0.5">{LOG_SERVICE_COPY.lineDetailsTitle}</h2>
        <p className="text-sm text-secondary mt-1">{LOG_SERVICE_COPY.lineDetailsSubtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="bg-surface-container p-3 rounded-xl text-on-surface">
          <MaintenanceIcon iconKey={category.icon_key} className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-semibold text-on-surface">{category.name}</h3>
          <p className="text-xs text-secondary">
            {[systemName, category.code].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

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
        <div className="space-y-2">
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            className="bg-surface-container-lowest border-outline-variant/40"
            value={brand}
            onChange={(e) => onBrandChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="part-number">Part number</Label>
          <Input
            id="part-number"
            className="bg-surface-container-lowest border-outline-variant/40"
            value={partNumber}
            onChange={(e) => onPartNumberChange(e.target.value)}
          />
        </div>
      </div>

      {showPositions ? (
        <div className="space-y-2">
          <Label>Positions</Label>
          <div className="flex flex-wrap gap-2">
            {TIRE_BRAKE_POSITIONS.map((pos) => {
              const on = positions.includes(pos);
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => onTogglePosition(pos)}
                  className={`min-h-11 min-w-11 px-3 rounded-lg border text-sm font-semibold ${
                    on
                      ? "border-primary bg-primary/10 text-on-surface"
                      : "border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant"
                  }`}
                >
                  {pos}
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
          <p className="text-xs text-secondary flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading compatible parts…
          </p>
        ) : compatibleParts.length === 0 ? (
          <p className="text-xs text-secondary">No compatible parts for this vehicle/component.</p>
        ) : (
          <Select
            value={partId || "__none__"}
            onValueChange={(v: string) => {
              if (v === "__none__") {
                onPartSelect(null, null);
                return;
              }
              const item = compatibleParts.find((p) => p.part.id === v);
              const offerId = item?.offers?.[0]?.id ?? null;
              onPartSelect(v, offerId, item?.part.name, item?.part.oem_part_number ?? undefined);
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

      <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low px-4 py-3 flex justify-between items-center">
        <span className="text-sm text-secondary">{lineTotalLabel}</span>
        <span className="font-semibold text-on-surface">
          {currency} {lineTotal.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
