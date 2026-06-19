import React, { useRef, useState } from 'react';
import { ArrowRight, Badge, Car, Loader2, Shield } from 'lucide-react';
import { HaulOnboardingHeader } from '../../onboarding/HaulOnboardingHeader';
import { haulErrorBox, haulPrimaryBtn, haulSecondaryBtn } from '../haulAuthUi';
import {
  readDocumentsDraft,
  writeDocumentsDraft,
  type DocumentSlotKey,
} from '../../../lib/haulDocumentsDraft';

export type DocumentsFormData = {
  uploads: Partial<Record<DocumentSlotKey, File>>;
  previews: Partial<Record<DocumentSlotKey, string>>;
  consent: boolean;
};

type SlotConfig = {
  key: DocumentSlotKey;
  label: string;
  sublabel: string;
  variant: 'card' | 'file';
};

const LICENSE_SLOTS: SlotConfig[] = [
  { key: 'license_front', label: 'Front Side', sublabel: 'Tap to upload', variant: 'card' },
  { key: 'license_back', label: 'Back Side', sublabel: 'Tap to upload', variant: 'card' },
];

type Props = {
  onBack?: () => void;
  onSaveDraft: (data: DocumentsFormData) => void;
  onContinue: (data: DocumentsFormData) => Promise<void>;
};

function loadInitial(): DocumentsFormData {
  const draft = readDocumentsDraft();
  return { uploads: {}, previews: {}, consent: draft.consent };
}

