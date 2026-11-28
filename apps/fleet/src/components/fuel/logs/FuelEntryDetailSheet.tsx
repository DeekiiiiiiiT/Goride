import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';
import { cn } from '../../ui/utils';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { resolveFuelEntrySource } from '../../../utils/fuelEntrySource';
import type { FuelEntry } from '../../../types/fuel';
import {
  entrySourceLabel,
  formatFuelEntryTime,
  formatFuelLogDayLabel,
  humanizeEntryType,
} from './fuelLogDisplay';
import { buildSplitBreakdown, isPendingSplitEntry } from './splitFillDisplay';
import { splitReconTolerance } from '@roam/fuel-core';
import { classifyFuelLogEdit } from '../../../utils/fuelLogEditGate';

/**
 * Fill details side panel for one saved fuel entry.
 * Look: Stitch docs/stitch/fuel-logs-details-and-pay-fleet/fill_details_panel_* (cash fill, split fill).
 * Presentational only — parent supplies labels + data.
 */

export type FuelEntryDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: FuelEntry | null;
  /** Sibling rows for a Gas Card + Cash fill (same fillGroupId). */
  splitSiblings?: FuelEntry[];
  vehicleLabel?: string;
  driverLabel?: string;
  stationLabel?: string;
  /** Street address line (from resolveFuelEntryStationDisplay.subtitle). */
  stationAddressLabel?: string;
  paymentLabel?: string;
  prevOdometer?: number | null;
  tankCapacity?: number;
  canEdit?: boolean;
  onEdit?: (entry: FuelEntry) => void;
  onResolveSplitCash?: (entry: FuelEntry) => void;
};

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <span className="shrink-0 text-[15px] text-[#47464c] dark:text-zinc-400">{label}</span>
      <div className="text-right text-[15px] font-medium tabular-nums text-[#0d1c2e] dark:text-zinc-50">{children}</div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-[#47464c] dark:text-zinc-400">
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
        {title}
      </h4>
      <div className="rounded-2xl bg-[#f8f9ff] px-5 py-2 dark:bg-zinc-900/50">{children}</div>
    </section>
  );
}

/** Plain words for how the fill reached Roam. */
function loggedAsLabel(src: string): string {
  switch (src) {
    case 'driver-portal':
      return "From the driver's phone";
    case 'admin-manual':
      return 'A fill typed in Fleet';
    case 'admin-edit':
      return 'Changed in Fleet';
    case 'bulk-import':
      return 'Imported from a file';
    case 'fuel-card':
      return 'From the gas card statement';
    default:
      return entrySourceLabel(src).label;
  }
}

