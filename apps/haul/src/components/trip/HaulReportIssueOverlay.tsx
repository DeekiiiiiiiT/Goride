import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import type { RideRequestRow } from '@roam/types/rides';
import { useAppImmersiveMode } from '../../hooks/useAppImmersiveMode';
import { useVisualViewport } from '../../hooks/useVisualViewport';
import { haulJobRef } from '../../utils/haulRideFormat';

const ISSUE_OPTIONS = [
  'Customer not available',
  "Items don't match description",
  'Unsafe location',
  'Vehicle issue',
  'Other',
] as const;

type Props = {
  ride: RideRequestRow;
  onClose: () => void;
};

export function HaulReportIssueOverlay({ ride, onClose }: Props) {
  const [selected, setSelected] = useState<string>(ISSUE_OPTIONS[1]);
  const [details, setDetails] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { keyboardInset } = useVisualViewport();

  useAppImmersiveMode(true);

  const handleSubmit = () => {
    toast.success('Report submitted to dispatch');
    onClose();
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(URL.createObjectURL(file));
  };

  return createPortal(
    <div className="app-fullscreen-screen z-[200] bg-[#0b1326]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#2d3449] bg-[#0b1326]/95 backdrop-blur-md safe-t safe-x">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center text-[#dae2fd] hover:text-[#ffc174]"
          aria-label="Close"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <h1 className="text-lg font-semibold text-[#dae2fd]">Report an Issue</h1>
        <div className="w-11" />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 overflow-y-auto safe-x" style={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 112 : 112 }}>
        <div className="p-4">
          <div className="flex items-center gap-4 rounded-lg border border-[#2d3449] bg-[#171f33] p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f59e0b]/20">
              <span className="material-symbols-outlined text-[#ffc174]">local_shipping</span>
            </div>
            <div>
              <p className="text-xs tracking-wider text-[#d8c3ad] uppercase">Context</p>
              <p className="text-lg font-semibold text-[#dae2fd]">{haulJobRef(ride)} in progress</p>
            </div>
          </div>
        </div>

        <hr className="mx-4 border-[#2d3449]" />

        <section className="flex flex-col gap-2 p-4">
          <h2 className="text-lg font-semibold text-[#dae2fd]">What&apos;s the problem?</h2>
          <p className="mb-1 text-[#d8c3ad]">Select the primary issue category.</p>
          {ISSUE_OPTIONS.map((opt) => {
            const active = selected === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setSelected(opt)}
                className={`flex min-h-11 w-full items-center justify-between rounded-lg border px-4 py-2 text-left transition-colors ${
                  active
                    ? 'border-[#ffc174] bg-[#f59e0b]/10'
                    : 'border-[#2d3449] bg-[#131b2e] hover:bg-[#2d3449]'
                }`}
              >
                <span className={active ? 'text-[#ffc174]' : 'text-[#dae2fd]'}>{opt}</span>
                <span
                  className={`material-symbols-outlined ${active ? 'text-[#ffc174]' : 'text-[#d8c3ad] opacity-0'}`}
                  style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  check_circle
                </span>
              </button>
            );
          })}
        </section>

        <section className="flex flex-col gap-2 p-4">
          <h2 className="text-lg font-semibold text-[#dae2fd]">Capture evidence</h2>
          <p className="mb-1 text-[#d8c3ad]">Required for disputed descriptions.</p>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-[120px] w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#534434] bg-[#131b2e] hover:border-[#ffc174] hover:bg-[#ffc174]/5"
          >
            {photo ? (
              <img src={photo} alt="" className="h-full w-full rounded-lg object-cover" />
            ) : (
              <>
                <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-[#2d3449]">
                  <span className="material-symbols-outlined text-2xl text-[#dae2fd]">photo_camera</span>
                </div>
                <span className="text-sm font-bold text-[#ffc174]">Add Photo</span>
              </>
            )}
          </button>
        </section>

        <section className="flex flex-col gap-2 p-4">
          <label htmlFor="issue-details" className="text-lg font-semibold text-[#dae2fd]">
            Additional details
          </label>
          <textarea
            id="issue-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            placeholder="Describe the discrepancy clearly..."
            className="input-touch w-full resize-none rounded-lg border border-[#534434] bg-[#131b2e] p-4 text-[#dae2fd] placeholder:text-[#d8c3ad] focus:border-[#ffc174] focus:ring-1 focus:ring-[#ffc174] focus:outline-none"
          />
        </section>
      </main>

      <footer
        className="fixed bottom-0 left-0 w-full border-t border-[#2d3449] bg-[#0b1326]/95 p-4 backdrop-blur-md safe-x safe-b transition-[bottom] duration-200"
        style={{ bottom: keyboardInset }}
      >
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            onClick={handleSubmit}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#ffc174] text-lg font-bold text-[#472a00] shadow-lg shadow-[#ffc174]/20 active:scale-[0.98]"
          >
            <span className="material-symbols-outlined">send</span>
            Submit Report
          </button>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
