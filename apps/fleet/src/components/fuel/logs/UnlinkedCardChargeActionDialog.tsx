import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import type { FuelEntry } from '../../../types/fuel';
import type { StationProfile } from '../../../types/station';
import { fuelService } from '../../../services/fuelService';
import { toast } from 'sonner';
import { isJaaStatementLedgerRow } from '../../../utils/jaaFuelStatementMatcher';
import { matchVendorToVerifiedStation } from '../../../utils/jaaStationDisplay';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

export type UnlinkedChargeAction = 'adopt' | 'link' | 'dismiss' | 'request_driver';

type StationMode = 'jaa_text' | 'verified';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: UnlinkedChargeAction | null;
  statement: FuelEntry | null;
  /** Candidate ops logs for Link action (same week, gas card, unmatched). */
  linkCandidates: FuelEntry[];
  drivers: { id: string; name: string }[];
  /** Verified Dominion stations for Confirm station pick. */
  verifiedStations?: StationProfile[];
  onDone: () => void | Promise<void>;
};

const DEFAULT_CONFIRM_REASON = 'Confirmed odometer and station for unmatched card charge';

function stmtMeta(statement: FuelEntry | null): Record<string, unknown> {
  return (statement?.metadata || {}) as Record<string, unknown>;
}

function suggestedMileage(statement: FuelEntry | null): number | null {
  const n = Number(stmtMeta(statement).jaaMileage);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function merchantLabel(statement: FuelEntry | null): string {
  const m = stmtMeta(statement);
  return String(m.jaaStation || statement?.location || m.jaaVendorRaw || '').trim() || '—';
}

export function UnlinkedCardChargeActionDialog({
  open,
  onOpenChange,
  action,
  statement,
  linkCandidates,
  drivers,
  verifiedStations = [],
  onDone,
}: Props) {
  const [reason, setReason] = useState('');
  const [odometer, setOdometer] = useState('');
  const [driverId, setDriverId] = useState('');
  const [linkEntryId, setLinkEntryId] = useState('');
  const [stationMode, setStationMode] = useState<StationMode>('jaa_text');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedStationId, setSelectedStationId] = useState('');
  const [busy, setBusy] = useState(false);

  const jaaMileage = suggestedMileage(statement);
  const merchant = merchantLabel(statement);

  const uniqueBrands = useMemo(() => {
    const brands = new Set<string>();
    for (const s of verifiedStations) {
      if (s.status && s.status !== 'verified') continue;
      if (s.brand) brands.add(s.brand);
    }
    return Array.from(brands).sort();
  }, [verifiedStations]);

  const stationsForBrand = useMemo(() => {
    if (!selectedBrand) return [];
    return verifiedStations.filter(
      (s) => s.brand === selectedBrand && (!s.status || s.status === 'verified'),
    );
  }, [verifiedStations, selectedBrand]);

  // Prefill when opening Confirm (adopt)
  useEffect(() => {
    if (!open || action !== 'adopt' || !statement) return;
    const suggested = suggestedMileage(statement);
    setOdometer(suggested != null ? String(suggested) : '');
    setReason(DEFAULT_CONFIRM_REASON);
    setDriverId(statement.driverId || '');
    setStationMode('jaa_text');
    setSelectedBrand('');
    setSelectedStationId('');

    const hint = matchVendorToVerifiedStation(merchantLabel(statement), verifiedStations, 0.65);
    if (hint) {
      setStationMode('verified');
      setSelectedBrand(hint.brand || '');
      setSelectedStationId(hint.id);
    }
  }, [open, action, statement, verifiedStations]);

  const title = useMemo(() => {
    switch (action) {
      case 'adopt':
        return 'Confirm unmatched card charge';
      case 'link':
        return 'Link to existing log';
      case 'dismiss':
        return 'Dismiss card charge';
      case 'request_driver':
        return 'Request driver log';
      default:
        return 'Unmatched card charge';
    }
  }, [action]);

  const reset = () => {
    setReason('');
    setOdometer('');
    setDriverId('');
    setLinkEntryId('');
    setStationMode('jaa_text');
    setSelectedBrand('');
    setSelectedStationId('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    if (!statement?.id || !action) return;
    if (action !== 'request_driver' && !reason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setBusy(true);
    try {
      if (action === 'adopt') {
        const odoNum = Number(odometer);
        if (!Number.isFinite(odoNum) || odoNum <= 0) {
          toast.error('Enter the odometer reading');
          setBusy(false);
          return;
        }
        if (stationMode === 'verified' && !selectedStationId) {
          toast.error('Pick a verified station or keep the statement merchant');
          setBusy(false);
          return;
        }
        if (!driverId && !statement.driverId) {
          toast.error('Select a driver');
          setBusy(false);
          return;
        }
        const station = verifiedStations.find((s) => s.id === selectedStationId);
        await fuelService.adoptJaaStatement({
          statementId: statement.id,
          reason: reason.trim(),
          driverId: driverId || statement.driverId || undefined,
          vehicleId: statement.vehicleId || undefined,
          odometer: odoNum,
          stationMode,
          matchedStationId: stationMode === 'verified' ? selectedStationId : null,
          stationName: stationMode === 'verified' ? station?.name || null : null,
          stationAddress: stationMode === 'verified' ? station?.address || null : null,
        });
        toast.success('Charge confirmed into Transaction Logs');
      } else if (action === 'link') {
        if (!linkEntryId) {
          toast.error('Pick a log to link');
          setBusy(false);
          return;
        }
        await fuelService.linkJaaStatement({
          statementId: statement.id,
          driverEntryId: linkEntryId,
          reason: reason.trim(),
        });
        toast.success('Statement linked to log');
      } else if (action === 'dismiss') {
        await fuelService.dismissJaaStatement({
          statementId: statement.id,
          reason: reason.trim(),
        });
        toast.success('Charge dismissed (kept for audit)');
      } else if (action === 'request_driver') {
        await fuelService.requestDriverLogForJaaStatement({
          statementId: statement.id,
          message: reason.trim() || undefined,
        });
        toast.success('Driver notified to log this fill');
      }
      reset();
      onOpenChange(false);
      await onDone();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Action failed';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const amount = Number(statement?.amount) || 0;
  const needsDriverPick = action === 'adopt' && !statement?.driverId;
  const receipt = String(stmtMeta(statement).jaaReceiptNumber || '');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={action === 'adopt' ? 'sm:max-w-lg' : 'sm:max-w-md'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {statement ? (
              <>
                {formatFuelMoney(amount)} · {String(statement.date || '').slice(0, 10)}
                {statement.time ? ` · ${String(statement.time).slice(0, 8)}` : ''}
                {receipt ? ` · ${receipt}` : ''}
                {action === 'adopt' ? ` · ${merchant}` : null}
                {statement && isJaaStatementLedgerRow(statement) && action !== 'adopt'
                  ? ' · statement charge'
                  : null}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {needsDriverPick ? (
            <div className="space-y-1.5">
              <Label>Driver</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {action === 'adopt' ? (
            <>
              <div className="space-y-1.5">
                <Label>Odometer</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Required"
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                />
                {jaaMileage != null ? (
                  <p className="text-[11px] text-slate-500">
                    Suggested from card statement: {jaaMileage.toLocaleString()}. Keep or edit.
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-800">
                    No mileage on the statement — enter the odometer to continue.
                  </p>
                )}
              </div>

              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <Label className="text-sm">Fuel station</Label>
                <div className="flex flex-col gap-2">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="radio"
                      className="mt-1"
                      name="stationMode"
                      checked={stationMode === 'jaa_text'}
                      onChange={() => setStationMode('jaa_text')}
                    />
                    <span>
                      <span className="font-medium">Keep statement merchant</span>
                      <span className="mt-0.5 block text-[11px] text-slate-600">{merchant}</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="radio"
                      className="mt-1"
                      name="stationMode"
                      checked={stationMode === 'verified'}
                      onChange={() => setStationMode('verified')}
                    />
                    <span className="font-medium">Use verified station</span>
                  </label>
                </div>

                {stationMode === 'verified' ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Brand</Label>
                      <Select
                        value={selectedBrand}
                        onValueChange={(brand) => {
                          setSelectedBrand(brand);
                          setSelectedStationId('');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select brand" />
                        </SelectTrigger>
                        <SelectContent>
                          {uniqueBrands.map((brand) => (
                            <SelectItem key={brand} value={brand}>
                              {brand}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Station</Label>
                      <Select
                        value={selectedStationId}
                        onValueChange={setSelectedStationId}
                        disabled={!selectedBrand || stationsForBrand.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !selectedBrand
                                ? 'Pick a brand first'
                                : stationsForBrand.length === 0
                                  ? 'No stations'
                                  : 'Select station'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {stationsForBrand.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                              {s.address ? ` · ${s.address}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {action === 'link' ? (
            <div className="space-y-1.5">
              <Label>Existing gas-card log</Label>
              <Select value={linkEntryId} onValueChange={setLinkEntryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select log" />
                </SelectTrigger>
                <SelectContent>
                  {linkCandidates.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {String(e.date || '').slice(0, 10)} ·{' '}
                      {e.odometer != null ? `odo ${e.odometer}` : 'no odo'} ·{' '}
                      {e.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkCandidates.length === 0 ? (
                <p className="text-[11px] text-amber-800">
                  No unmatched gas-card logs in this period. Confirm into logs instead.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>
              {action === 'request_driver' ? 'Message (optional)' : 'Reason'}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                action === 'dismiss'
                  ? 'Non-fuel, wrong card, disputed with issuer…'
                  : action === 'request_driver'
                    ? 'Optional note for the driver'
                    : 'Why this action is correct'
              }
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Working…' : action === 'adopt' ? 'Confirm & accept' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
