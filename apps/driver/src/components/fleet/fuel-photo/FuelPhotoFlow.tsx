/**
 * Log fuel, photos first (docs/fuel-log-offline-first-audit.md, section 5 + round 2 section 9).
 * Stitch: Downloads/logging fuel/stitch_roam_driver_fuel_logging (screens 2–7, 11, 13).
 *
 * Odometer photo → How did you pay? → Pump or receipt photo → Save.
 * - Each photo is stored on the phone the moment it is taken (FO-01); a screen kill loses nothing.
 * - Photos come from the camera already shrunk (FO-02); previews are file links, not text copies.
 * - Location starts when the flow opens and never blocks (FO-03).
 * - Readings run in the background with a time limit; typing is optional (FO-04, FO-13).
 * - Save puts the fill on the waiting list, the one path to the server (FO-05).
 * - Gas Card needs no lookup to save (FO-12). Gas Card + Cash needs the pump total and litres.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, CloudOff, CreditCard, Banknote, History, MapPin, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { withTimeout } from '@roam/fuel-core/phoneOutbox';
import { api } from '../../../services/api';
import { fuelService } from '../../../services/fuelService';
import { useOffline } from '../../providers/OfflineProvider';
import { captureNativePhoto, consumeRestoredPhoto } from '../../../utils/nativePhotoCapture';
import { readDriverGeolocationFix } from '../../../utils/nativeLocationAccess';
import { resolveVehicleIdForDriver } from '../../../utils/resolveDriverVehicleId';
import { findActiveFuelCardForSession } from '../../../utils/fuelCardMatch';
import { collectDriverAliasIds, resolveCanonicalDriverIdentity } from '@roam/types/driverIdentity';
import {
  buildFuelPhotoQueueAction,
  canLeaveOdometerStep,
  canSave,
  newFuelPhotoDraft,
  pricePerLitre,
  stationQuestion,
  distanceLabel,
  type StationOption,
  type FuelPhotoDraft,
  type FuelPhotoPayment,
} from './fuelPhotoFill';
import {
  cancelFuelPhotoDraft,
  getDraftPhoto,
  loadFuelPhotoDraft,
  putDraftPhoto,
  releaseFuelPhotoDraft,
  saveFuelPhotoDraft,
} from './fuelPhotoDraftStore';
import { reportFuelStep } from './fuelPhotoReport';
import { calculateDistance } from '../../../utils/geoUtils';
import type { FuelProximityStation } from '../../../utils/fuelProximity';
import { offlineStorage } from '../../../services/offlineStorage';

const PHOTO_MAX_SIZE = 1600;
const READ_LIMIT_MS = 15_000;
const GPS_LIMIT_MS = 20_000;
const CARD_LIMIT_MS = 10_000;
const CARD_CACHE_KEY = 'roam:driver:gas-card-id';

interface Props {
  user: { id: string; email?: string; user_metadata?: { name?: string } } | null;
  driverRecord: any;
  /** Last known odometer for this car (from tank status), for "Last fill … · +… km". */
  lastOdometer?: number;
  splitEnabled: boolean;
  /** Verified stations (loaded when logging opens), for "Where did you fuel?". */
  stations?: FuelProximityStation[];
  onDone: () => void;
  onCancel: () => void;
}

