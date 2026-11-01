import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { inventoryApi } from './inventoryApi';

export function InventoryQrPrintDialog({
  assetId,
  open,
  onClose,
}: {
  assetId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [label, setLabel] = useState<{
    assetTag?: string;
    serialNumber?: string | null;
    qrPayload?: string;
    labelText?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !assetId) return;
    let cancelled = false;
    setError(null);
    setLabel(null);
    (async () => {
      try {
        const data = await inventoryApi.assetQrLabel(assetId);
        if (!cancelled) setLabel(data as typeof label);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load QR label');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, assetId]);

  if (!open) return null;

  const print = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 print:hidden">
      <div className="max-w-md w-full rounded-xl bg-surface-container-lowest p-space-lg shadow-xl flex flex-col gap-space-md">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Print QR label</h2>
          <button type="button" className="text-on-surface-variant hover:text-on-surface" onClick={onClose}>
            Close
          </button>
        </div>
        {error ? <p className="text-error text-sm">{error}</p> : null}
        {label?.qrPayload ? (
          <>
            <div
              ref={printRef}
              className="inventory-qr-print-sheet mx-auto flex flex-col items-center gap-2 border border-outline-variant/40 rounded-lg p-6 bg-white text-black"
            >
              <QRCodeSVG value={label.qrPayload} size={160} level="M" />
              <div className="font-label-code text-sm font-bold">{label.assetTag}</div>
              {label.serialNumber ? (
                <div className="font-body-sm text-xs text-slate-600">{label.serialNumber}</div>
              ) : null}
              <div className="font-body-sm text-[10px] text-slate-500 break-all max-w-[200px] text-center">
                {label.qrPayload}
              </div>
            </div>
            <button
              type="button"
              className="w-full min-h-[48px] rounded-xl bg-primary text-on-primary font-label-button"
              onClick={print}
            >
              Print label
            </button>
          </>
        ) : (
          !error && <p className="text-on-surface-variant text-sm">Loading label…</p>
        )}
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .inventory-qr-print-sheet, .inventory-qr-print-sheet * { visibility: visible !important; }
          .inventory-qr-print-sheet {
            position: fixed;
            left: 0.5in;
            top: 0.5in;
            width: 2in;
          }
        }
      `}</style>
    </div>
  );
}
