import { useRef, useState } from 'react';

export interface ScanResult {
  reading: number;
  photo: File | null;
  method: 'ai_verified' | 'manual_override' | 'photo_review';
  confidence?: string;
  manualReason?: string;
}

type ScanPhoto = (file: File, signal: AbortSignal) => Promise<{ reading: number | null; confidence?: string }>;

/**
 * Shared odometer camera. The scan call is passed in so Plug, Fleet, and Driver
 * do not share a login. A drop or a jump over 1,500 km must be confirmed.
 */
export function OdometerScanner({
  lastOdometer = 0,
  onScanComplete,
  onCancel,
  scanPhoto,
  isFleetDriver = true,
}: {
  lastOdometer?: number;
  onScanComplete: (result: ScanResult) => void;
  onCancel: () => void;
  scanPhoto?: ScanPhoto;
  isFleetDriver?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedJump, setConfirmedJump] = useState(false);

  const value = Number(reading);
  const dropped = lastOdometer > 0 && value > 0 && value < lastOdometer;
  const jumped = lastOdometer > 0 && value > lastOdometer + 1500;
  const needsConfirm = dropped || jumped;

  const onFile = (file: File) => {
    setPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
    if (!scanPhoto) return;
    const controller = new AbortController();
    setBusy(true);
    setError(null);
    void scanPhoto(file, controller.signal)
      .then((result) => {
        if (result.reading != null) setReading(String(result.reading));
        else setError('Could not read the odometer. Type it instead.');
      })
      .catch(() => setError('Could not read the odometer. Type it instead.'))
      .finally(() => setBusy(false));
  };

  const finish = () => {
    if (!(value > 0)) {
      setError('Enter the odometer reading.');
      return;
    }
    if (needsConfirm && !confirmedJump) {
      setConfirmedJump(true);
      setError(dropped ? 'That reading is lower than the last one. Confirm to continue.' : 'That reading jumped more than 1,500 km. Confirm to continue.');
      return;
    }
    onScanComplete({
      reading: value,
      photo,
      method: photo && scanPhoto ? 'ai_verified' : photo ? 'photo_review' : 'manual_override',
      manualReason: needsConfirm ? (dropped ? 'reading dropped' : 'jump over 1500 km') : undefined,
    });
  };

  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onFile(file);
      }} />
      <button type="button" className="tap w-full rounded-xl border border-primary px-4 text-primary" onClick={() => inputRef.current?.click()}>
        {photo ? 'Retake photo' : 'Take a photo'}
      </button>
      {preview ? <img src={preview} alt="Odometer" className="h-40 w-full rounded-xl object-contain ring-1 ring-line" /> : null}
      {busy ? <p role="status" className="text-sm">Reading the photo…</p> : null}
      <input
        className="tap w-full rounded-xl border border-line px-3"
        inputMode="decimal"
        aria-label="Odometer"
        placeholder="Kilometres"
        value={reading}
        onChange={(event) => { setReading(event.target.value); setConfirmedJump(false); }}
      />
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
      {photo && !scanPhoto ? (
        <p className="text-sm">{isFleetDriver ? 'The photo stays with this fill. Type the kilometres shown.' : 'The photo stays with this fill.'}</p>
      ) : null}
      <button type="button" className="tap w-full rounded-xl bg-primary px-4 font-bold text-white" onClick={finish}>
        {needsConfirm && confirmedJump ? 'Confirm reading' : 'Use this reading'}
      </button>
      <button type="button" className="tap w-full text-sm text-neutral" onClick={onCancel}>Cancel</button>
    </div>
  );
}
