import React, { useEffect, useRef } from "react";
import { CheckCircle2, Loader2, Plus, Scan } from "lucide-react";
import { Button } from "../../../ui/button";
import { Checkbox } from "../../../ui/checkbox";
import { Input } from "../../../ui/input";
import { Label } from "../../../ui/label";
import { Textarea } from "../../../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../ui/select";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import type { MaintenanceLogLine } from "../../../../types/maintenance";
import { formatMaintenanceLineLabel } from "../../../../types/maintenance";

export type LogServiceReviewStepProps = {
  baySessionLabel: string;
  date: string;
  odometer: number;
  provider: string;
  currency: string;
  notes: string;
  invoiceUrl: string;
  scanLoading: boolean;
  onDateChange: (v: string) => void;
  onOdometerChange: (v: number) => void;
  onProviderChange: (v: string) => void;
  onCurrencyChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onScanFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  lines: MaintenanceLogLine[];
  lineTotalPreview: (line: MaintenanceLogLine) => number;
  /** Line sum before discount. */
  subtotal: number;
  /** Net total after discount (same as subtotal when no discount). */
  netTotal: number;
  discountEnabled?: boolean;
  discountAmount?: number;
  discountInputValue?: string;
  discountRowOpen?: boolean;
  discountTooLarge?: boolean;
  onAddDiscount?: () => void;
  onRemoveDiscount?: () => void;
  onDiscountChange?: (raw: string) => void;
  onEditLine: (line: MaintenanceLogLine) => void;
  showMarkPackageComplete: boolean;
  markPackageComplete: boolean;
  onMarkPackageCompleteChange: (v: boolean) => void;
  whatHappensNext?: React.ReactNode;
};

