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

  // DSH CR-08: the camera has no time limit on purpose (lining up a photo can take a while), but
  // if the app comes back from the camera and no photo arrives, say so; the button stays live.
  // Only the newest tap may attach a photo, so a late answer from an old tap is ignored.
  const photoSeqRef = useRef(0);
  const takePhoto = async (kind: 'odometer' | 'pump') => {
    const seq = ++photoSeqRef.current;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onBack = () => {
      if (document.visibilityState !== 'visible' || settled) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!settled && seq === photoSeqRef.current) {
          toast.error("The camera didn't send a photo. Tap Take a photo again.");
          reportFuelStep('camera', 'no photo after returning from the camera');
        }
      }, 10_000);
    };
    document.addEventListener('visibilitychange', onBack);
    try {
      const file = await captureNativePhoto('fuel', { maxSize: PHOTO_MAX_SIZE });
      settled = true;
      if (file && seq === photoSeqRef.current) await attachPhoto(kind, file);
    } finally {
      settled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onBack);
    }
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
  // Look: Stitch driver screens (docs/fuel-log-offline-first-audit.md section 9 Keep/Drop).

  const driverName = String(driverRecord?.name || driverRecord?.driverName || user?.user_metadata?.name || '');
  const C = {
    page: 'min-h-full bg-[#f1f5f9] px-4 pb-8 pt-4 dark:bg-[#0b1220]',
    card: 'rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900',
    green: 'bg-[#006948]',
    ink: 'text-[#131b2e] dark:text-slate-50',
    soft: 'text-[#3d4a42] dark:text-slate-400',
    tag: 'rounded-full bg-[#eaedff] px-2 py-0.5 text-[11px] font-semibold tracking-[0.04em] text-[#3d4a42] dark:bg-slate-800 dark:text-slate-300',
  };
  const Icon = ({ name, className = '', fill = false }: { name: string; className?: string; fill?: boolean }) => (
    <span className={`material-symbols-outlined ${className}`} style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined} aria-hidden="true">
      {name}
    </span>
  );

  const header = (title: string, step?: string) => (
    <div className="mb-4 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <h2 className={`text-[22px] font-semibold leading-7 tracking-[-0.015em] ${C.ink}`}>{title}</h2>
        {plate ? (
          <span className="inline-flex shrink-0 items-center rounded-[6px] bg-[#e2e8f0] px-2 py-0.5 text-[11px] font-bold tracking-wider text-[#131b2e] dark:bg-slate-800 dark:text-slate-100">
            {plate}
          </span>
        ) : null}
      </div>
      {step || carName || driverName ? (
        <div className={`flex items-center gap-2 text-[13px] font-medium ${C.soft}`}>
          {step ? <span className="font-semibold text-[#006948] dark:text-emerald-400">{step}</span> : null}
          {step && (carName || driverName) ? <span>•</span> : null}
          <span className="truncate">{[carName, driverName].filter(Boolean).join(' · ')}</span>
        </div>
      ) : null}
    </div>
  );

  const signalPill = !isOnline ? (
    <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#fffbeb] px-3 py-1.5 text-[13px] font-semibold text-[#b45309] dark:bg-amber-950/40 dark:text-amber-300">
      <Icon name="cloud_off" className="text-[18px]" /> No signal — saving on this phone
    </div>
  ) : null;

  const cancelButton = (
    <button
      type="button"
      onClick={() => void cancelFill()}
      className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-semibold text-[#ba1a1a] shadow-sm active:bg-[#ffdad6]/50 dark:bg-slate-900 dark:text-red-400"
    >
      <Icon name="close" className="text-[20px]" /> Cancel this fill
    </button>
  );

  const secondary = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`mt-3 flex h-[52px] w-full items-center justify-center rounded-xl bg-white text-[15px] font-semibold shadow-sm ring-1 ring-[#bccac0] dark:bg-slate-900 ${C.ink}`}
    >
      {label}
    </button>
  );

  const primary = (label: string, onClick: () => void, enabled: boolean, icon = 'arrow_forward') => (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className={`mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl ${C.green} text-[15px] font-semibold text-white shadow-md disabled:bg-[#006948]/40 disabled:shadow-none`}
    >
      {label} {icon ? <Icon name={icon} className="text-[20px]" /> : null}
    </button>
  );

  const photoButton = (kind: 'odometer' | 'pump', helper: string) => (
    <button
      type="button"
      onClick={() => void takePhoto(kind)}
      className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#006948] bg-white px-4 py-10 text-center dark:bg-slate-900"
    >
      <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#85f8c4] text-[#005137]">
        <Icon name="photo_camera" className="text-[34px]" />
      </span>
      <span className={`text-[16px] font-semibold ${C.ink}`}>Take a photo</span>
      <span className={`text-[14px] ${C.soft}`}>{helper}</span>
    </button>
  );

  const photoTile = (url: string | null, kind: 'odometer' | 'pump', alt: string) => (
    <div className="relative h-44 w-full overflow-hidden rounded-xl bg-[#eaedff] shadow-sm dark:bg-slate-800">
      {url ? <img src={url} alt={alt} className="h-full w-full object-cover" /> : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      <button
        type="button"
        onClick={() => void takePhoto(kind)}
        className="absolute bottom-2.5 right-2.5 inline-flex h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-semibold text-[#131b2e] shadow-md active:scale-95"
      >
        <Icon name="sync" className="text-[18px]" /> Retake
      </button>
    </div>
  );

  const tick = (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ecfdf5] text-[#059669]">
      <Icon name="check" className="text-[18px] font-bold" />
    </span>
  );

  /** Small white box (pump screen, two side by side). */
  const numberBox = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    unit: string,
    readFromPhoto: boolean,
    optional = true,
  ) => (
    <label className="flex flex-col justify-between rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`text-[13px] font-medium ${C.soft}`}>{label}</span>
        {optional ? <span className={C.tag}>Optional</span> : null}
      </span>
      <span className="flex items-center gap-2 pt-1">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`min-w-0 flex-1 bg-transparent text-[26px] font-semibold leading-8 tracking-[-0.02em] tabular-nums outline-none placeholder:text-[20px] placeholder:font-normal placeholder:text-slate-400 ${C.ink}`}
        />
        {readFromPhoto && value ? tick : unit ? <span className={`text-[15px] ${C.soft}`}>{unit}</span> : null}
      </span>
    </label>
  );

  /** Wide box inside a white card (odometer, Gas Card litres). */
  const wideBox = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    unit: string,
    readFromPhoto: boolean,
    helper: React.ReactNode,
  ) => (
    <div className={C.card}>
      <label className="block">
        <span className="mb-3 flex items-center justify-between">
          <span className={`text-[16px] font-semibold ${C.ink}`}>{label}</span>
          <span className={C.tag}>Optional</span>
        </span>
        <span className="flex h-[72px] items-center gap-3 rounded-xl bg-[#f2f3ff] px-5 shadow-inner dark:bg-slate-800">
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`min-w-0 flex-1 bg-transparent text-[30px] font-bold leading-9 tracking-[-0.02em] tabular-nums outline-none placeholder:text-[22px] placeholder:font-medium placeholder:text-slate-400 ${C.ink}`}
          />
          {readFromPhoto && value ? tick : null}
          <span className={`text-[16px] ${C.soft}`}>{unit}</span>
        </span>
      </label>
      {helper}
    </div>
  );

  const helperLine = (text: string, icon = 'auto_fix_high') => (
    <p className={`mt-3 flex items-start gap-1.5 text-[14px] leading-5 ${C.soft}`}>
      <Icon name={icon} className="mt-0.5 shrink-0 text-[18px] text-[#006948]" /> {text}
    </p>
  );

  const odometerSummary = (sub: string) => (
    <div className={`${C.card} mb-4`}>
      <div className="flex items-center gap-4">
        {odoUrl ? (
          <img src={odoUrl} alt="Odometer" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#eaedff] text-[#3d4a42]">
            <Icon name="speed" className="text-[26px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-[26px] font-semibold leading-8 tracking-[-0.02em] tabular-nums ${C.ink}`}>
            {draft.odometerKm ? (
              <>
                {formatKm(draft.odometerKm)} <span className={`text-[15px] font-normal ${C.soft}`}>km</span>
              </>
            ) : (
              <span className="text-[18px]">Odometer photo</span>
            )}
          </p>
          <p className={`text-[14px] ${C.soft}`}>{sub}</p>
        </div>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ecfdf5] text-[#059669]">
          <Icon name="check" className="text-[18px]" />
        </span>
      </div>
    </div>
  );

  // Screen 12 — where did you fuel? (after Save; optional)
  if (stationAsk) {
    const picked = stationAsk.options.find((o) => o.id === stationPick) || null;
    const row = (on: boolean) =>
      `flex min-h-[64px] w-full items-center gap-3 rounded-xl p-4 text-left shadow-sm ${on ? 'bg-[#ecfdf5] ring-2 ring-[#006948] dark:bg-emerald-950/30' : 'bg-white dark:bg-slate-900'}`;
    const dot = (on: boolean) => (
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-[#006948] bg-[#006948]' : 'border-[#bccac0]'}`}>
        {on ? <Icon name="check" className="text-[16px] text-white" /> : null}
      </span>
    );
    return (
      <div className={C.page}>
        <div className="mb-4">
          <h2 className={`text-[22px] font-semibold leading-7 tracking-[-0.015em] ${C.ink}`}>Where did you fuel?</h2>
          <p className={`mt-1 text-[14px] ${C.soft}`}>One tap helps your fleet. You can skip it.</p>
        </div>
        <div className="space-y-3">
          {stationAsk.options.map((o) => {
            const on = stationPick === o.id;
            return (
              <button key={o.id} type="button" onClick={() => setStationPick(o.id)} className={row(on)}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eaedff] text-[#006948] dark:bg-slate-800">
                  <Icon name="local_gas_station" className="text-[22px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[16px] font-semibold ${C.ink}`}>{o.name}</span>
                  {distanceLabel(o.distanceM) ? <span className={`block text-[13px] ${C.soft}`}>{distanceLabel(o.distanceM)}</span> : null}
                </span>
                {dot(on)}
              </button>
            );
          })}
          <button type="button" onClick={() => setStationPick('elsewhere')} className={row(stationPick === 'elsewhere')}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eaedff] text-[#3d4a42] dark:bg-slate-800">
              <Icon name="search" className="text-[22px]" />
            </span>
            <span className={`flex-1 text-[16px] font-semibold ${C.ink}`}>Somewhere else</span>
            {dot(stationPick === 'elsewhere')}
          </button>
        </div>
        {primary('Done', () => finishStationAsk(stationPick === 'elsewhere' ? 'elsewhere' : picked), !!stationPick, 'check_circle')}
        {secondary('Skip', () => finishStationAsk(null))}
      </div>
    );
  }

  // Screen 11 — pick up where you left off
  if (showResume && resumable) {
    return (
      <div className={C.page}>
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[#f2f3ff] p-3 dark:bg-slate-900">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#3d4a42] dark:bg-slate-800">
            <Icon name="directions_car" className="text-[22px]" />
          </span>
          <div className="min-w-0 flex-1">
            {driverName ? <p className={`truncate text-[15px] font-medium ${C.ink}`}>{driverName}</p> : null}
            {carName ? <p className={`truncate text-[14px] ${C.soft}`}>{carName}</p> : null}
          </div>
          {plate ? <span className="rounded-[6px] bg-[#dae2fd] px-2.5 py-1 text-[13px] font-bold tracking-wider text-[#131b2e]">{plate}</span> : null}
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-md dark:bg-slate-900">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-[#006948]" />
          <p className={`text-[22px] font-semibold leading-7 tracking-[-0.015em] ${C.ink}`}>Finish your fill from {timeOf(resumable.capturedAt)}</p>
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-[#f2f3ff] p-3 dark:bg-slate-800">
            {odoUrl ? (
              <img src={odoUrl} alt="Odometer" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white text-[#3d4a42]">
                <Icon name="speed" className="text-[24px]" />
              </span>
            )}
            <div>
              {resumable.odometerKm ? (
                <p className={`flex items-center gap-1.5 text-[20px] font-semibold tabular-nums ${C.ink}`}>
                  {formatKm(resumable.odometerKm)} km
                  {resumable.hasOdometerPhoto ? <Icon name="check_circle" className="text-[20px] text-[#006948]" /> : null}
                </p>
              ) : null}
              <p className="text-[15px] font-medium text-[#006948] dark:text-emerald-400">
                {resumable.hasOdometerPhoto ? 'Odometer done' : 'Odometer photo next'}
              </p>
            </div>
          </div>
          <p className={`mt-3 flex items-center gap-2 text-[15px] ${C.soft}`}>
            <Icon name="arrow_circle_right" className="text-[20px] text-[#984300]" />
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
            className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ffdad6] text-[15px] font-semibold text-[#ba1a1a]"
          >
            <Icon name="close" className="text-[20px]" /> Cancel this fill
          </button>
        </div>
      </div>
    );
  }

  // Screens 2–4 — odometer
  if (draft.step === 'odometer') {
    const readFromPhoto = draft.odometerSource === 'photo';
    return (
      <div className={C.page}>
        {header('Odometer', 'Step 1 of 3')}
        {signalPill}
        {draft.hasOdometerPhoto ? photoTile(odoUrl, 'odometer', 'Odometer') : photoButton('odometer', 'Get the whole odometer in the picture.')}
        <div className="mt-4">
          {wideBox(
            'Kilometres',
            kmText,
            (v) => {
              setKmText(v);
              update({ odometerKm: parseNumber(v), odometerSource: v ? 'typed' : undefined });
            },
            'e.g. 200,412',
            'km',
            readFromPhoto,
            <>
              {helperLine(
                readFromPhoto && kmText
                  ? "Read from your photo. Change it if it's wrong."
                  : !isOnline && draft.hasOdometerPhoto
                    ? "You can leave it blank. We'll read it from the photo when you're back online."
                    : "Leave it blank and we'll read it from the photo.",
                readFromPhoto && kmText ? 'auto_fix_high' : 'info',
              )}
              {lastOdometer && lastOdometer > 0 ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#f2f3ff] p-4 dark:bg-slate-800/60">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eaedff] text-[#3d4a42] dark:bg-slate-700">
                    <Icon name="history" className="text-[22px]" />
                  </span>
                  <div className="flex-1">
                    <p className={`text-[13px] font-medium ${C.soft}`}>Last fill</p>
                    <p className={`text-[16px] font-semibold tabular-nums ${C.ink}`}>{formatKm(lastOdometer)} km</p>
                  </div>
                  {kmDelta != null ? (
                    <span className={`text-[16px] font-semibold tabular-nums ${kmDelta < 0 ? 'text-[#ba1a1a]' : 'text-[#006948]'}`}>
                      {kmDelta > 0 ? '+' : ''}
                      {formatKm(kmDelta)} km
                    </span>
                  ) : null}
                </div>
              ) : null}
            </>,
          )}
        </div>
        {primary('Next', () => update({ step: 'pay' }), canLeaveOdometerStep(draft))}
        {cancelButton}
      </div>
    );
  }

  // Screen 5 — how did you pay? (not made in Stitch; built in the same style)
  if (draft.step === 'pay') {
    const options: Array<{ id: FuelPhotoPayment; title: string; helper: string; icon: string }> = [
      { id: 'rideshare_cash', title: 'Cash', helper: 'I paid with cash from fares', icon: 'payments' },
      { id: 'gas_card', title: 'Gas Card', helper: 'Company fuel card', icon: 'credit_card' },
      ...(splitEnabled
        ? [{ id: 'gas_card_and_cash' as const, title: 'Gas Card + Cash', helper: 'Part on the card, part in cash', icon: 'call_split' }]
        : []),
    ];
    return (
      <div className={C.page}>
        {header('How did you pay?', 'Step 2 of 3')}
        {signalPill}
        {odometerSummary('Odometer done')}
        <div className="space-y-3">
          {options.map((o) => {
            const on = draft.payment === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => choosePayment(o.id)}
                className={`flex min-h-[72px] w-full items-center gap-4 rounded-xl p-4 text-left shadow-sm ${on ? 'bg-[#ecfdf5] ring-2 ring-[#006948] dark:bg-emerald-950/30' : 'bg-white dark:bg-slate-900'}`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-[#85f8c4] text-[#005137]' : 'bg-[#eaedff] text-[#3d4a42] dark:bg-slate-800 dark:text-slate-200'}`}>
                  <Icon name={o.icon} className="text-[22px]" />
                </span>
                <span className="flex-1">
                  <span className={`block text-[16px] font-semibold ${C.ink}`}>{o.title}</span>
                  <span className={`block text-[14px] ${C.soft}`}>{o.helper}</span>
                </span>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-[#006948]' : 'border-[#bccac0]'}`}>
                  {on ? <span className="h-3 w-3 rounded-full bg-[#006948]" /> : null}
                </span>
              </button>
            );
          })}
        </div>
        {primary('Next', goNextFromPay, !!draft.payment)}
        {secondary('Back to the odometer', () => update({ step: 'odometer' }))}
        {cancelButton}
      </div>
    );
  }

  // Screen 13 — Gas Card, ready to save
  if (draft.step === 'gascard') {
    return (
      <div className={C.page}>
        {header('Gas Card fill', 'Step 3 of 3')}
        {signalPill}
        <div className={`${C.card} mb-4`}>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eaedff] text-[#3d4a42]">
              {odoUrl ? <img src={odoUrl} alt="Odometer" className="h-full w-full object-cover" /> : <Icon name="speed" className="text-[26px]" />}
            </span>
            <div>
              <p className={`text-[30px] font-bold leading-9 tracking-[-0.02em] tabular-nums ${C.ink}`}>
                {draft.odometerKm ? (
                  <>
                    {formatKm(draft.odometerKm)} <span className={`text-[15px] font-normal ${C.soft}`}>km</span>
                  </>
                ) : (
                  <span className="text-[18px] font-semibold">Odometer photo</span>
                )}
              </p>
              {carName ? <p className={`text-[14px] ${C.soft}`}>{carName} odometer</p> : null}
            </div>
          </div>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#dce1ff] px-3 py-1.5 text-[14px] font-medium text-[#001551]">
            <Icon name="credit_card" className="text-[18px]" /> Paid with Gas Card
          </span>
        </div>
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-[#f2f3ff] p-4 dark:bg-slate-900/60">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dce1ff] text-[#1d4ed8]">
            <Icon name="receipt_long" className="text-[20px]" />
          </span>
          <div>
            <p className={`text-[15px] font-semibold ${C.ink}`}>No pump photo needed</p>
            <p className={`text-[14px] ${C.soft}`}>The amount comes from the card statement.</p>
          </div>
        </div>
        {wideBox(
          'Litres',
          litersText,
          (v) => {
            setLitersText(v);
            update({ liters: parseNumber(v) });
          },
          'e.g. 23.69',
          'L',
          false,
          null,
        )}
        {primary(saving ? 'Saving…' : 'Save', () => void save(), canSave(draft) && !saving, 'check_circle')}
        {secondary('Change how I paid', () => update({ step: 'pay' }))}
        {cancelButton}
      </div>
    );
  }

  // Screens 6–7 / 14 — pump or receipt (Cash, Gas Card + Cash)
  const readFromPhoto = draft.totalSource === 'photo';
  const isSplit = draft.payment === 'gas_card_and_cash';
  return (
    <div className={C.page}>
      {header('Pump or receipt', 'Step 3 of 3')}
      {signalPill}
      {draft.hasPumpPhoto ? photoTile(pumpUrl, 'pump', 'Pump or receipt') : photoButton('pump', 'The pump screen or the receipt. Total and litres must show.')}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {numberBox('Total (J$)', totalText, (v) => {
          setTotalText(v);
          update({ total: parseNumber(v), totalSource: 'typed' });
        }, '4,000.00', '', readFromPhoto, !isSplit)}
        {numberBox('Litres', litersText, (v) => {
          setLitersText(v);
          update({ liters: parseNumber(v), totalSource: 'typed' });
        }, '18.70', 'L', readFromPhoto, !isSplit)}
      </div>
      {helperLine(
        readFromPhoto && (totalText || litersText)
          ? "Read from your photo. Change them if they're wrong."
          : isSplit
            ? 'For Gas Card + Cash we need the pump total and litres.'
            : "Leave them blank and we'll read them from the photo.",
        readFromPhoto && (totalText || litersText) ? 'auto_fix_high' : 'info',
      )}
      {isSplit ? (
        <div className="mt-3 flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ffdbca] text-[#984300]">
            <Icon name="payments" className="text-[20px]" />
          </span>
          <div>
            <p className={`text-[15px] font-semibold ${C.ink}`}>Cash part</p>
            <p className={`text-[14px] ${C.soft}`}>Worked out from the card statement. You don't type it.</p>
          </div>
        </div>
      ) : null}
      {price ? (
        <div className={`mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#f2f3ff] px-3 py-2 text-[16px] font-semibold tabular-nums dark:bg-slate-900 ${C.soft}`}>
          <Icon name="local_gas_station" className="text-[18px]" /> J${formatMoney(price)} a litre
        </div>
      ) : null}
      {primary(saving ? 'Saving…' : 'Save', () => void save(), canSave(draft) && !saving, 'check_circle')}
      {secondary('Change how I paid', () => update({ step: 'pay' }))}
      {cancelButton}
    </div>
  );
}
