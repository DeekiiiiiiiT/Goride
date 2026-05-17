import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DollarSign, Loader2 } from 'lucide-react';
import { Button } from '@roam/ui';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@roam/ui';
import type { ManualTripInput } from '../../utils/tripFactory';
import type { RoutePoint, TripStop } from '../../types/tripSession';
import { debugLog } from '../../utils/debugLog';

export type TripFareInitialData = {
  date: string;
  time: string;
  endTime?: string;
  duration?: number;
  pickupLocation?: string;
  endLocation?: string;
  pickupCoords?: { lat: number; lon: number };
  dropoffCoords?: { lat: number; lon: number };
  distance?: number;
  route?: RoutePoint[];
  stops?: TripStop[];
  totalWaitTime?: number;
  resolutionMethod?: 'instant' | 'background' | 'manual' | 'pending';
  geocodeError?: string;
  isOffline?: boolean;
};

type TripFareDialogProps = {
  open: boolean;
  onClose: () => void;
  initialData?: TripFareInitialData;
  defaultVehicleId?: string;
  onSubmit: (data: ManualTripInput) => Promise<void>;
};

/** Fare entry after Complete — plain portal, no Radix Dialog (prevents grey-screen freeze). */
export function TripFareDialog({
  open,
  onClose,
  initialData,
  defaultVehicleId,
  onSubmit,
}: TripFareDialogProps) {
  const [amount, setAmount] = useState('');
  const [platform, setPlatform] = useState<string>('Roam');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card'>('Cash');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    // #region agent log
    debugLog('TripFareDialog.tsx:open', 'fare dialog opened', {
      hasInitialData: !!initialData,
      duration: initialData?.duration,
    }, 'H4');
    // #endregion
    setAmount('');
    setPlatform('Roam');
    setPaymentMethod('Cash');
    setLoading(false);
  }, [open, initialData]);

  const handleSave = async () => {
    if (!initialData) return;
    const fare = parseFloat(amount);
    if (!fare || fare <= 0) return;

    const payload: ManualTripInput = {
      date: initialData.date,
      time: initialData.time,
      endTime: initialData.endTime,
      duration: initialData.duration,
      amount: fare,
      platform: platform as ManualTripInput['platform'] & string,
      paymentMethod,
      pickupLocation: initialData.pickupLocation,
      dropoffLocation: initialData.endLocation,
      pickupCoords: initialData.pickupCoords,
      dropoffCoords: initialData.dropoffCoords,
      distance: initialData.distance,
      route: initialData.route,
      stops: initialData.stops,
      totalWaitTime: initialData.totalWaitTime,
      vehicleId: defaultVehicleId || '',
      isLiveRecorded: true,
      resolutionMethod: initialData.resolutionMethod,
      geocodeError: initialData.geocodeError,
      tripStatus: 'Completed',
    };

    try {
      setLoading(true);
      // #region agent log
      debugLog('TripFareDialog.tsx:save', 'fare submit', { amount: fare, platform }, 'H5');
      // #endregion
      await onSubmit(payload);
      onClose();
    } catch {
      /* parent shows toast */
    } finally {
      setLoading(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  const parsed = parseFloat(amount) || 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center safe-x p-4 sm:items-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 touch-manipulation"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-fare-title"
        className="relative z-[101] flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl"
      >
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h2 id="trip-fare-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            Enter fare received
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {initialData?.duration
              ? `Trip length: ${initialData.duration} min`
              : 'Save this trip to your log'}
            {initialData?.time && initialData?.endTime
              ? ` · ${initialData.time}–${initialData.endTime}`
              : ''}
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="trip-fare-amount">Fare amount</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-2.5 h-5 w-5 text-emerald-600" />
              <Input
                id="trip-fare-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                autoFocus
                placeholder="0.00"
                className="btn-touch h-12 pl-10 text-lg font-semibold"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="btn-touch h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  <SelectItem value="Roam">Roam</SelectItem>
                  <SelectItem value="InDrive">InDrive</SelectItem>
                  <SelectItem value="Uber">Uber</SelectItem>
                  <SelectItem value="Bolt">Bolt</SelectItem>
                  <SelectItem value="Lyft">Lyft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as 'Cash' | 'Card')}
              >
                <SelectTrigger className="btn-touch h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <Button type="button" variant="outline" className="btn-touch flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="btn-touch flex-1 bg-indigo-600 hover:bg-indigo-700"
            disabled={loading || parsed <= 0}
            onClick={() => void handleSave()}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save trip'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