export function LogServiceReviewStep({
  baySessionLabel,
  date,
  odometer,
  provider,
  currency,
  notes,
  invoiceUrl,
  scanLoading,
  onDateChange,
  onOdometerChange,
  onProviderChange,
  onCurrencyChange,
  onNotesChange,
  onScanFile,
  lines,
  lineTotalPreview,
  subtotal,
  netTotal,
  discountEnabled = false,
  discountAmount = 0,
  discountInputValue = "",
  discountRowOpen = false,
  discountTooLarge = false,
  onAddDiscount,
  onRemoveDiscount,
  onDiscountChange,
  onEditLine,
  showMarkPackageComplete,
  markPackageComplete,
  onMarkPackageCompleteChange,
  whatHappensNext,
}: LogServiceReviewStepProps) {
  const discountInputRef = useRef<HTMLInputElement>(null);
  const showDiscountRow = discountRowOpen || discountAmount > 0;
  const showSubtotalBreakdown = discountAmount > 0;

  useEffect(() => {
    if (showDiscountRow) discountInputRef.current?.focus();
  }, [showDiscountRow]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <span className="text-[11px] text-stitch-secondary uppercase tracking-wider font-semibold">
            {LOG_SERVICE_COPY.wizardEyebrow}
          </span>
          <h2 className="text-2xl font-semibold text-on-surface mt-0.5">{LOG_SERVICE_COPY.reviewHeading}</h2>
          <p className="text-sm text-stitch-secondary mt-1">{LOG_SERVICE_COPY.reviewSubtitle}</p>
        </div>
      </div>

      <div className="border-2 border-dashed border-outline-variant/50 rounded-xl p-6 flex flex-col items-center justify-center bg-surface-container-low relative group hover:bg-surface-container transition-colors">
        <Input
          type="file"
          accept="image/*,.pdf"
          onChange={onScanFile}
          disabled={scanLoading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className="bg-surface-container-lowest p-3 rounded-xl shadow-sm mb-3">
          {scanLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-on-surface" />
          ) : (
            <Scan className="w-6 h-6 text-on-surface" />
          )}
        </div>
        <h3 className="font-semibold text-on-surface">{LOG_SERVICE_COPY.scanInvoiceTitle}</h3>
        <p className="text-sm text-stitch-secondary">{LOG_SERVICE_COPY.scanInvoiceHint}</p>
        {invoiceUrl ? (
          <div className="absolute top-4 right-4 bg-secondary-container text-on-secondary-container text-xs px-2 py-1 rounded flex items-center">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Uploaded
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Odometer (km)</Label>
          <Input
            type="number"
            className="font-medium"
            value={odometer || ""}
            onChange={(e) => onOdometerChange(parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Service Provider</Label>
          <Input
            value={provider}
            onChange={(e) => onProviderChange(e.target.value)}
            placeholder="e.g. Whole-Heated Car Service LTD"
          />
        </div>
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select value={currency || "JMD"} onValueChange={onCurrencyChange}>
            <SelectTrigger className="font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="JMD">JMD</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          className="min-h-[80px]"
          placeholder="Inspection notes, recommendations…"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        <Label className="font-semibold">Line items</Label>
        <div className="border border-outline-variant/40 rounded-lg divide-y bg-surface-container-lowest">
          {lines.map((line, idx) => {
            const muted = Boolean(line.declined);
            return (
              <div
                key={`${line.categoryId}-${line.categoryCode}-${idx}`}
                className={`flex items-center justify-between px-4 py-3 gap-3 ${muted ? "opacity-50" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">
                    {formatMaintenanceLineLabel(line)}
                  </p>
                  <p className="text-xs text-stitch-secondary">
                    {[
                      line.recommended ? "Recommended" : null,
                      line.declined ? "Declined" : null,
                      line.qty != null ? `Qty ${line.qty}` : null,
                      line.brand || null,
                      line.positions?.length ? line.positions.join(" ") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || line.categoryCode}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-medium text-on-surface">
                    {currency} {muted ? "0" : lineTotalPreview(line).toLocaleString()}
                  </span>
                  {!line.recommended ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-stitch-secondary"
                      onClick={() => onEditLine(line)}
                    >
                      Edit
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {showDiscountRow ? (
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-on-surface">Discount</p>
                <div className="mt-1.5 flex flex-col gap-1 max-w-[220px]">
                  <div className="flex rounded-lg border border-outline-variant/40 bg-surface-container-lowest overflow-hidden">
                    <span className="px-3 py-2 text-sm font-medium text-stitch-secondary border-r border-outline-variant/40 bg-surface-container-low">
                      {currency || "JMD"}
                    </span>
                    <Input
                      ref={discountInputRef}
                      type="text"
                      inputMode="decimal"
                      data-testid="log-service-discount-amount"
                      className="border-0 rounded-none shadow-none focus-visible:ring-0 font-medium"
                      value={discountInputValue}
                      placeholder="0"
                      onChange={(e) => onDiscountChange?.(e.target.value)}
                    />
                  </div>
                  {discountTooLarge ? (
                    <p className="text-xs text-error" data-testid="log-service-discount-error">
                      Discount can&apos;t be more than the bill.
                    </p>
                  ) : null}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="log-service-remove-discount"
                className="text-rose-700 border-rose-200 hover:bg-rose-50 shrink-0"
                onClick={() => onRemoveDiscount?.()}
              >
                Remove
              </Button>
            </div>
          ) : null}
        </div>
        {discountEnabled && !showDiscountRow ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="log-service-add-discount"
            className="w-full sm:w-auto"
            onClick={() => onAddDiscount?.()}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add discount
          </Button>
        ) : null}
        <div className="space-y-1 px-1 pt-1">
          {showSubtotalBreakdown ? (
            <>
              <div
                className="flex justify-between items-center"
                data-testid="log-service-review-subtotal"
              >
                <span className="text-sm font-semibold text-on-surface-variant">Subtotal</span>
                <span className="text-base font-semibold text-on-surface">
                  {currency} {subtotal.toLocaleString()}
                </span>
              </div>
              <div
                className="flex justify-between items-center"
                data-testid="log-service-review-discount"
              >
                <span className="text-sm font-semibold text-on-surface-variant">Discount</span>
                <span className="text-base font-semibold text-on-surface">
                  −{currency} {discountAmount.toLocaleString()}
                </span>
              </div>
            </>
          ) : null}
          <div className="flex justify-between items-center" data-testid="log-service-review-total">
            <span className="text-sm font-semibold text-on-surface-variant">Total</span>
            <span className="text-base font-semibold text-on-surface">
              {currency} {(showSubtotalBreakdown ? netTotal : subtotal).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {showMarkPackageComplete ? (
        <div className="flex items-center gap-3 rounded-lg border border-outline-variant/40 bg-surface-container-low px-4 py-3">
          <Checkbox
            id="mark-package-complete"
            checked={markPackageComplete}
            onCheckedChange={(checked: boolean | "indeterminate") =>
              onMarkPackageCompleteChange(checked === true)
            }
          />
          <Label htmlFor="mark-package-complete" className="cursor-pointer">
            Mark package complete
            <span className="block text-xs font-normal text-stitch-secondary mt-0.5">
              Advances the vehicle maintenance schedule for this package.
            </span>
          </Label>
        </div>
      ) : null}

      {whatHappensNext ? (
        <div className="rounded-lg bg-surface-container p-4">
          <p className="text-sm font-semibold text-on-surface mb-2">{LOG_SERVICE_COPY.whatHappensNext}</p>
          {whatHappensNext}
        </div>
      ) : null}
    </div>
  );
}
