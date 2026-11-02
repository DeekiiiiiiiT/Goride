/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn9AssetPageForm } from './hooks/useIn9AssetPageForm';
import { useState } from 'react';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import { firstAssetSerial, formatPlate, strField } from '../inventoryData';
import { InventoryQrPrintDialog } from '../InventoryQrPrintDialog';
export function In9AssetPage() {
  const form = useIn9AssetPageForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const [qrOpen, setQrOpen] = useState(false);
  const asset = live.selectedAsset ?? live.assets[0] ?? null;
  const serial = asset
    ? strField(asset, 'serial_number', strField(asset, 'serial_no', '—'))
    : firstAssetSerial(live.assets);
  const assetName = asset ? strField(asset, 'name', 'Asset') : 'No asset selected';
  const vehiclePlate = asset
    ? formatPlate(strField(asset, 'vehicle_plate', strField(asset, 'license_plate', live.primaryPlate)))
    : live.primaryPlate;
  const assetId = asset ? strField(asset, 'id', '') : '';
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <InventoryQrPrintDialog
        assetId={assetId || null}
        open={qrOpen}
        onClose={() => setQrOpen(false)}
      />
      <div className="inventory-stitch-main"><div className="max-w-[1400px] mx-auto px-margin md:px-margin-desktop py-space-lg"><div className="flex flex-col w-full space-y-space-lg pb-space-xl">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pt-space-xs">
      <div className="flex items-center gap-space-sm">
      <a className="inline-flex items-center gap-1.5 px-space-sm py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface hover:text-primary transition-colors font-body-sm text-body-sm group shadow-sm" href="#">
      <span className="material-symbols-outlined text-[18px] transition-transform group-hover:-translate-x-0.5">arrow_back</span>
      <span className="font-medium">Back to Assets</span>
      </a>
      <span className="text-surface-tint">/</span>
      <div className="font-label-code text-caption text-on-surface-variant flex items-center gap-1.5">
      <span>Asset Ledger</span>
      <span className="text-surface-tint">//</span>
      <span>{live.hubName}</span>
      <span className="text-surface-tint">//</span>
      <span className="text-on-surface font-semibold">Hardware Telemetry</span>
      </div>
      </div>

      <div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant px-space-sm py-1 bg-surface-container-low rounded-lg shadow-sm">
      <span className="inline-block w-2 h-2 rounded-full bg-surface-tint animate-pulse"></span>
      <span>LEDGER RECORD ID: <span className="text-on-surface font-semibold">{form.strField(form.asset ?? {}, 'reference', form.assetId || '—')}</span></span>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-space-lg">
      <div className="flex flex-wrap items-center gap-space-md">
      <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
      <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>videocam</span>
      </div>
      <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-space-sm">
      <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">{assetName}</h1>

      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container rounded-lg font-label-code text-label-code text-on-surface group">
      <span data-stitch-data-stitch-id="serialDisplay">{serial}</span>
      <button type="button" className="p-0.5 hover:text-primary transition-colors flex items-center justify-center"  title="Copy Serial" onClick={() => void form.copySerial()}>
      <span className="material-symbols-outlined text-[16px]">content_copy</span>
      </button>
      </div>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-on-surface font-label-code text-caption font-semibold">
      <span className="material-symbols-outlined text-[16px] text-surface-tint">directions_car</span>
      <span>Installed on <span className="font-label-plate tracking-wider text-primary">{live.primaryPlate}</span></span>
      </div>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-2">
      <span>Component Class: Telematics In-Cabin Optical Unit</span>
      <span>•</span>
      <span>Batch: ROAM-JAM-2026-Q1</span>
      </p>
      </div>
      </div>

      <div className="flex flex-wrap items-center gap-space-xs sm:gap-space-sm">
      <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm" onClick={() => form.moveAssetConfirmed()}>
      <span className="material-symbols-outlined text-[18px]">drive_file_move</span>
      <span>Move</span>
      </button>
      <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm" onClick={() => form.sendRepairConfirmed()}>
      <span className="material-symbols-outlined text-[18px]">build</span>
      <span>Send to repair</span>
      </button>
      <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-low hover:bg-error-container hover:text-on-error-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm" onClick={() => form.markFaultyConfirmed()}>
      <span className="material-symbols-outlined text-[18px]">report_problem</span>
      <span>Mark faulty</span>
      </button>
      <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm" onClick={() => form.retireConfirmed()}>
      <span className="material-symbols-outlined text-[18px]">archive</span>
      <span>Retire</span>
      </button>
      <button type="button" className="px-space-lg py-2 rounded-lg bg-primary hover:bg-surface-container-high text-on-primary hover:text-on-surface font-body-sm text-body-sm font-semibold transition-all flex items-center gap-2 shadow-md" onClick={() => setQrOpen(true)}>
      <span className="material-symbols-outlined text-[18px]">qr_code_2</span>
      <span>Print QR label</span>
      </button>
      </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-space-md">

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between space-y-space-xs">
      <div className="flex items-center justify-between text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <span>Bought</span>
      <span className="material-symbols-outlined text-sm">shopping_cart</span>
      </div>
      <div>
      <div className="font-label-code text-headline-sm text-on-surface font-bold">6 Jan 2026</div>
      <div className="font-caption text-caption text-on-surface-variant mt-0.5">PO #JAM-7721</div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between space-y-space-xs">
      <div className="flex items-center justify-between text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <span>Cost</span>
      <span className="material-symbols-outlined text-sm">payments</span>
      </div>
      <div>
      <div className="font-label-price text-headline-sm text-on-surface font-bold">{form.valueLabel}</div>
      <div className="font-caption text-caption text-on-surface-variant mt-0.5">FIFO Landed valuation</div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between space-y-space-xs">
      <div className="flex items-center justify-between text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <span>Vendor</span>
      <span className="material-symbols-outlined text-sm">local_shipping</span>
      </div>
      <div>
      <div className="font-body-md text-body-md text-on-surface font-bold leading-snug">Amazon (via shipping agent)</div>
      <div className="font-caption text-caption text-on-surface-variant mt-0.5">Customs Cleared NMIA</div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between space-y-space-xs">
      <div className="flex items-center justify-between text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <span>Warranty ends</span>
      <span className="material-symbols-outlined text-sm">verified_user</span>
      </div>
      <div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
      <span className="font-label-code text-body-lg text-on-surface font-bold">6 Jan 2027</span>
      <span className="px-1.5 py-0.5 rounded bg-surface-container font-caption text-caption text-on-surface-variant font-medium">in 66 days</span>
      </div>
      <div className="font-caption text-caption text-on-surface-variant mt-0.5">12-Month Dual Shield</div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between space-y-space-xs">
      <div className="flex items-center justify-between text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <span>Next inspection</span>
      <span className="material-symbols-outlined text-sm">calendar_month</span>
      </div>
      <div>
      <div className="font-label-code text-headline-sm text-on-surface font-bold">—</div>
      <div className="font-caption text-caption text-on-surface-variant mt-0.5">Annual depot inspection</div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between space-y-space-xs">
      <div className="flex items-center justify-between text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <span>Device / Telemetry</span>
      <span className="material-symbols-outlined text-sm">sensors_off</span>
      </div>
      <div>
      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-code text-caption font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-surface-tint"></span>
      <span>Not connected</span>
      </div>
      <div className="font-caption text-caption text-on-surface-variant mt-1">Direct CAN-bus feed inactive</div>
      </div>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">

      <div className="lg:col-span-8 space-y-space-lg">
      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md gap-space-sm">
      <div>
      <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-primary text-xl">history</span>
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Lifecycle Timeline</h2>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    Cryptographic audit stream of driver reports, depot handoffs, and telemetry logs
                  </p>
      </div>
      <div className="flex items-center gap-1.5 bg-surface-container p-1 rounded-lg self-start sm:self-auto font-caption text-caption">
      <button type="button" className="px-2.5 py-1 rounded bg-surface-container-lowest text-on-surface font-semibold shadow-sm" onClick={() => form.setLogFilter('all')}>All Logs ({form.logCounts.all})</button>
      <button type="button" className="px-2.5 py-1 rounded hover:bg-surface-container-lowest text-on-surface-variant transition-colors" onClick={() => form.setLogFilter('incident')}>Incident ({form.logCounts.incident})</button>
      <button type="button" className="px-2.5 py-1 rounded hover:bg-surface-container-lowest text-on-surface-variant transition-colors" onClick={() => form.setLogFilter('custody')}>Custody ({form.logCounts.custody})</button>
      </div>
      </div>

      <div className="relative pl-6 sm:pl-8 space-y-space-lg before:content-[''] before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-surface-container-high pt-space-sm">

      <div className="relative group">

      <div className="absolute -left-6 sm:-left-8 top-0.5 w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center ring-4 ring-surface-container-lowest">
      <span className="material-symbols-outlined text-[15px]">tag</span>
      </div>
      <div className="bg-surface-container-low rounded-xl p-space-md shadow-sm transition-all hover:bg-surface-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
      <div className="flex items-center gap-2">
      <span className="font-label-code text-body-md text-on-surface font-bold">1 Nov 2026</span>
      <span className="text-surface-tint">•</span>
      <span className="font-headline-sm text-body-md text-on-surface font-semibold">Serial number added</span>
      </div>
      <div className="font-label-code text-caption text-on-surface-variant">03:42 PM EST</div>
      </div>
      <div className="mt-1 font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5">
      <span className="material-symbols-outlined text-sm">badge</span>
      <span>Actor: <strong className="text-on-surface">Deeki T (Platform Owner)</strong></span>
      <span className="text-surface-tint">/</span>
      <span className="font-label-code text-caption">Depot Kingston Gate 2</span>
      </div>
      <p className="mt-space-sm font-body-sm text-body-sm text-on-surface leading-relaxed bg-surface-container-lowest/80 p-space-sm rounded-lg">
                      Manual serial entry verified against hardware barcode <code className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container font-bold text-on-surface">{serial}</code> at Kingston Main Store staging bay during quarterly asset reconciliation.
                    </p>
      </div>
      </div>

      <div className="relative group">

      <div className="absolute -left-6 sm:-left-8 top-0.5 w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center ring-4 ring-surface-container-lowest">
      <span className="material-symbols-outlined text-[16px]">warning</span>
      </div>
      <div className="bg-surface-container-low rounded-xl p-space-md shadow-sm transition-all hover:bg-surface-container">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
      <div>
      <div className="flex flex-wrap items-center gap-2">
      <span className="font-label-code text-body-md text-on-surface font-bold">12 Mar 2026</span>
      <span className="text-surface-tint">•</span>
      <span className="font-headline-sm text-body-md text-on-surface font-bold">Driver report: "Screen flickers"</span>
      </div>
      <div className="mt-1 font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5">
      <span className="material-symbols-outlined text-sm">directions_car</span>
      <span>Actor: <strong className="text-on-surface">Driver of {live.primaryPlate}</strong> (via Roam Driver App)</span>
      </div>
      </div>
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container font-caption text-caption font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-surface-tint animate-pulse"></span>
      <span>Inspection pending</span>
      </div>
      </div>

      <div className="mt-space-md grid grid-cols-1 sm:grid-cols-12 gap-space-md items-center bg-surface-container-lowest p-space-md rounded-xl">
      <div className="sm:col-span-4 overflow-hidden rounded-lg relative aspect-video bg-surface-container-high group/img">
      <img className="w-full h-full object-cover rounded-lg group-hover/img:scale-105 transition-transform duration-300" data-alt="Close-up photograph taken from driver seat of a dual lens dash camera mounted on car windshield with amber illuminated screen showing mild electrical static flutter inside a modern compact vehicle cabin in daylight." src="https://lh3.googleusercontent.com/aida-public/AB6AXuCeugX8NmYdwWO7vF3pzK32-mW7vSza3mY3p9YxQb44kPQ2lYZdwMP7tbhs_koFRGT0IS7bGPoWzQIdgB3zyn7FsmzhPQemVAQ35pAaznX4hNAi8dgbm8J8FH11EsNcUmkjCgzmqQ713tlMmGUmhtum_Sdk4CQUIBML37X3-KrBNZwFv8TrFgAPsj1KjLWKjmiUx2AD5xP_zCdwfJyVHllnumGqrQmOw6XOQ4E_sP8"/>
      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-primary-container/80 text-on-primary font-label-code text-caption">
                          IMG_0812.HEIC
                        </div>
      </div>
      <div className="sm:col-span-8 space-y-1">
      <div className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold flex items-center gap-1">
      <span className="material-symbols-outlined text-sm">chat_bubble</span>
      <span>Reported Commentary</span>
      </div>
      <blockquote className="font-body-sm text-body-sm text-on-surface italic">
                          "Display flickers and restarts when going over potholes along Marcus Garvey Drive. Cable connection to 12V auxiliary port seems tight, possibly an internal wiring wiggle."
                        </blockquote>
      <div className="pt-1 flex items-center gap-space-md font-label-code text-caption text-on-surface-variant">
      <span>GPS: 17.9712° N, 76.7928° W</span>
      <span>•</span>
      <span>OBD: No battery fault</span>
      </div>
      </div>
      </div>
      </div>
      </div>

      <div className="relative group">

      <div className="absolute -left-6 sm:-left-8 top-0.5 w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-surface-tint text-on-primary flex items-center justify-center ring-4 ring-surface-container-lowest">
      <span className="material-symbols-outlined text-[15px]">construction</span>
      </div>
      <div className="bg-surface-container-low rounded-xl p-space-md shadow-sm transition-all hover:bg-surface-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
      <div className="flex items-center gap-2">
      <span className="font-label-code text-body-md text-on-surface font-bold">6 Jan 2026</span>
      <span className="text-surface-tint">•</span>
      <span className="font-headline-sm text-body-md text-on-surface font-semibold">Installed on {live.primaryPlate}</span>
      </div>
      <div className="font-label-code text-caption text-on-surface-variant">11:15 AM EST</div>
      </div>
      <div className="mt-1 font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5">
      <span className="material-symbols-outlined text-sm">person</span>
      <span>Actor: <strong className="text-on-surface">Deeki T</strong> (Certified Installer)</span>
      </div>
      <p className="mt-space-sm font-body-sm text-body-sm text-on-surface bg-surface-container-lowest/80 p-space-sm rounded-lg">
                      Provisioned as part of standard Rideshare car kit upgrade on <strong>{vehiclePlate}</strong>. Hardwired bracket fitted behind rearview mirror with 64GB high-endurance SD module initialized.
                    </p>
      </div>
      </div>

      <div className="relative group">

      <div className="absolute -left-6 sm:-left-8 top-0.5 w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center ring-4 ring-surface-container-lowest">
      <span className="material-symbols-outlined text-[15px]">inventory_2</span>
      </div>
      <div className="bg-surface-container-low rounded-xl p-space-md shadow-sm transition-all hover:bg-surface-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
      <div className="flex items-center gap-2">
      <span className="font-label-code text-body-md text-on-surface font-bold">6 Jan 2026</span>
      <span className="text-surface-tint">•</span>
      <span className="font-headline-sm text-body-md text-on-surface font-semibold">Received into Main store</span>
      </div>
      <div className="font-label-code text-caption text-on-surface-variant">08:00 AM EST</div>
      </div>
      <div className="mt-1 font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5">
      <span className="material-symbols-outlined text-sm">inventory</span>
      <span>Actor: <strong className="text-on-surface">Deeki T</strong></span>
      </div>
      <p className="mt-space-sm font-body-sm text-body-sm text-on-surface bg-surface-container-lowest/80 p-space-sm rounded-lg">
                      Received from Amazon (via shipping agent). Landed cost booked at <strong className="font-label-price text-on-surface font-semibold">{form.valueLabel}</strong> under Ledger Entry <span className="font-label-code font-bold">#RCV-8821</span>. Packaging intact, all secondary harnesses accounted for.
                    </p>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col sm:flex-row items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-surface-tint">post_add</span>
      <div className="text-body-sm font-body-sm">
      <span className="font-semibold text-on-surface">Append Audit Remark:</span>
      <span className="text-on-surface-variant"> Log depot physical inspection or swap cable check.</span>
      </div>
      </div>
      <button type="button" className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1.5" onClick={() => form.addIncidentNote()}>
      <span className="material-symbols-outlined text-[16px]">edit_note</span>
      <span>Add Incident Note</span>
      </button>
      </div>
      </div>

      <div className="lg:col-span-4 space-y-space-lg">

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-primary text-xl">folder_open</span>
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Attached Documents</h3>
      </div>
      <span className="font-label-code text-caption text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">2 FILES</span>
      </div>
      <div className="space-y-space-xs">

      <div className="flex items-center justify-between p-space-sm bg-surface-container-low hover:bg-surface-container rounded-lg transition-colors group">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-9 h-9 rounded bg-surface-container-high text-primary flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
      </div>
      <div className="min-w-0">
      <div className="font-body-md text-body-md text-on-surface font-bold truncate group-hover:text-primary">Invoice.pdf</div>
      <div className="font-label-code text-caption text-on-surface-variant truncate">{form.valueLabel} • 240 KB</div>
      </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
      <button type="button" className="w-8 h-8 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors" title="View Document" onClick={() => form.openDocument(form.documents[-1] ?? {})}>
      <span className="material-symbols-outlined text-[18px]">visibility</span>
      </button>
      <button type="button" className="w-8 h-8 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors" title="Download" onClick={() => form.downloadDocument(form.documents[-1] ?? {})}>
      <span className="material-symbols-outlined text-[18px]">download</span>
      </button>
      </div>
      </div>

      <div className="flex items-center justify-between p-space-sm bg-surface-container-low hover:bg-surface-container rounded-lg transition-colors group">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-9 h-9 rounded bg-surface-container-high text-primary flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[20px]">image</span>
      </div>
      <div className="min-w-0">
      <div className="font-body-md text-body-md text-on-surface font-bold truncate group-hover:text-primary">Warranty.jpg</div>
      <div className="font-label-code text-caption text-on-surface-variant truncate">Manufacturer 1-Yr • 1.2 MB</div>
      </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
      <button type="button" className="w-8 h-8 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors" title="View Document" onClick={() => form.openDocument(form.documents[0] ?? {})}>
      <span className="material-symbols-outlined text-[18px]">visibility</span>
      </button>
      <button type="button" className="w-8 h-8 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors" title="Download" onClick={() => form.downloadDocument(form.documents[0] ?? {})}>
      <span className="material-symbols-outlined text-[18px]">download</span>
      </button>
      </div>
      </div>
      </div>

      <button type="button" className="w-full py-2 px-space-md rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center justify-center gap-2" onClick={() => form.uploadDocument()}>
      <span className="material-symbols-outlined text-[18px]">upload_file</span>
      <span>+ Upload document</span>
      </button>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-primary text-xl">memory</span>
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Hardware Specifications</h3>
      </div>
      <span className="px-2 py-0.5 rounded bg-surface-container font-label-code text-caption text-on-surface font-semibold">TIER 1 FIT</span>
      </div>
      <div className="space-y-space-sm font-body-sm text-body-sm">
      <div className="flex justify-between py-1.5 px-2 rounded bg-surface-container-low">
      <span className="text-on-surface-variant">Model SKU</span>
      <span className="font-label-code font-bold text-on-surface">ELC-DCM-01</span>
      </div>
      <div className="flex justify-between py-1.5 px-2 rounded bg-surface-container-low">
      <span className="text-on-surface-variant">Sensor Architecture</span>
      <span className="font-medium text-on-surface">Dual-Lens 1080p Sony Starvis</span>
      </div>
      <div className="flex justify-between py-1.5 px-2 rounded bg-surface-container-low">
      <span className="text-on-surface-variant">Interface</span>
      <span className="font-medium text-on-surface">Mini USB / Hardwire Fuse Tap</span>
      </div>
      <div className="flex justify-between py-1.5 px-2 rounded bg-surface-container-low">
      <span className="text-on-surface-variant">Storage Media</span>
      <span className="font-label-code text-on-surface">SanDisk MaxEndurance 64GB</span>
      </div>
      </div>

      <div className="p-space-md rounded-xl bg-surface-container-low space-y-space-sm">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase tracking-wider font-bold text-on-surface-variant">Depot Tag Preview</span>
      <span className="font-label-code text-caption text-on-surface-variant">Hub #01 Physical Stamp</span>
      </div>
      <div className="p-space-md bg-surface-container-lowest rounded-lg shadow-sm flex items-center gap-space-md">

      <div className="w-20 h-20 bg-primary-container p-1 rounded flex items-center justify-center shrink-0">
      <svg className="w-full h-full text-on-primary fill-current" viewBox="0 0 100 100">

      <rect height="28" width="28" x="5" y="5"></rect>
      <rect fill="#1b192e" height="20" width="20" x="9" y="9"></rect>
      <rect height="12" width="12" x="13" y="13"></rect>
      <rect height="28" width="28" x="67" y="5"></rect>
      <rect fill="#1b192e" height="20" width="20" x="71" y="9"></rect>
      <rect height="12" width="12" x="75" y="13"></rect>
      <rect height="28" width="28" x="5" y="67"></rect>
      <rect fill="#1b192e" height="20" width="20" x="9" y="71"></rect>
      <rect height="12" width="12" x="13" y="75"></rect>

      <rect height="8" width="8" x="40" y="8"></rect>
      <rect height="8" width="8" x="52" y="8"></rect>
      <rect height="8" width="8" x="40" y="24"></rect>
      <rect height="8" width="8" x="8" y="44"></rect>
      <rect height="8" width="8" x="24" y="44"></rect>
      <rect height="12" width="12" x="44" y="44"></rect>
      <rect height="8" width="8" x="64" y="40"></rect>
      <rect height="8" width="12" x="80" y="44"></rect>
      <rect height="8" width="8" x="44" y="64"></rect>
      <rect height="8" width="8" x="60" y="64"></rect>
      <rect height="12" width="12" x="44" y="80"></rect>
      <rect height="12" width="8" x="68" y="80"></rect>
      <rect height="16" width="8" x="84" y="72"></rect>
      </svg>
      </div>

      <div className="min-w-0 space-y-0.5">
      <div className="font-label-code text-caption font-bold text-on-surface truncate">ROAM FLEET SYS</div>
      <div className="font-label-code text-label-code font-bold text-primary truncate">{serial}</div>
      <div className="font-label-plate text-caption text-on-surface">VEH: {live.primaryPlate}</div>
      <div className="font-caption text-caption text-on-surface-variant flex items-center gap-1">
      <span className="material-symbols-outlined text-[12px]">location_on</span>
      <span>Kingston Watermark #01</span>
      </div>
      </div>
      </div>
      </div>

      <div className="p-space-md rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors flex items-center justify-between">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-primary text-xl">directions_car</span>
      </div>
      <div className="min-w-0">
      <div className="font-caption text-caption uppercase text-on-surface-variant font-semibold">Assigned Vehicle</div>
      <div className="font-body-md text-body-md font-bold text-on-surface truncate">{vehiclePlate}</div>
      <div className="font-label-plate text-label-code text-primary font-bold">Plate: {live.primaryPlate}</div>
      </div>
      </div>
      <a className="px-space-sm py-1.5 rounded-lg bg-surface-container-lowest text-on-surface hover:text-primary font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1 shadow-sm shrink-0" href="#">
      <span>View Car</span>
      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
      </a>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-sm">
      <div className="flex items-center justify-between">
      <span className="font-headline-sm text-body-md text-on-surface font-bold">Depot Diagnostic Status</span>
      <span className="font-label-code text-caption text-on-surface-variant">PASS (4/5)</span>
      </div>
      <div className="space-y-2 pt-1 font-body-sm text-body-sm">
      <div className="flex items-center justify-between text-on-surface-variant">
      <span className="flex items-center gap-1.5">
      <span className="material-symbols-outlined text-surface-tint text-base">check_circle</span>
      <span>Lens Clarity Sensor</span>
      </span>
      <span className="font-label-code text-caption text-on-surface font-semibold">Optimal</span>
      </div>
      <div className="flex items-center justify-between text-on-surface-variant">
      <span className="flex items-center gap-1.5">
      <span className="material-symbols-outlined text-surface-tint text-base">check_circle</span>
      <span>Internal Clock Battery</span>
      </span>
      <span className="font-label-code text-caption text-on-surface font-semibold">3.28V (OK)</span>
      </div>
      <div className="flex items-center justify-between text-on-surface-variant">
      <span className="flex items-center gap-1.5">
      <span className="material-symbols-outlined text-surface-tint text-base">warning</span>
      <span>Screen LCD Inverter</span>
      </span>
      <span className="font-label-code text-caption text-on-surface font-semibold">Intermittent</span>
      </div>
      <div className="flex items-center justify-between text-on-surface-variant">
      <span className="flex items-center gap-1.5">
      <span className="material-symbols-outlined text-surface-tint text-base">check_circle</span>
      <span>MicroSD Flash Health</span>
      </span>
      <span className="font-label-code text-caption text-on-surface font-semibold">98% Life</span>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div></div></div>
    </div>
  );
}