function formatKm(n?: number) {
  return n == null ? '' : n.toLocaleString('en-US');
}

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseNumber(v: string): number | undefined {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Photo preview from a file link (never a full-size text copy, FO-02). */
function usePreview(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function FuelPhotoFlow({ user, driverRecord, lastOdometer, splitEnabled, stations, onDone, onCancel }: Props) {
  const { isOnline, addToQueue, processQueue } = useOffline();

  // A draft left by a closed app or a screen kill is offered first (screen 11).
  const [resumable] = useState<FuelPhotoDraft | null>(() => loadFuelPhotoDraft());
  const [showResume, setShowResume] = useState<boolean>(() => !!resumable);
  const [draft, setDraft] = useState<FuelPhotoDraft>(() => resumable ?? newFuelPhotoDraft(crypto.randomUUID(), Date.now()));
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const [odoPhoto, setOdoPhoto] = useState<Blob | null>(null);
  const [pumpPhoto, setPumpPhoto] = useState<Blob | null>(null);
  const odoUrl = usePreview(odoPhoto);
  const pumpUrl = usePreview(pumpPhoto);

  const [kmText, setKmText] = useState(formatKm(draft.odometerKm));
  const [totalText, setTotalText] = useState(draft.total ? formatMoney(draft.total) : '');
  const [litersText, setLitersText] = useState(draft.liters ? String(draft.liters) : '');
  const [cardId, setCardId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(CARD_CACHE_KEY) || undefined;
    } catch {
      return undefined;
    }
  });
  const [saving, setSaving] = useState(false);
  /** Screen 12 — asked once after Save; the fill is already on the waiting list. */
  const [stationAsk, setStationAsk] = useState<{ itemId: string; options: StationOption[] } | null>(null);
  const [stationPick, setStationPick] = useState<string | null>(null);

  /** Put the tapped station on the waiting fill (if it hasn't left yet), then send. */
  const finishStationAsk = (choice: StationOption | 'elsewhere' | null) => {
    if (stationAsk && choice) {
      const item = offlineStorage.getQueue().find((q) => q.id === stationAsk.itemId);
      if (item) {
        const claim = choice === 'elsewhere'
          ? { stationId: null, leftStation: true, minutesAgo: 0 }
          : { stationId: choice.id, stationName: choice.name, leftStation: true, minutesAgo: 0 };
        const payload: any = { ...(item.payload as object) };
        if (payload.transaction) payload.transaction = { ...payload.transaction, metadata: { ...(payload.transaction.metadata || {}), driverClaim: claim } };
        if (payload.fuelEntry) payload.fuelEntry = { ...payload.fuelEntry, metadata: { ...(payload.fuelEntry.metadata || {}), driverClaim: claim } };
        offlineStorage.updateAction(item.id, { payload } as never);
      }
    }
    setStationAsk(null);
    void processQueue(false);
    onDone();
  };

  /** Change the draft and keep it on the phone at once. */
  const update = (patch: Partial<FuelPhotoDraft>) => {
    setDraft((prev) => saveFuelPhotoDraft({ ...prev, ...patch }));
  };

  // Photos of a resumed draft come back from the file database.
  useEffect(() => {
    let live = true;
    (async () => {
      if (draft.hasOdometerPhoto) {
        const b = await getDraftPhoto(draft.captureId, 'odometer');
        if (live) setOdoPhoto(b);
      }
      if (draft.hasPumpPhoto) {
        const b = await getDraftPhoto(draft.captureId, 'pump');
        if (live) setPumpPhoto(b);
      }
      if (resumable) reportFuelStep('resume', 'draft resumed after the flow closed', { step: resumable.step });
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A photo taken just before Android closed the app (camera process death).
  useEffect(() => {
    void consumeRestoredPhoto('fuel').then((file) => {
      if (!file) return;
      const d = draftRef.current;
      void attachPhoto(d.hasOdometerPhoto ? 'pump' : 'odometer', file);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FO-03: location starts now, has a limit, never blocks.
  useEffect(() => {
    if (draft.location) return;
    let live = true;
    withTimeout(readDriverGeolocationFix(), GPS_LIMIT_MS, 'Location')
      .then((fix) => {
        if (!live) return;
        if (fix.lat != null && fix.lng != null) {
          const fixAt = new Date(fix.timestamp ?? Date.now()).toISOString();
          update({
            location: {
              lat: fix.lat,
              lng: fix.lng,
              accuracy: fix.accuracy ?? 0,
              timestamp: fixAt,
              fixAt,
              ...(fix.mock !== undefined ? { mock: fix.mock } : {}),
            },
            locationMissingReason: undefined,
          });
        } else {
          update({ locationMissingReason: fix.error || 'No location' });
        }
      })
      .catch((e) => {
        if (!live) return;
        update({ locationMissingReason: 'Location took too long' });
        reportFuelStep('gps', e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FO-12: know the Gas Card when we can, never wait for it.
  useEffect(() => {
    if (!isOnline) return;
    let live = true;
    withTimeout(fuelService.getFuelCards(), CARD_LIMIT_MS, 'Gas card')
      .then((cards) => {
        if (!live) return;
        const { driverId } = resolveCanonicalDriverIdentity(driverRecord, {
          id: user?.id,
          name: user?.user_metadata?.name,
          email: user?.email,
        });
        const card = findActiveFuelCardForSession(cards, {
          vehicleId: resolveVehicleIdForDriver(driverRecord, [], user?.id),
          driverId: driverId || user?.id,
          driverIds: [...collectDriverAliasIds(driverRecord || { id: user?.id }), user?.id],
        });
        if (card?.id) {
          setCardId(card.id);
          try {
            localStorage.setItem(CARD_CACHE_KEY, card.id);
          } catch {
            /* ignore */
          }
        }
      })
      .catch((e) => reportFuelStep('gas_card_lookup', e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  /** Store the photo first, then try a quick background reading. */
  const attachPhoto = async (kind: 'odometer' | 'pump', file: Blob) => {
    const d = draftRef.current;
    try {
      await putDraftPhoto(d.captureId, kind, file);
    } catch (e) {
      reportFuelStep('camera', 'photo could not be stored', { error: e instanceof Error ? e.message : String(e) });
      toast.error("Couldn't keep that photo. Take it again.");
      return;
    }
    if (kind === 'odometer') {
      setOdoPhoto(file);
      update({ hasOdometerPhoto: true });
      void readOdometer(file);
    } else {
      setPumpPhoto(file);
      update({ hasPumpPhoto: true });
      void readPump(file);
    }
  };

  const readOdometer = async (file: Blob) => {
    try {
      const res: any = await withTimeout(
        api.scanOdometerWithAI(file instanceof File ? file : new File([file], 'odometer.jpg', { type: 'image/jpeg' })),
        READ_LIMIT_MS,
        'Odometer reading',
      );
      const reading = Number(res?.data?.reading);
      if (Number.isFinite(reading) && reading > 0 && draftRef.current.odometerSource !== 'typed') {
        setKmText(formatKm(reading));
        update({ odometerKm: reading, odometerSource: 'photo' });
      }
    } catch (e) {
      if (isOnline) reportFuelStep('odometer_read', e instanceof Error ? e.message : String(e));
    }
  };

  const readPump = async (file: Blob) => {
    try {
      const res = await withTimeout(
        api.processFuelReceipt(file instanceof File ? file : new File([file], 'pump.jpg', { type: 'image/jpeg' })),
        READ_LIMIT_MS,
        'Pump reading',
      );
      const d = draftRef.current;
      if (d.totalSource === 'typed') return;
      const patch: Partial<FuelPhotoDraft> = {};
      if (res.amount && res.amount > 0) {
        patch.total = res.amount;
        setTotalText(formatMoney(res.amount));
      }
      if (res.liters && res.liters > 0) {
        patch.liters = res.liters;
        setLitersText(String(res.liters));
      }
      if (Object.keys(patch).length) update({ ...patch, totalSource: 'photo' });
    } catch (e) {
      if (isOnline) reportFuelStep('pump_read', e instanceof Error ? e.message : String(e));
    }
  };

  const takePhoto = async (kind: 'odometer' | 'pump') => {
    const file = await captureNativePhoto('fuel', { maxSize: PHOTO_MAX_SIZE });
    if (file) await attachPhoto(kind, file);
  };

  const cancelFill = async () => {
    await cancelFuelPhotoDraft(draftRef.current.captureId);
    onCancel();
  };

  const startFresh = async () => {
    await cancelFuelPhotoDraft(draftRef.current.captureId);
    const fresh = newFuelPhotoDraft(crypto.randomUUID(), Date.now());
    setDraft(saveFuelPhotoDraft(fresh));
    setOdoPhoto(null);
    setPumpPhoto(null);
    setKmText('');
    setTotalText('');
    setLitersText('');
    setShowResume(false);
  };

  const choosePayment = (payment: FuelPhotoPayment) =>
    update({
      payment,
      ...(payment === 'gas_card_and_cash' && !draft.splitCardEntryId ? { splitCardEntryId: crypto.randomUUID() } : {}),
    });

  const goNextFromPay = () => {
    if (!draft.payment) return;
    update({ step: draft.payment === 'gas_card' ? 'gascard' : 'pump' });
  };

  const save = async () => {
    if (saving || !canSave(draft)) return;
    setSaving(true);
    try {
      const { driverId, driverName } = resolveCanonicalDriverIdentity(driverRecord, {
        id: user?.id,
        name: user?.user_metadata?.name,
        email: user?.email,
      });
      const vehicleId = resolveVehicleIdForDriver(driverRecord, [], user?.id) || driverRecord?.assignedVehicleId || undefined;
      // Screen 12: inside a station = that station; outside with stations nearby = ask once, after Save.
      const question = stationQuestion(draft.location, stations || [], calculateDistance);
      const finalDraft: FuelPhotoDraft = question.inside
        ? { ...draft, stationClaim: { stationId: question.inside.id, stationName: question.inside.name, fromGps: true } }
        : draft;
      const action = buildFuelPhotoQueueAction(finalDraft, {
        driverId: driverId || user?.id || '',
        driverName,
        vehicleId,
        vehiclePlate: driverRecord?.assignedVehiclePlate || vehicleId,
        cardId: draft.payment === 'gas_card' ? cardId : undefined,
      });
      const created = addToQueue(action);
      releaseFuelPhotoDraft();
      toast.success('Saved on this phone');
      if (question.options.length) {
        setStationAsk({ itemId: created.id, options: question.options });
        return;
      }
      void processQueue(false);
      onDone();
    } catch (e) {
      reportFuelStep('save', e instanceof Error ? e.message : String(e));
      toast.error("Couldn't save. Your photos are still here — tap Save again.");
    } finally {
      setSaving(false);
    }
  };

  const plate = driverRecord?.assignedVehiclePlate || resolveVehicleIdForDriver(driverRecord, [], user?.id) || '';
  const carName = driverRecord?.assignedVehicleName || '';
  const kmDelta = useMemo(() => {
    const km = parseNumber(kmText);
    return km && lastOdometer && lastOdometer > 0 ? km - lastOdometer : undefined;
  }, [kmText, lastOdometer]);
  const price = pricePerLitre(parseNumber(totalText), parseNumber(litersText));

  // ---------------------------------------------------------------- screens

  const header = (title: string, step?: string) => (
    <div className="mb-4">
      <h2 className="text-[22px] font-bold leading-tight text-slate-900 dark:text-slate-50">{title}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {step ? <span className="text-sm text-slate-500 dark:text-slate-400">{step}</span> : null}
        {plate ? (
          <span className="whitespace-nowrap rounded-lg bg-slate-200/70 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {carName ? `${carName} · ` : ''}{plate}
          </span>
        ) : null}
      </div>
    </div>
  );

  const signalPill = !isOnline ? (
    <div className="mb-4 flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <CloudOff className="h-4 w-4" /> No signal — saving on this phone
    </div>
  ) : null;

  const cancelButton = (
    <button
      type="button"
      onClick={() => void cancelFill()}
      className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-white text-base font-semibold text-red-600 dark:border-red-800 dark:bg-transparent dark:text-red-400"
    >
      <X className="h-4 w-4" /> Cancel this fill
    </button>
  );

  const primary = (label: string, onClick: () => void, enabled: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className="mt-6 flex h-[52px] w-full items-center justify-center rounded-xl bg-emerald-600 text-base font-bold text-white disabled:opacity-50"
    >
      {label}
    </button>
  );

  const photoButton = (kind: 'odometer' | 'pump', helper: string) => (
    <button
      type="button"
      onClick={() => void takePhoto(kind)}
      className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-600 bg-white px-4 py-10 text-center dark:bg-slate-900"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <Camera className="h-7 w-7" />
      </span>
      <span className="text-base font-semibold text-slate-900 dark:text-slate-50">Take a photo</span>
      <span className="text-sm text-slate-500 dark:text-slate-400">{helper}</span>
    </button>
  );

  const photoTile = (url: string | null, kind: 'odometer' | 'pump', alt: string) => (
    <div className="relative overflow-hidden rounded-xl bg-slate-900">
      {url ? <img src={url} alt={alt} className="h-40 w-full object-cover" /> : <div className="h-40 w-full" />}
      <button
        type="button"
        onClick={() => void takePhoto(kind)}
        className="absolute bottom-2 right-2 flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
      >
        <RotateCcw className="h-4 w-4" /> Retake
      </button>
    </div>
  );

  const numberBox = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    unit: string,
    readFromPhoto: boolean,
    optional = true,
  ) => (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-200">
        {label}
        {optional ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Optional</span> : null}
      </span>
      <span className="flex h-[52px] items-center rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-lg font-semibold tabular-nums text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 dark:text-slate-50"
        />
        {readFromPhoto && value ? (
          <span className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Check className="h-4 w-4" />
          </span>
        ) : null}
        <span className="ml-2 text-sm text-slate-500">{unit}</span>
      </span>
    </label>
  );

  // Screen 12 — where did you fuel? (after Save; optional)
  if (stationAsk) {
    const picked = stationAsk.options.find((o) => o.id === stationPick) || null;
    return (
      <div className="p-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <h2 className="text-[22px] font-bold text-slate-900 dark:text-slate-50">Where did you fuel?</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">One tap helps your fleet. You can skip it.</p>
          <div className="mt-4 space-y-2">
            {stationAsk.options.map((o) => {
              const on = stationPick === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setStationPick(o.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left ${on ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><MapPin className="h-5 w-5" /></span>
                  <span className="flex-1">
                    <span className="block text-base font-semibold text-slate-900 dark:text-slate-50">{o.name}</span>
                    <span className="block text-sm text-slate-500 dark:text-slate-400">{distanceLabel(o.distanceM)}</span>
                  </span>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${on ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
                    {on ? <Check className="h-3.5 w-3.5 text-white" /> : null}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setStationPick('elsewhere')}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left ${stationPick === 'elsewhere' ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
            >
              <span className="flex-1 text-base font-semibold text-slate-900 dark:text-slate-50">Somewhere else</span>
            </button>
          </div>
          {primary('Done', () => finishStationAsk(stationPick === 'elsewhere' ? 'elsewhere' : picked), !!stationPick)}
          <button
            type="button"
            onClick={() => finishStationAsk(null)}
            className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-800 dark:border-slate-700 dark:bg-transparent dark:text-slate-100"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // Screen 11 — pick up where you left off
  if (showResume && resumable) {
    return (
      <div className="p-4">
        {header('Fuel')}
        <div className="rounded-2xl border-l-4 border-emerald-600 bg-white p-4 shadow-sm dark:bg-slate-900">
          <p className="text-[17px] font-semibold text-slate-900 dark:text-slate-50">Finish your fill from {timeOf(resumable.capturedAt)}</p>
          <div className="mt-3 flex items-center gap-3">
            {odoUrl ? <img src={odoUrl} alt="Odometer" className="h-12 w-12 rounded-lg object-cover" /> : null}
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {resumable.odometerKm ? `${formatKm(resumable.odometerKm)} km · ` : ''}
              {resumable.hasOdometerPhoto ? 'Odometer done' : 'Odometer photo next'}
            </p>
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {!resumable.hasOdometerPhoto
              ? 'Next: the odometer photo.'
              : resumable.step === 'gascard'
                ? 'Next: save your Gas Card fill.'
                : resumable.step === 'pump'
                  ? resumable.hasPumpPhoto ? 'Next: check the numbers and save.' : 'Next: the pump photo.'
                  : 'Next: how you paid and the pump photo.'}
          </p>
          {primary('Continue', () => setShowResume(false), true)}
          <button
            type="button"
            onClick={() => void startFresh()}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-300 text-base font-semibold text-red-600"
          >
            <X className="h-4 w-4" /> Cancel this fill
          </button>
        </div>
      </div>
    );
  }

  // Screens 2–4 — odometer
  if (draft.step === 'odometer') {
    const readFromPhoto = draft.odometerSource === 'photo';
    return (
      <div className="p-4">
        {header('Odometer', 'Step 1 of 3')}
        {signalPill}
        {draft.hasOdometerPhoto ? photoTile(odoUrl, 'odometer', 'Odometer') : photoButton('odometer', 'Get the whole odometer in the picture.')}
        <div className="mt-5 space-y-2">
          {numberBox('Kilometres', kmText, (v) => {
            setKmText(v);
            update({ odometerKm: parseNumber(v), odometerSource: v ? 'typed' : undefined });
          }, 'e.g. 200,412', 'km', readFromPhoto)}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {readFromPhoto && kmText
              ? "Read from your photo. Change it if it's wrong."
              : !isOnline && draft.hasOdometerPhoto
                ? "You can leave it blank. We'll read it from the photo when you're back online."
                : "Leave it blank and we'll read it from the photo."}
          </p>
          {lastOdometer && lastOdometer > 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
              <History className="h-5 w-5 text-slate-500" />
              <p className="text-sm text-slate-700 dark:text-slate-200">
                Last fill {formatKm(lastOdometer)} km
                {kmDelta != null ? <span className={kmDelta < 0 ? ' font-semibold text-red-600' : ' font-semibold text-emerald-700'}> · {kmDelta > 0 ? '+' : ''}{formatKm(kmDelta)} km</span> : null}
              </p>
            </div>
          ) : null}
        </div>
        {primary('Next', () => update({ step: 'pay' }), canLeaveOdometerStep(draft))}
        {cancelButton}
      </div>
    );
  }

  // Screen 5 — how did you pay?
  if (draft.step === 'pay') {
    const options: Array<{ id: FuelPhotoPayment; title: string; helper: string; icon: React.ReactNode }> = [
      { id: 'rideshare_cash', title: 'Cash', helper: 'I paid with cash from fares', icon: <Banknote className="h-5 w-5" /> },
      { id: 'gas_card', title: 'Gas Card', helper: 'Company fuel card', icon: <CreditCard className="h-5 w-5" /> },
      ...(splitEnabled
        ? [{ id: 'gas_card_and_cash' as const, title: 'Gas Card + Cash', helper: 'Part on the card, part in cash', icon: <CreditCard className="h-5 w-5" /> }]
        : []),
    ];
    return (
      <div className="p-4">
        {header('How did you pay?', 'Step 2 of 3')}
        {signalPill}
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm dark:bg-slate-900">
          {odoUrl ? <img src={odoUrl} alt="Odometer" className="h-10 w-10 rounded-lg object-cover" /> : null}
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {draft.odometerKm ? `${formatKm(draft.odometerKm)} km` : 'Odometer photo'}
          </span>
          <Check className="ml-auto h-5 w-5 text-emerald-600" />
        </div>
        <div className="space-y-3">
          {options.map((o) => {
            const on = draft.payment === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => choosePayment(o.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left ${on ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{o.icon}</span>
                <span className="flex-1">
                  <span className="block text-base font-semibold text-slate-900 dark:text-slate-50">{o.title}</span>
                  <span className="block text-sm text-slate-500 dark:text-slate-400">{o.helper}</span>
                </span>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${on ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
                  {on ? <span className="h-2.5 w-2.5 rounded-full bg-white" /> : null}
                </span>
              </button>
            );
          })}
        </div>
        {primary('Next', goNextFromPay, !!draft.payment)}
        <button
          type="button"
          onClick={() => update({ step: 'odometer' })}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-800 dark:border-slate-700 dark:bg-transparent dark:text-slate-100"
        >
          Back to the odometer
        </button>
        {cancelButton}
      </div>
    );
  }

  // Screen 13 — Gas Card, ready to save
  if (draft.step === 'gascard') {
    return (
      <div className="p-4">
        {header('Gas Card fill', 'Step 3 of 3')}
        {signalPill}
        <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
          {odoUrl ? <img src={odoUrl} alt="Odometer" className="h-12 w-12 rounded-lg object-cover" /> : null}
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{draft.odometerKm ? `${formatKm(draft.odometerKm)} km` : 'Odometer photo'}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Paid with Gas Card</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">No pump photo needed. The amount comes from the card statement.</p>
        <div className="mt-4">
          {numberBox('Litres', litersText, (v) => {
            setLitersText(v);
            update({ liters: parseNumber(v) });
          }, 'e.g. 23.69', 'L', false)}
        </div>
        {primary(saving ? 'Saving…' : 'Save', () => void save(), canSave(draft) && !saving)}
        <button
          type="button"
          onClick={() => update({ step: 'pay' })}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-800 dark:border-slate-700 dark:bg-transparent dark:text-slate-100"
        >
          Change how I paid
        </button>
        {cancelButton}
      </div>
    );
  }

  // Screens 6–7 / 14 — pump or receipt (Cash, Gas Card + Cash)
  const readFromPhoto = draft.totalSource === 'photo';
  const isSplit = draft.payment === 'gas_card_and_cash';
  return (
    <div className="p-4">
      {header('Pump or receipt', 'Step 3 of 3')}
      {signalPill}
      {draft.hasPumpPhoto ? photoTile(pumpUrl, 'pump', 'Pump or receipt') : photoButton('pump', 'The pump screen or the receipt. Total and litres must show.')}
      <div className="mt-5 grid grid-cols-2 gap-3">
        {numberBox('Total (J$)', totalText, (v) => {
          setTotalText(v);
          update({ total: parseNumber(v), totalSource: 'typed' });
        }, '4,000.00', '', readFromPhoto, !isSplit)}
        {numberBox('Litres', litersText, (v) => {
          setLitersText(v);
          update({ liters: parseNumber(v), totalSource: 'typed' });
        }, '18.70', 'L', readFromPhoto, !isSplit)}
      </div>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {readFromPhoto && (totalText || litersText)
          ? "Read from your photo. Change them if they're wrong."
          : isSplit
            ? 'For Gas Card + Cash we need the pump total and litres. The cash part comes from the card statement.'
            : "Leave them blank and we'll read them from the photo."}
      </p>
      {price ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">J${price.toFixed(2)} a litre</p> : null}
      {primary(saving ? 'Saving…' : 'Save', () => void save(), canSave(draft) && !saving)}
      <button
        type="button"
        onClick={() => update({ step: 'pay' })}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-800 dark:border-slate-700 dark:bg-transparent dark:text-slate-100"
      >
        Change how I paid
      </button>
      {cancelButton}
    </div>
  );
}