export function HaulDocumentsUploadScreen({ onBack, onSaveDraft, onContinue }: Props) {
  const [form, setForm] = useState<DocumentsFormData>(loadInitial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRefs = useRef<Partial<Record<DocumentSlotKey, HTMLInputElement | null>>>({});

  const setSlot = (key: DocumentSlotKey, file: File) => {
    const preview = URL.createObjectURL(file);
    setForm((prev) => ({
      ...prev,
      uploads: { ...prev.uploads, [key]: file },
      previews: { ...prev.previews, [key]: preview },
    }));
  };

  const requiredKeys: DocumentSlotKey[] = [
    'license_front',
    'license_back',
    'vehicle_registration',
    'insurance_certificate',
  ];
  const canContinue =
    form.consent && requiredKeys.every((k) => Boolean(form.uploads[k]));

  const handlePick = (key: DocumentSlotKey) => fileRefs.current[key]?.click();

  const handleSaveDraft = () => {
    writeDocumentsDraft({
      consent: form.consent,
      uploaded: Object.fromEntries(requiredKeys.map((k) => [k, Boolean(form.uploads[k])])),
    });
    onSaveDraft(form);
  };

  const handleContinue = async () => {
    if (!canContinue) return;
    setLoading(true);
    setError(null);
    try {
      await onContinue(form);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save documents.');
    } finally {
      setLoading(false);
    }
  };

  const renderCardSlot = (slot: SlotConfig) => {
    const preview = form.previews[slot.key];
    const hasFile = Boolean(form.uploads[slot.key]);

    if (preview) {
      return (
        <div
          key={slot.key}
          className="relative flex aspect-[1.6/1] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-[#534434] bg-[#060e20]"
        >
          {hasFile ? (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full border border-[#534434] bg-[#171f33]/90 px-2 py-1 backdrop-blur-sm">
              <span className="material-symbols-outlined text-base text-[#ffc174]">pending</span>
              <span className="text-xs text-[#d8c3ad]">Pending</span>
            </div>
          ) : null}
          <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60 mix-blend-luminosity" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326]/80 to-transparent" />
          <button
            type="button"
            onClick={() => handlePick(slot.key)}
            className="relative z-10 mt-auto mb-4 text-sm font-medium text-[#dae2fd]"
          >
            {slot.label}
          </button>
          <input
            ref={(el) => {
              fileRefs.current[slot.key] = el;
            }}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setSlot(slot.key, file);
            }}
          />
        </div>
      );
    }

    return (
      <button
        key={slot.key}
        type="button"
        onClick={() => handlePick(slot.key)}
        className="group relative flex aspect-[1.6/1] w-full flex-col items-center justify-center rounded-lg border border-dashed border-[#a08e7a] bg-[#131b2e] transition-colors hover:border-[#ffc174] active:scale-[0.98]"
      >
        <div className="absolute inset-0 rounded-lg bg-[#ffc174]/5 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="material-symbols-outlined mb-2 text-4xl text-[#a08e7a] transition-colors group-hover:text-[#ffc174]">
          add_a_photo
        </span>
        <span className="text-sm font-medium text-[#d8c3ad] transition-colors group-hover:text-[#ffc174]">
          {slot.label}
        </span>
        <span className="mt-1 text-sm text-[#ffc174]">{slot.sublabel}</span>
        <input
          ref={(el) => {
            fileRefs.current[slot.key] = el;
          }}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setSlot(slot.key, file);
          }}
        />
      </button>
    );
  };

  const renderFileSlot = (key: DocumentSlotKey, title: string, icon: React.ReactNode) => (
    <section key={key} className="rounded-xl border border-[#534434] bg-[#171f33] p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[#ffc174]">{icon}</span>
        <h2 className="text-lg font-semibold text-[#dae2fd]">{title}</h2>
      </div>
      <button
        type="button"
        onClick={() => handlePick(key)}
        className="group flex min-h-[120px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-[#a08e7a] bg-[#131b2e] transition-colors hover:border-[#ffc174] active:scale-[0.99]"
      >
        {form.previews[key] ? (
          <img src={form.previews[key]} alt="" className="mb-2 h-16 w-auto rounded object-contain" />
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#534434] bg-[#171f33] transition-colors group-hover:border-[#ffc174]">
              <span className="material-symbols-outlined text-[#a08e7a] group-hover:text-[#ffc174]">description</span>
            </div>
            <div className="text-left">
              <span className="block text-sm font-medium text-[#d8c3ad]">Upload Document</span>
              <span className="text-sm text-[#ffc174]">Tap to select file</span>
            </div>
          </div>
        )}
        <input
          ref={(el) => {
            fileRefs.current[key] = el;
          }}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setSlot(key, file);
          }}
        />
      </button>
    </section>
  );

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326] text-[#dae2fd] antialiased">
      <HaulOnboardingHeader onBack={onBack} />

      <main className="mx-auto w-full max-w-[800px] flex-1 px-4 pt-20 pb-32 md:px-12">
        <div className="mb-8">
          <p className="mb-2 text-sm font-medium tracking-widest text-[#ffc174] uppercase">Step 3 of 4</p>
          <h1 className="mb-1 text-[28px] leading-9 font-bold md:text-[32px]">Upload Documents</h1>
          <p className="text-base text-[#d8c3ad]">
            We need a few documents to verify your identity and vehicle. Clear, readable photos ensure
            faster approval.
          </p>
        </div>

        {error ? <div className={`${haulErrorBox} mb-6`}>{error}</div> : null}

        <div className="space-y-6">
          <section className="rounded-xl border border-[#534434] bg-[#171f33] p-4">
            <div className="mb-4 flex items-center gap-2">
              <Badge className="h-5 w-5 text-[#ffc174]" />
              <h2 className="text-lg font-semibold">Driver&apos;s License</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {LICENSE_SLOTS.map(renderCardSlot)}
            </div>
          </section>

          {renderFileSlot('vehicle_registration', 'Vehicle Registration', <Car className="h-5 w-5" />)}
          {renderFileSlot('insurance_certificate', 'Insurance Certificate', <Shield className="h-5 w-5" />)}

          <div className="rounded-xl border border-[#534434] bg-[#060e20] p-4">
            <label className="flex min-h-11 cursor-pointer items-start gap-4">
              <div className="relative mt-1 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => setForm((prev) => ({ ...prev, consent: e.target.checked }))}
                  className="peer size-6 appearance-none rounded border-2 border-[#534434] bg-transparent checked:border-[#ffc174] checked:bg-[#ffc174] focus:ring-2 focus:ring-[#ffc174] focus:ring-offset-2 focus:ring-offset-[#0b1326]"
                />
                <span className="material-symbols-outlined pointer-events-none absolute text-[20px] text-[#472a00] opacity-0 peer-checked:opacity-100">
                  check
                </span>
              </div>
              <span className="text-base text-[#d8c3ad] transition-colors group-hover:text-[#dae2fd]">
                I consent to a background check and verify that all uploaded documents are accurate and
                current.
              </span>
            </label>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-[#534434] bg-[#171f33] p-4 pb-safe">
        <div className="mx-auto flex max-w-[800px] gap-4">
          <button type="button" onClick={handleSaveDraft} className={`${haulSecondaryBtn} flex-1`}>
            Save Draft
          </button>
          <button
            type="button"
            disabled={!canContinue || loading}
            onClick={() => void handleContinue()}
            className={`${haulPrimaryBtn} flex-[2] ${!canContinue ? 'cursor-not-allowed bg-[#2d3449] text-[#d8c3ad] opacity-50 hover:bg-[#2d3449]' : ''}`}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Continue
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
