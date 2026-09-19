/**
 * Admin Gas Card + Cash create — posts to /fuel/split-fill (server stamps invariants).
 * Cash amount is not entered; it is derived after the card statement (pump − card).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, Camera, Combine } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  buildCashSplitMetadata,
  buildCardSplitMetadata,
  validateSplitPumpAmounts,
} from '@roam/fuel-core';
import type { FuelCard } from '../../types/fuel';
import type { StationProfile } from '../../types/station';
import { fuelService } from '../../services/fuelService';
import { uploadEvidenceFile } from '../../services/uploadEvidence';
import { findActiveFuelCardForSession } from '../../utils/fuelCardMatch';
import { formatCustomerFacingFuelCardLabel } from '../../utils/fuelCardDisplay';
import { validateGasCardCreateGates } from '../../utils/gasCardCreateGates';
import { buildGasCardOdometerAnchor } from '../../utils/buildGasCardOdometerAnchor';
import { fuelSaveErrorMessage } from '../../utils/fuelSaveErrorMessage';

type AdminSplitFillModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  vehicles: Array<{ id: string; name?: string; licensePlate?: string }>;
  drivers: Array<{ id: string; name?: string }>;
  cards: FuelCard[];
  isRoamManagedCard?: (card: FuelCard) => boolean;
};

export function AdminSplitFillModal({
  isOpen,
  onClose,
  onSaved,
  vehicles,
  drivers,
  cards,
  isRoamManagedCard,
}: AdminSplitFillModalProps) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [pumpTotal, setPumpTotal] = useState('');
  const [liters, setLiters] = useState('');
  const [brand, setBrand] = useState('');
  const [matchedStationId, setMatchedStationId] = useState('');
  const [stationAddress, setStationAddress] = useState('');
  const [location, setLocation] = useState('');
  const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [assignedGasCard, setAssignedGasCard] = useState<FuelCard | null>(null);
  const [gasCardLookupDone, setGasCardLookupDone] = useState(false);
  const [pendingOdometerFile, setPendingOdometerFile] = useState<File | null>(null);
  const [odometerPreviewUrl, setOdometerPreviewUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const odometerFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setTime('');
    setVehicleId('');
    setDriverId('');
    setOdometer('');
    setPumpTotal('');
    setLiters('');
    setBrand('');
    setMatchedStationId('');
    setStationAddress('');
    setLocation('');
    setAssignedGasCard(null);
    setGasCardLookupDone(false);
    setPendingOdometerFile(null);
    setOdometerPreviewUrl('');
    setIsSubmitting(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setStationsLoading(true);
    fuelService
      .getStations()
      .then((all) => {
        if (cancelled) return;
        setVerifiedStations((all || []).filter((s) => s.status === 'verified'));
      })
      .catch(() => {
        if (!cancelled) setVerifiedStations([]);
      })
      .finally(() => {
        if (!cancelled) setStationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !vehicleId || !driverId) {
      setAssignedGasCard(null);
      setGasCardLookupDone(Boolean(vehicleId && driverId));
      return;
    }
    setGasCardLookupDone(false);
    const card = findActiveFuelCardForSession(cards, { vehicleId, driverId });
    setAssignedGasCard(card ?? null);
    setGasCardLookupDone(true);
  }, [isOpen, vehicleId, driverId, cards]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    verifiedStations.forEach((s) => {
      if (s.brand) set.add(s.brand);
    });
    return Array.from(set).sort();
  }, [verifiedStations]);

  const stationsForBrand = useMemo(() => {
    if (!brand) return [];
    return verifiedStations
      .filter((s) => s.brand === brand)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [verifiedStations, brand]);

  const canSubmit =
    !!vehicleId &&
    !!driverId &&
    !!matchedStationId &&
    !!assignedGasCard &&
    Number(odometer) > 0 &&
    (!!pendingOdometerFile || !!odometerPreviewUrl) &&
    validateSplitPumpAmounts(pumpTotal, liters).ok &&
    !isSubmitting;

  const handleSubmit = async () => {
    const gate = validateGasCardCreateGates({
      assignedGasCard,
      gasCardLookupDone,
      matchedStationId,
      odometer,
      hasOdometerPhoto: !!(pendingOdometerFile || odometerPreviewUrl),
    });
    if (!gate.ok) {
      toast.error(gate.error);
      return;
    }
    const pumpCheck = validateSplitPumpAmounts(pumpTotal, liters);
    if (!pumpCheck.ok) {
      toast.error(pumpCheck.error);
      return;
    }
    const activeCard = assignedGasCard;
    if (!activeCard) return;

    setIsSubmitting(true);
    try {
      const fillGroupId = crypto.randomUUID();
      const cashTxId = crypto.randomUUID();
      const cardEntryId = crypto.randomUUID();
      const finalTime = time ? (time.length === 5 ? `${time}:00` : time) : undefined;
      const dateWithTime = finalTime ? `${date}T${finalTime}` : date;

      let odometerImageUrl = odometerPreviewUrl || '';
      if (pendingOdometerFile) {
        const { url } = await uploadEvidenceFile(pendingOdometerFile, {
          evidenceType: 'odometer_proof',
          sourceType: 'fuel_entry',
          sourceId: cardEntryId,
          retentionClass: 'ephemeral',
          parentStatus: 'Pending',
        });
        odometerImageUrl = url;
      }

      const cashMeta = buildCashSplitMetadata({
        fillGroupId,
        splitPumpTotal: pumpCheck.pumpTotal,
      });
      const cardMeta = buildCardSplitMetadata({
        fillGroupId,
        splitPumpTotal: pumpCheck.pumpTotal,
      });
      const driver = drivers.find((d) => d.id === driverId);
      const station = verifiedStations.find((s) => s.id === matchedStationId);

      const cashTransaction: Record<string, unknown> = {
        id: cashTxId,
        date,
        time: finalTime,
        category: 'Fuel',
        type: 'Expense',
        status: 'Pending',
        amount: 0,
        quantity: pumpCheck.liters,
        description: `Fuel (split — cash pending statement) — ${station?.name || location || 'Pump'}`,
        driverId,
        vehicleId,
        odometer: Number(odometer),
        matchedStationId,
        entrySource: 'admin-manual',
        metadata: {
          ...cashMeta,
          fuelVolume: pumpCheck.liters,
          splitPumpLiters: pumpCheck.liters,
          entrySource: 'admin-manual',
          matchedStationId,
          stationLocation: stationAddress || station?.address || location,
          stationName: station?.name || location,
          driverName: driver?.name,
          odometerProofUrl: odometerImageUrl || undefined,
          source: 'Manual',
          isManual: true,
        },
      };

      const cardAnchor = buildGasCardOdometerAnchor({
        id: cardEntryId,
        date: dateWithTime,
        time: finalTime,
        cardId: activeCard.id,
        vehicleId,
        driverId,
        odometer: Number(odometer),
        odometerImageUrl: odometerImageUrl || undefined,
        location: location || station?.name,
        stationAddress: stationAddress || station?.address,
        matchedStationId,
        entrySource: 'admin-manual',
        driverName: driver?.name,
      });

      const cardFuelEntry: Record<string, unknown> = {
        ...cardAnchor,
        liters: 0,
        metadata: {
          ...(cardAnchor.metadata || {}),
          ...cardMeta,
          splitPumpLiters: pumpCheck.liters,
          awaitingCardStatement: true,
          countsInFuelSpend: false,
          countsInFuelVolume: false,
        },
      };

      await fuelService.saveSplitFill({
        fillGroupId,
        cashTransaction,
        cardFuelEntry,
      });

      toast.success('Split fill logged — cash will settle after the gas card statement');
      await onSaved();
      onClose();
    } catch (e) {
      console.error('[AdminSplitFillModal] save failed', e);
      toast.error(fuelSaveErrorMessage(e, 'Failed to save split fill'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Combine className="h-5 w-5" aria-hidden />
            Gas Card + Cash
          </DialogTitle>
          <DialogDescription>
            One pump stop paid partly by card and partly by the driver. Enter the pump total and
            liters — cash is set after the statement (pump − card). Do not create two separate rows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="split-date">Date</Label>
              <Input id="split-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="split-time">Time</Label>
              <Input id="split-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Vehicle</Label>
            <Select value={vehicleId || undefined} onValueChange={setVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name || v.licensePlate || v.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Driver</Label>
            <Select value={driverId || undefined} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Select driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name || d.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {gasCardLookupDone && (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                assignedGasCard
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {assignedGasCard
                ? `Active card: ${formatCustomerFacingFuelCardLabel(
                    assignedGasCard,
                    !!isRoamManagedCard?.(assignedGasCard),
                  )}`
                : 'No Active gas card assigned to this vehicle/driver in Card Inventory'}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="split-pump">Pump total ($)</Label>
              <Input
                id="split-pump"
                type="number"
                min="0"
                step="0.01"
                value={pumpTotal}
                onChange={(e) => setPumpTotal(e.target.value)}
                placeholder="This Sale"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="split-liters">Liters</Label>
              <Input
                id="split-liters"
                type="number"
                min="0"
                step="0.01"
                value={liters}
                onChange={(e) => setLiters(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="split-odo">Odometer</Label>
            <Input
              id="split-odo"
              type="number"
              min="0"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Odometer photo</Label>
            <input
              ref={odometerFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPendingOdometerFile(file);
                setOdometerPreviewUrl(URL.createObjectURL(file));
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => odometerFileInputRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
              {odometerPreviewUrl ? 'Change photo' : 'Upload photo'}
            </Button>
            {odometerPreviewUrl ? (
              <img
                src={odometerPreviewUrl}
                alt="Odometer proof"
                className="mt-2 h-24 w-auto rounded border border-slate-200 object-cover"
              />
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select
              value={brand || undefined}
              onValueChange={(b) => {
                setBrand(b);
                setMatchedStationId('');
                setLocation('');
                setStationAddress('');
              }}
              disabled={stationsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={stationsLoading ? 'Loading stations…' : 'Select brand'} />
              </SelectTrigger>
              <SelectContent>
                {brandOptions.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Verified station</Label>
            <Select
              value={matchedStationId || undefined}
              onValueChange={(id) => {
                const st = verifiedStations.find((s) => s.id === id);
                setMatchedStationId(id);
                setLocation(st?.name || '');
                setStationAddress(st?.address || '');
              }}
              disabled={!brand}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select station" />
              </SelectTrigger>
              <SelectContent>
                {stationsForBrand.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save split fill'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AdminSplitFillModal;
