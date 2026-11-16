import React, { useEffect, useRef } from "react";
import { HighVoltageChip, NotUsualChip } from "./JobFitUi";
import { LS, LT } from "./logServiceStitch";
import { CheckCircle2, Loader2, Plus, Scan, Wrench } from "lucide-react";
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
import { formatMaintenanceLineLabel, lineItemsAmount } from "../../../../types/maintenance";
import { formatMaintenanceServiceDateLabel } from "../../../../utils/maintenanceDisplayFormat";
import { costRecorded, itemAmount, money, qtyWithUnit } from "./itemsUsed";
import { actionLabel } from "./systemSections";

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
  /** Powertrain job fit chips for a line (grey "Not usual for this car", amber "High-voltage"). */
  lineFit?: (line: MaintenanceLogLine) => { notUsual: boolean; highVoltage: boolean };
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
  /** Show item lines and the Labor / Parts split (service items on, or lines already carry items). */
  itemsEnabled?: boolean;
  vehicleLabel?: string;
};

function moneyLabel(currency: string, n: number): string {
  return money(currency, n);
}

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
  itemsEnabled = false,
  vehicleLabel,
  lineFit,
}: LogServiceReviewStepProps) {
  void vehicleLabel; // the car is in the top car card (Stitch 07)
  const discountInputRef = useRef<HTMLInputElement>(null);
  const showDiscountRow = discountRowOpen || discountAmount > 0;
  const showSubtotalBreakdown = discountAmount > 0;
  const doneLines = lines.filter((l) => !l.declined);
  const itemsTotal = doneLines.reduce((s, l) => s + lineItemsAmount(l), 0);
  const jobsTotal = Math.round((subtotal - itemsTotal) * 100) / 100;
  const cur = currency || "JMD";

  useEffect(() => {
    if (showDiscountRow) discountInputRef.current?.focus();
  }, [showDiscountRow]);

  return (
    <div className="flex flex-col gap-4">
      {/* Stitch powertrain 07: intro line + ready chip, then the summary strip. */}
      <div className="flex items-center justify-between gap-3">
        <p className={`${LT.bodyMd} ${LS.muted}`}>{LOG_SERVICE_COPY.reviewSubtitle}</p>
        {doneLines.length ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 uppercase tracking-wider ${LT.labelSm} bg-[#82f5c1]/40 text-[#00714e]`}>
            Ready to log
          </span>
        ) : null}
      </div>

      <div className={`rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 ${LS.mid}`} data-testid="log-service-review-summary">
        <div className="flex flex-wrap items-center gap-6">
          {[
            ["Date", date ? formatMaintenanceServiceDateLabel(date, false) : "—"],
            ["Mileage", odometer ? `${Number(odometer).toLocaleString()} km` : "—"],
            ["Jobs", `${doneLines.length} job${doneLines.length === 1 ? "" : "s"}`],
          ].map(([k, v], i) => (
            <React.Fragment key={k}>
              {i > 0 ? <span className="hidden sm:block w-px h-7 bg-[#c9c5cd]/60" aria-hidden /> : null}
              <div className="flex flex-col min-w-0">
                <span className={`uppercase tracking-wider ${LT.labelSm} ${LS.muted}`}>{k}</span>
                <span className={`${LT.titleSm} ${LS.text} truncate`}>{v}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
        <div className="flex flex-col sm:text-right">
          <span className={`uppercase tracking-wider ${LT.labelSm} ${LS.muted}`}>Total payable</span>
          <span className={`${LT.headlineMd} font-bold tracking-tight tabular-nums ${LS.text}`}>
            {moneyLabel(cur, showSubtotalBreakdown ? netTotal : subtotal)}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className={`uppercase tracking-wider ${LT.titleSm} ${LS.text}`}>Logged jobs ({doneLines.length})</h3>
          <span className={`${LT.labelSm} ${LS.muted}`}>Parts &amp; labour included</span>
        </div>
        <div className="flex flex-col gap-2" data-testid="log-service-review-jobs">
          {lines.map((line, idx) => {
            const declined = Boolean(line.declined);
            const total = lineTotalPreview(line);
            const items = line.items ?? [];
            const charge = Math.round((total - lineItemsAmount(line)) * 100) / 100;
            const pill = actionLabel(line.action);
            const fit = lineFit?.(line) ?? { notUsual: false, highVoltage: false };
            return (
              <div
                key={`${line.categoryId}-${line.categoryCode}-${idx}`}
                data-testid="log-service-review-job"
                className={`rounded-xl p-4 flex flex-col gap-1 transition-shadow hover:shadow-sm ${LS.low} ${declined ? "opacity-70" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${LS.highest} ${LS.text}`}>
                      <Wrench className="w-4 h-4" />
                    </span>
                    <p className={`${LT.titleMd} ${LS.text}`}>{formatMaintenanceLineLabel(line)}</p>
                    {declined ? (
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant">
                        Declined
                      </span>
                    ) : pill ? (
                      <span className={`px-2 py-0.5 rounded-full ${LT.labelSm} font-medium ${LS.highest} ${LS.text}`}>{pill}</span>
                    ) : null}
                    {line.recommended && !declined ? (
                      <span className="text-[11px] text-on-surface-variant">Recommended</span>
                    ) : null}
                    {fit.notUsual ? <NotUsualChip /> : null}
                    {fit.highVoltage ? <HighVoltageChip /> : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {declined ? null : (
                      <span className={`${LT.titleMd} tabular-nums ${LS.text}`}>{moneyLabel(cur, total)}</span>
                    )}
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
                {declined ? (
                  <div className="mt-2 p-3 bg-surface-container rounded-lg flex items-center justify-between flex-wrap gap-2">
                    <span className="flex items-center gap-1.5 text-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[18px] text-outline">info</span>
                      No items on a declined job.
                    </span>
                    {total > 0 ? (
                      <span className="text-[15px] font-medium text-outline line-through tabular-nums">
                        Quoted {moneyLabel(cur, total)}
                      </span>
                    ) : null}
                  </div>
                ) : itemsEnabled && items.length ? (
                  <ul className="mt-2 space-y-1">
                    <li className="flex justify-between text-sm text-on-surface">
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#a73a00]" />
                        Service charge
                      </span>
                      <span className="font-semibold tabular-nums">{moneyLabel(cur, charge)}</span>
                    </li>
                    {items.map((it, i) => (
                      <li
                        key={it.id ?? `${it.jobItemId ?? "o"}-${i}`}
                        className={`flex justify-between gap-2 text-sm ${
                          costRecorded(it) ? "text-on-surface-variant" : "bg-surface-container-lowest/70 rounded-md px-2 py-0.5 -mx-2"
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-outline-variant shrink-0" />
                          <span className="truncate">
                            {it.itemName || "Item"} · {qtyWithUnit(it)}
                          </span>
                        </span>
                        {costRecorded(it) ? (
                          <span className="font-semibold text-on-surface tabular-nums">{moneyLabel(cur, itemAmount(it))}</span>
                        ) : (
                          <span className="flex items-center gap-1 italic text-on-surface-variant text-xs">
                            <span className="material-symbols-outlined text-[14px]">info</span>
                            Cost not recorded (excluded from total)
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`pl-9 ${LT.bodySm} ${LS.muted}`}>
                    {[
                      line.qty != null ? `Qty ${line.qty}` : null,
                      line.brand || null,
                      line.positions?.length ? line.positions.join(" ") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="border border-outline-variant/40 rounded-lg divide-y bg-surface-container-lowest empty:hidden">
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
        <div className={`rounded-xl p-4 flex flex-col gap-2 ${LS.high}`} data-testid="log-service-review-totals">
          <div className={`uppercase tracking-wider ${LT.labelSm} ${LS.muted}`}>Cost breakdown</div>
          {itemsEnabled ? (
            <>
              <div className="flex justify-between items-center text-[15px] text-on-surface-variant" data-testid="log-service-review-jobs-total">
                <span>Jobs ({doneLines.length})</span>
                <span className="font-semibold text-on-surface tabular-nums">{moneyLabel(cur, jobsTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-[15px] text-on-surface-variant" data-testid="log-service-review-items-total">
                <span>Items &amp; parts</span>
                <span className="font-semibold text-on-surface tabular-nums">{moneyLabel(cur, itemsTotal)}</span>
              </div>
            </>
          ) : null}
          {showSubtotalBreakdown ? (
            <>
              <div className="flex justify-between items-center" data-testid="log-service-review-subtotal">
                <span className="text-sm font-semibold text-on-surface-variant">Subtotal</span>
                <span className="text-base font-semibold text-on-surface">
                  {currency} {subtotal.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center" data-testid="log-service-review-discount">
                <span className="text-sm font-semibold text-on-surface-variant">Discount</span>
                <span className="text-base font-semibold text-on-surface">
                  −{currency} {discountAmount.toLocaleString()}
                </span>
              </div>
            </>
          ) : null}
          <div
            className={`flex justify-between items-end gap-3 ${itemsEnabled || showSubtotalBreakdown ? "border-t border-outline-variant/40 pt-3 mt-1" : ""}`}
            data-testid="log-service-review-total"
          >
            <span className={`${LT.headlineMd} font-bold ${LS.text}`}>Total</span>
            <span className={`${LT.headlineMd} font-bold tracking-tight tabular-nums ${LS.text}`}>
              {moneyLabel(cur, showSubtotalBreakdown ? netTotal : subtotal)}
            </span>
          </div>
          {itemsEnabled ? (
            <p className="flex items-center gap-1.5 text-xs text-on-surface-variant pt-1">
              <span className="material-symbols-outlined text-[16px] text-[#a73a00]">verified_user</span>
              Leave a cost blank if you don&apos;t know it. It won&apos;t be added to the total.
            </p>
          ) : null}
        </div>
      </div>

      {/* Add: Stitch 07 has no boxes for these, but the service cannot be saved without them. */}
      <div className={`rounded-xl p-4 flex flex-col gap-4 ${LS.low}`} data-testid="log-service-review-details">
        <div className={`uppercase tracking-wider ${LT.labelSm} ${LS.muted}`}>Service details</div>
        <div className="border-2 border-dashed border-[#c9c5cd] rounded-xl p-5 flex flex-col items-center justify-center bg-white relative group hover:bg-[#eeedf7] transition-colors dark:bg-[#15161d]">
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
            <Label className={`${LT.labelMd} ${LS.muted}`}>Date</Label>
            <Input type="date" className="h-10 rounded-lg border-0 bg-white shadow-sm dark:bg-[#15161d]" value={date} onChange={(e) => onDateChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className={`${LT.labelMd} ${LS.muted}`}>Mileage (km)</Label>
            <Input
              type="number"
              className="h-10 rounded-lg border-0 bg-white shadow-sm dark:bg-[#15161d] font-medium"
              value={odometer || ""}
              onChange={(e) => onOdometerChange(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
  
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={`${LT.labelMd} ${LS.muted}`}>Workshop</Label>
            <Input
              value={provider}
              className="h-10 rounded-lg border-0 bg-white shadow-sm dark:bg-[#15161d]"
              onChange={(e) => onProviderChange(e.target.value)}
              placeholder="e.g. Whole-Heated Car Service LTD"
            />
          </div>
          <div className="space-y-2">
            <Label className={`${LT.labelMd} ${LS.muted}`}>Currency</Label>
            <Select value={currency || "JMD"} onValueChange={onCurrencyChange}>
              <SelectTrigger className="h-10 rounded-lg border-0 bg-white shadow-sm dark:bg-[#15161d] font-medium">
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
          <Label className={`${LT.labelMd} ${LS.muted}`}>Notes</Label>
          <Textarea
            className="min-h-[80px] rounded-lg border-0 bg-white shadow-sm dark:bg-[#15161d]"
            placeholder="Inspection notes, recommendations…"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
          />
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