export function FuelEntryDetailSheet({
  open,
  onOpenChange,
  entry,
  splitSiblings,
  vehicleLabel,
  driverLabel,
  stationLabel,
  stationAddressLabel,
  paymentLabel,
  prevOdometer = null,
  tankCapacity = 40,
  canEdit = false,
  onEdit,
  onResolveSplitCash,
}: FuelEntryDetailSheetProps) {
  if (!entry) return null;

  const splitGroup =
    splitSiblings && splitSiblings.length > 0
      ? splitSiblings
      : isPendingSplitEntry(entry)
        ? [entry]
        : [];
  const splitBreakdown = splitGroup.length > 0 ? buildSplitBreakdown(splitGroup) : null;
  const splitTolerance = splitBreakdown ? splitReconTolerance(splitBreakdown.pumpTotal) : null;
  const editGate = classifyFuelLogEdit(entry, splitGroup);

  const liters = typeof entry.liters === 'number' ? entry.liters : 0;
  const amount = entry.amount ?? 0;
  const pricePerLiter = entry.pricePerLiter || (liters > 0 && amount ? amount / liters : 0);
  const tank = tankCapacity || 40;
  const fillPct = Math.min(100, (liters / tank) * 100);
  const locationStatus = entry.metadata?.locationStatus || entry.locationStatus;
  const src = resolveFuelEntrySource(entry);
  const srcLabel = entrySourceLabel(src);
  const curOdo = Number(entry.odometer) || 0;
  const delta = prevOdometer != null ? Math.abs(curOdo - prevOdometer) : null;
  const isRegression = prevOdometer != null ? curOdo < prevOdometer : false;
  const isSplitFill = Boolean(splitBreakdown && splitGroup.length >= 2) || isPendingSplitEntry(entry);
  const paidBy = isSplitFill ? 'Gas card + cash' : paymentLabel || '—';
  const awaitingCard = (entry.metadata as { awaitingCardStatement?: boolean } | undefined)?.awaitingCardStatement === true;
  const stationName = stationLabel || entry.vendor || entry.metadata?.stationName || 'Unknown';
  const address =
    stationAddressLabel && stationAddressLabel !== 'No GPS metadata' ? stationAddressLabel : entry.stationAddress || '';
  const entryTime = formatFuelEntryTime(entry);
  const isSealed = !!entry.signature || entry.isLocked === true || entry.status === 'Finalized';
  const editBlocked =
    isSealed ||
    editGate.kind === 'awaiting_card_readonly' ||
    editGate.kind === 'awaiting_cash_readonly' ||
    (editGate.kind === 'resolve_split_cash' && !onResolveSplitCash);
  const fuelType = entry.fuelType || (entry.metadata as { jaaFuelType?: string } | undefined)?.jaaFuelType || '';
  const title = `${formatFuelLogDayLabel(entry.date)}${entryTime ? `, ${entryTime}` : ''}`;
  const subtitle = [driverLabel || entry.driverId, vehicleLabel || entry.vehicleId].filter(Boolean).join(' · ');
  const hasFillGroup = typeof entry.metadata?.fillGroupId === 'string' && entry.metadata.fillGroupId.length > 0;
  const pumpTotal = splitBreakdown ? splitBreakdown.pumpTotal : amount;

  const close = () => onOpenChange(false);
  const secondaryBtn =
    'min-h-[44px] rounded-xl bg-white px-5 text-[13px] font-medium text-[#0d1c2e] shadow-sm ring-1 ring-[#c9c5cd] hover:bg-[#e6eeff] disabled:opacity-40 dark:bg-zinc-900 dark:text-zinc-100';
  const bigLabel = 'text-[12px] font-semibold uppercase tracking-wider text-[#47464c] dark:text-zinc-400';
  const bigValue = 'text-[24px] font-bold leading-tight tabular-nums text-[#0d1c2e] dark:text-zinc-50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        aria-describedby="fuel-entry-detail-desc"
        className="left-auto right-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-[480px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-2xl sm:max-w-[480px] sm:rounded-l-2xl dark:bg-[#2a2a2d]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-[24px] font-semibold tracking-tight text-[#0d1c2e] dark:text-zinc-50">{title}</DialogTitle>
              {isSplitFill ? (
                <span className="rounded-full bg-[#e6eeff] px-3 py-1 text-[12px] font-semibold text-[#0d1c2e] dark:bg-zinc-800 dark:text-zinc-100">
                  Gas card + cash
                </span>
              ) : src !== 'driver-portal' ? (
                <span className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold', srcLabel.color)}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {srcLabel.label}
                </span>
              ) : null}
            </div>
            <DialogDescription id="fuel-entry-detail-desc" className="mt-1 text-[15px] text-[#47464c] dark:text-zinc-400">
              {subtitle}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="material-symbols-outlined flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eff4ff] text-[20px] text-[#0d1c2e] hover:bg-[#e6eeff] dark:bg-zinc-800 dark:text-zinc-100"
          >
            close
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Big numbers */}
          <div className="rounded-2xl bg-[#eff4ff] p-5 dark:bg-zinc-900/50">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1">
                <div className={bigLabel}>{isSplitFill ? 'Pump total' : 'Total'}</div>
                <div className={bigValue}>{pumpTotal || awaitingCard ? (awaitingCard && !pumpTotal ? '—' : formatFuelMoney(pumpTotal)) : '—'}</div>
              </div>
              <div>
                <div className={bigLabel}>Litres</div>
                <div className={bigValue}>{liters > 0 ? `${liters.toFixed(1)} L` : '—'}</div>
              </div>
              <div>
                <div className={bigLabel}>Price</div>
                <div className="pt-1 text-[17px] font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-50">
                  {pricePerLiter > 0 ? (
                    <>
                      {formatFuelMoney(pricePerLiter)}
                      <span className="ml-1 text-[13px] font-normal text-[#47464c]">a litre</span>
                    </>
                  ) : (
                    '—'
                  )}
                </div>
              </div>
            </div>
            {liters > 0 ? (
              <div className="mt-4">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#dce9ff] dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-[#0d1c2e] dark:bg-zinc-100" style={{ width: `${fillPct}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[13px] text-[#47464c] dark:text-zinc-400">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">local_gas_station</span>
                    <span className="font-semibold text-[#0d1c2e] dark:text-zinc-100">{fillPct.toFixed(0)}%</span> of the tank
                  </span>
                  <span>Tank: {tank.toFixed(1)} L</span>
                </div>
              </div>
            ) : null}
            {awaitingCard ? (
              <p className="mt-3 inline-flex rounded-full bg-[#fffbeb] px-3 py-1 text-[12px] font-semibold text-[#b45309]">
                Amount and litres come from the gas card statement
              </p>
            ) : null}
          </div>

          {/* Paid two ways (split fill) */}
          {hasFillGroup ? (
            <section className="flex flex-col gap-2 rounded-2xl bg-[#eff4ff] p-5 dark:bg-zinc-900/50">
              <h4 className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-wider text-[#0d1c2e] dark:text-zinc-100">
                Paid two ways
                <span className="material-symbols-outlined text-[18px] text-[#47464c]">account_balance_wallet</span>
              </h4>
              {splitBreakdown ? (
                <>
                  <Row label="Gas card">
                    {splitBreakdown.statementAmount != null ? (
                      <>
                        {formatFuelMoney(splitBreakdown.statementAmount)}
                        <span className="block text-[13px] font-normal text-[#47464c]">(from the statement)</span>
                      </>
                    ) : (
                      <span className="rounded-full bg-[#fffbeb] px-3 py-1 text-[12px] font-semibold text-[#b45309]">Waiting on statement</span>
                    )}
                  </Row>
                  <Row label="Cash">
                    {splitBreakdown.cashPendingStatement ? (
                      <span className="rounded-full bg-[#fffbeb] px-3 py-1 text-[12px] font-semibold text-[#b45309]">Waiting on statement</span>
                    ) : (
                      formatFuelMoney(splitBreakdown.cashAmount)
                    )}
                  </Row>
                  {splitGroup.length < 2 && !splitBreakdown.cashPendingStatement ? (
                    <p className="text-[13px] text-[#b45309]">The cash approval or the statement is still open.</p>
                  ) : null}
                  {splitBreakdown.hasMismatch ? (
                    <>
                      <div className="mt-1 flex items-center gap-2 rounded-xl bg-[#ffdad6] px-4 py-3 text-[13px] font-semibold text-[#ba1a1a]">
                        <span className="material-symbols-outlined text-[18px]">error</span>
                        {splitBreakdown.varianceDelta != null
                          ? `The card and the pump differ by ${formatFuelMoney(Math.abs(splitBreakdown.varianceDelta))}`
                          : "The card and the pump don't agree"}
                      </div>
                      {splitTolerance != null ? (
                        <div className="flex justify-between px-1 text-[13px] text-[#47464c]">
                          <span>Allowed difference</span>
                          <span className="tabular-nums">{formatFuelMoney(splitTolerance)}</span>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {splitBreakdown.reconciled ? (
                    <span className="w-fit rounded-full bg-[#82f5c1] px-3 py-1 text-[12px] font-semibold text-[#00714e]">Difference settled</span>
                  ) : null}
                </>
              ) : (
                <p className="text-[15px] text-[#47464c]">Linked to another fill at the same pump stop.</p>
              )}
            </section>
          ) : null}

          <Section icon="location_on" title="Where">
            <Row label="Station">
              <span className="flex items-center justify-end gap-2">
                {stationName}
                {locationStatus === 'verified' ? (
                  <span className="flex items-center gap-1 rounded-full bg-[#82f5c1] px-2.5 py-0.5 text-[12px] font-semibold text-[#00714e]">
                    <span className="material-symbols-outlined text-[14px]">verified</span> Verified station
                  </span>
                ) : locationStatus === 'learnt' ? (
                  <span className="rounded-full bg-[#fffbeb] px-2.5 py-0.5 text-[12px] font-semibold text-[#b45309]">Not checked yet</span>
                ) : null}
              </span>
            </Row>
            {address ? <Row label="Address">{address}</Row> : null}
          </Section>

          <Section icon="speed" title="Odometer">
            <Row label="Odometer">{curOdo > 0 ? `${curOdo.toLocaleString('en-US')} km` : '—'}</Row>
            {prevOdometer != null ? <Row label="Last fill">{prevOdometer.toLocaleString('en-US')} km</Row> : null}
            {delta != null ? (
              <Row label="Since last fill">
                <span
                  className={cn(
                    'rounded-full px-3 py-1 text-[13px] font-semibold',
                    isRegression ? 'bg-[#ffdad6] text-[#ba1a1a]' : 'bg-[#ecfdf5] text-[#069669]',
                  )}
                >
                  {isRegression ? `−${delta.toLocaleString('en-US')} km` : `+${delta.toLocaleString('en-US')} km`}
                </span>
              </Row>
            ) : null}
            {isRegression ? (
              <p className="pb-2 text-[13px] text-[#ba1a1a]">Lower than the last fill — check the odometer.</p>
            ) : null}
          </Section>

          <Section icon="description" title="How it was logged">
            <Row label="Driver">{driverLabel || entry.driverId || '—'}</Row>
            <Row label="Car">{vehicleLabel || entry.vehicleId || '—'}</Row>
            <Row label="Paid with">{paidBy}</Row>
            <Row label="Logged as">{loggedAsLabel(src)}</Row>
            <Row label="Kind of fill">{humanizeEntryType(entry.type) || entry.type || '—'}</Row>
            {entry.entryMode ? <Row label="Entry">{entry.entryMode === 'Anchor' ? 'Gas card odometer reading' : String(entry.entryMode)}</Row> : null}
            {fuelType ? <Row label="Fuel">{String(fuelType)}</Row> : null}
          </Section>

          {entry.notes ? (
            <section className="rounded-2xl bg-[#fffbeb] p-5 dark:bg-[#451a03]/60">
              <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-[#b45309]">Note</h4>
              <p className="text-[15px] text-[#0d1c2e] dark:text-zinc-100">{entry.notes}</p>
            </section>
          ) : null}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col gap-3 border-t border-[#e6eeff] bg-white px-6 py-4 dark:border-zinc-800 dark:bg-[#2a2a2d]">
          {editGate.kind === 'awaiting_card_readonly' || editGate.kind === 'awaiting_cash_readonly' ? (
            <div className="rounded-xl bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">{editGate.reason}</div>
          ) : null}
          {editGate.kind === 'resolve_split_cash' ? (
            <div className="rounded-xl bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">
              The cash part waits for the gas card statement. Use Decide pay to set it — changes here would not apply.
            </div>
          ) : null}
          {isSealed ? (
            <div className="flex items-center gap-2 text-[13px] text-[#47464c] dark:text-zinc-400">
              <span className="material-symbols-outlined text-[18px]">lock</span>
              This fill is locked and can&apos;t be changed.
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            {canEdit && editGate.kind === 'resolve_split_cash' && onResolveSplitCash ? (
              <button
                type="button"
                disabled={isSealed}
                onClick={() => {
                  close();
                  onResolveSplitCash(entry);
                }}
                className="flex min-h-[44px] items-center gap-2 rounded-xl bg-black px-6 text-[13px] font-medium text-white shadow-md hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
              >
                <span className="material-symbols-outlined text-[18px]">price_check</span> Decide pay
              </button>
            ) : canEdit && onEdit ? (
              <button
                type="button"
                disabled={editBlocked}
                title={
                  editGate.kind === 'awaiting_card_readonly' || editGate.kind === 'awaiting_cash_readonly'
                    ? editGate.reason
                    : editBlocked
                      ? "This fill is locked and can't be changed."
                      : undefined
                }
                onClick={() => {
                  close();
                  onEdit(entry);
                }}
                className={`${secondaryBtn} flex items-center gap-2`}
              >
                <span className="material-symbols-outlined text-[18px]">edit</span> Edit this fill
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={close} className={secondaryBtn}>
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FuelEntryDetailSheet;
