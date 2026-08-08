import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Upload, PenLine, Pencil, Trash2, X, CircleHelp } from 'lucide-react';
import {
  useCreateManifest,
  useDeleteManifest,
  useFacilities,
  useFreightOrgId,
  useImportWarehouseManifest,
  useManifest,
  useManifests,
  usePackages,
  useUpdateManifest,
} from '@/app/hooks/useFreight';
import { freightService } from '@/app/services/freightService';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  downloadWarehouseManifestTemplate,
  parseWarehouseManifestCsv,
  type WarehouseManifestRow,
} from '@/app/freight/warehouseManifestCsv';

type FacilityOpt = { id: string; name: string };
type OverlayMode = 'upload' | 'manual' | null;
type ManifestRow = Record<string, unknown>;

const FIELD_TIPS = {
  carrier:
    'The airline or shipping line that moves the cargo (example: Amerijet). Not the US warehouse, and not Jamaica Customs.',
  shipmentType:
    'How the cargo travels: Air = plane, Sea = ship. Pick Air for air carriers like Amerijet.',
  origin:
    'Your Florida US intake warehouse — where packages were received before this shipment left for Jamaica.',
  destination:
    'Your main Jamaica hub where cargo will be scanned after Customs clears it.',
  awb:
    'The carrier’s official shipment number. AWB = air waybill (plane). BL = bill of lading (ship). Optional if you do not have it yet — add it later when you submit to Customs.',
  csvFile:
    'Spreadsheet from the US warehouse listing every package on this flight/shipment (tracking, suite/mailbox, weight, value). Download the template if you need the column layout.',
  brokerRef:
    'Optional reference your customs broker gave you. Leave blank if you do not have one yet.',
  flightOrVoyage:
    'Optional flight number or vessel name the cargo is riding on (example: M8 123). Helps match the physical plane or ship.',
} as const;

/** Plain tip for new staff — hover or focus the (?). */
function FieldTip({ text }: { text: string }) {
  return (
    <span className="relative ml-1 inline-flex align-middle">
      <button
        type="button"
        className="group rounded-full text-slate-400 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        aria-label={text}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-[60] mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-2 text-left text-[11px] font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {text}
        </span>
      </button>
    </span>
  );
}

function FieldLabel({
  children,
  tip,
  className = 'block text-sm',
}: {
  children: ReactNode;
  tip: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="inline-flex items-center font-medium text-slate-800">
        {children}
        <FieldTip text={tip} />
      </span>
    </label>
  );
}

function Overlay({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manifest-overlay-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="manifest-overlay-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ManifestMetaFields({
  carrierName,
  setCarrierName,
  shipmentType,
  setShipmentType,
  originFacilityId,
  setOriginFacilityId,
  destinationFacilityId,
  setDestinationFacilityId,
  awbOrBl,
  setAwbOrBl,
  miamiFacilities,
  hubFacilities,
  namedInputs,
}: {
  carrierName?: string;
  setCarrierName?: (v: string) => void;
  shipmentType?: 'air' | 'sea';
  setShipmentType?: (v: 'air' | 'sea') => void;
  originFacilityId?: string;
  setOriginFacilityId?: (v: string) => void;
  destinationFacilityId?: string;
  setDestinationFacilityId?: (v: string) => void;
  awbOrBl?: string;
  setAwbOrBl?: (v: string) => void;
  miamiFacilities: FacilityOpt[];
  hubFacilities: FacilityOpt[];
  /** Use native name= fields (uncontrolled) for Manual form */
  namedInputs?: boolean;
}) {
  const controlled = !namedInputs;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <FieldLabel tip={FIELD_TIPS.carrier}>Carrier</FieldLabel>
        {controlled ? (
          <input
            value={carrierName}
            onChange={(e) => setCarrierName?.(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Amerijet"
          />
        ) : (
          <input
            name="carrierName"
            defaultValue="Amerijet"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Amerijet"
          />
        )}
      </div>
      <div>
        <FieldLabel tip={FIELD_TIPS.shipmentType}>Type</FieldLabel>
        {controlled ? (
          <select
            value={shipmentType}
            onChange={(e) => setShipmentType?.(e.target.value as 'air' | 'sea')}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="air">Air</option>
            <option value="sea">Sea</option>
          </select>
        ) : (
          <select
            name="shipmentType"
            defaultValue="air"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="air">Air</option>
            <option value="sea">Sea</option>
          </select>
        )}
      </div>
      <div>
        <FieldLabel tip={FIELD_TIPS.origin}>Origin (US intake)</FieldLabel>
        {controlled ? (
          <select
            value={originFacilityId}
            onChange={(e) => setOriginFacilityId?.(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {miamiFacilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <select
            name="originFacilityId"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {miamiFacilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <FieldLabel tip={FIELD_TIPS.destination}>Destination (Jamaica hub)</FieldLabel>
        {controlled ? (
          <select
            value={destinationFacilityId}
            onChange={(e) => setDestinationFacilityId?.(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {hubFacilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <select
            name="destinationFacilityId"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {hubFacilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="sm:col-span-2">
        <FieldLabel tip={FIELD_TIPS.awb}>AWB / BL (optional)</FieldLabel>
        {controlled ? (
          <input
            value={awbOrBl}
            onChange={(e) => setAwbOrBl?.(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Leave blank if you do not have it yet"
          />
        ) : (
          <input
            name="awbOrBl"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Leave blank if you do not have it yet"
          />
        )}
      </div>
    </div>
  );
}

function UploadManifestForm({
  miamiFacilities,
  hubFacilities,
  onClose,
}: {
  miamiFacilities: FacilityOpt[];
  hubFacilities: FacilityOpt[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const importMut = useImportWarehouseManifest();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<WarehouseManifestRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [carrierName, setCarrierName] = useState('Amerijet');
  const [shipmentType, setShipmentType] = useState<'air' | 'sea'>('air');
  const [originFacilityId, setOriginFacilityId] = useState('');
  const [destinationFacilityId, setDestinationFacilityId] = useState('');
  const [awbOrBl, setAwbOrBl] = useState('');

  async function onFile(file: File | null) {
    setErr(null);
    setPreview([]);
    setParseErrors([]);
    setFileName(file?.name ?? null);
    if (!file) return;
    const text = await file.text();
    const parsed = parseWarehouseManifestCsv(text);
    setParseErrors(parsed.errors);
    setPreview(parsed.rows);
    if (!parsed.rows.length && !parsed.errors.length) {
      setParseErrors(['No valid package rows found in this file.']);
    }
  }

  async function onImport() {
    if (!preview.length) return;
    setErr(null);
    try {
      const res = await importMut.mutateAsync({
        carrierName: carrierName || null,
        shipmentType,
        originFacilityId: originFacilityId || null,
        destinationFacilityId: destinationFacilityId || null,
        awbOrBl: awbOrBl || null,
        rows: preview.map((r) => ({
          suiteCode: r.suiteCode,
          contactName: r.contactName,
          trn: r.trn,
          courierTrackingNumber: r.courierTrackingNumber,
          description: r.description,
          weightLbs: r.weightLbs,
          lengthIn: r.lengthIn,
          widthIn: r.widthIn,
          heightIn: r.heightIn,
          declaredValueUsd: r.declaredValueUsd,
          invoiceFileName: r.invoiceFileName,
        })),
      });
      onClose();
      void navigate(`/app/manifests/${res.manifestId}`);
    } catch (ex) {
      setErr((ex as Error).message || 'Import failed.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={downloadWarehouseManifestTemplate}
          className="text-xs font-medium text-amber-800 underline-offset-2 hover:underline"
        >
          Download template
        </button>
        <FieldTip text={FIELD_TIPS.csvFile} />
      </div>

      <ManifestMetaFields
        carrierName={carrierName}
        setCarrierName={setCarrierName}
        shipmentType={shipmentType}
        setShipmentType={setShipmentType}
        originFacilityId={originFacilityId}
        setOriginFacilityId={setOriginFacilityId}
        destinationFacilityId={destinationFacilityId}
        setDestinationFacilityId={setDestinationFacilityId}
        awbOrBl={awbOrBl}
        setAwbOrBl={setAwbOrBl}
        miamiFacilities={miamiFacilities}
        hubFacilities={hubFacilities}
      />

      <div>
        <FieldLabel tip={FIELD_TIPS.csvFile}>Warehouse cargo list (CSV file)</FieldLabel>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {fileName && <p className="text-xs text-slate-500">{fileName}</p>}

      {parseErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <ul className="list-disc pl-4">
            {parseErrors.slice(0, 6).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {preview.length > 0 && (
        <p className="text-sm text-slate-600">
          Ready to import <span className="font-semibold">{preview.length}</span> package
          {preview.length === 1 ? '' : 's'}.
        </p>
      )}

      {err && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!preview.length || importMut.isPending}
          onClick={() => void onImport()}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {importMut.isPending ? 'Importing…' : 'Import manifesto'}
        </button>
      </div>
    </div>
  );
}

function ManualManifestForm({
  miamiFacilities,
  hubFacilities,
  onClose,
}: {
  miamiFacilities: FacilityOpt[];
  hubFacilities: FacilityOpt[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const create = useCreateManifest();
  const [err, setErr] = useState<string | null>(null);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await create.mutateAsync({
        carrierName: fd.get('carrierName') || null,
        shipmentType: fd.get('shipmentType') || 'air',
        originFacilityId: (fd.get('originFacilityId') as string) || null,
        destinationFacilityId: (fd.get('destinationFacilityId') as string) || null,
        awbOrBl: fd.get('awbOrBl') || null,
      });
      onClose();
      const id = String((res as { manifest?: { id?: string } }).manifest?.id || '');
      if (id) void navigate(`/app/manifests/${id}`);
    } catch (ex) {
      setErr((ex as Error).message);
    }
  }

  return (
    <form onSubmit={onCreate} className="space-y-4">
      <ManifestMetaFields
        namedInputs
        miamiFacilities={miamiFacilities}
        hubFacilities={hubFacilities}
      />
      {err && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {create.isPending ? 'Creating…' : 'Create cargo manifesto'}
        </button>
      </div>
    </form>
  );
}

function EditManifestForm({
  manifesto,
  miamiFacilities,
  hubFacilities,
  onClose,
}: {
  manifesto: ManifestRow;
  miamiFacilities: FacilityOpt[];
  hubFacilities: FacilityOpt[];
  onClose: () => void;
}) {
  const update = useUpdateManifest();
  const [err, setErr] = useState<string | null>(null);
  const [carrierName, setCarrierName] = useState(String(manifesto.carrier_name || ''));
  const [shipmentType, setShipmentType] = useState<'air' | 'sea'>(
    manifesto.shipment_type === 'sea' ? 'sea' : 'air',
  );
  const [originFacilityId, setOriginFacilityId] = useState(
    manifesto.origin_facility_id ? String(manifesto.origin_facility_id) : '',
  );
  const [destinationFacilityId, setDestinationFacilityId] = useState(
    manifesto.destination_facility_id ? String(manifesto.destination_facility_id) : '',
  );
  const [awbOrBl, setAwbOrBl] = useState(String(manifesto.awb_or_bl || ''));

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await update.mutateAsync({
        id: String(manifesto.id),
        body: {
          carrierName: carrierName || null,
          shipmentType,
          originFacilityId: originFacilityId || null,
          destinationFacilityId: destinationFacilityId || null,
          awbOrBl: awbOrBl || null,
        },
      });
      onClose();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <ManifestMetaFields
        carrierName={carrierName}
        setCarrierName={setCarrierName}
        shipmentType={shipmentType}
        setShipmentType={setShipmentType}
        originFacilityId={originFacilityId}
        setOriginFacilityId={setOriginFacilityId}
        destinationFacilityId={destinationFacilityId}
        setDestinationFacilityId={setDestinationFacilityId}
        awbOrBl={awbOrBl}
        setAwbOrBl={setAwbOrBl}
        miamiFacilities={miamiFacilities}
        hubFacilities={hubFacilities}
      />
      {err && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={update.isPending}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

export function ManifestsListPage() {
  const { data, isLoading, error } = useManifests();
  const miami = useFacilities('miami_warehouse');
  const hub = useFacilities('ja_hub');
  const remove = useDeleteManifest();
  const [overlay, setOverlay] = useState<OverlayMode>(null);
  const [editRow, setEditRow] = useState<ManifestRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<ManifestRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const miamiOpts = (miami.data?.facilities ?? []).map((f) => ({
    id: String(f.id),
    name: String(f.name),
  }));
  const hubOpts = (hub.data?.facilities ?? []).map((f) => ({
    id: String(f.id),
    name: String(f.name),
  }));

  async function confirmDelete() {
    if (!deleteRow) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(String(deleteRow.id));
      setDeleteRow(null);
    } catch (ex) {
      setDeleteError((ex as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Manifests</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            US warehouse cargo list in → you compile and seal → download the electronic file for
            Jamaica Customs. Customs does not create the manifesto.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOverlay('upload')}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            <Upload className="h-4 w-4" />
            Upload cargo list
          </button>
          <button
            type="button"
            onClick={() => setOverlay('manual')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <PenLine className="h-4 w-4" />
            Compile from Receive
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}

      <ul className="space-y-2">
        {(data?.manifests ?? []).map((m) => {
          const isOpen = String(m.status) === 'open';
          return (
            <li
              key={String(m.id)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <Link
                to={`/app/manifests/${m.id}`}
                className="min-w-0 flex-1 hover:opacity-80"
              >
                <span className="font-medium text-slate-900">{String(m.manifest_number)}</span>
                <span className="ml-2 text-slate-500">
                  {String(m.shipment_type)} · {String(m.status)}
                </span>
              </Link>
              {isOpen && (
                <div className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    title="Edit"
                    onClick={() => {
                      setDeleteRow(null);
                      setEditRow(m);
                    }}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => {
                      setEditRow(null);
                      setDeleteError(null);
                      setDeleteRow(m);
                    }}
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {!isLoading && !(data?.manifests ?? []).length && (
          <li className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
            No cargo manifestos yet — upload a warehouse list or compile from Receive.
          </li>
        )}
      </ul>

      {overlay === 'upload' && (
        <Overlay
          title="Upload warehouse cargo list"
          subtitle="CSV from the US intake warehouse / consolidator. You will seal and submit to Customs here."
          onClose={() => setOverlay(null)}
        >
          <UploadManifestForm
            miamiFacilities={miamiOpts}
            hubFacilities={hubOpts}
            onClose={() => setOverlay(null)}
          />
        </Overlay>
      )}

      {overlay === 'manual' && (
        <Overlay
          title="Compile from Miami Receive"
          subtitle="Empty cargo manifesto — add packages already received in Miami, then seal and submit to Customs."
          onClose={() => setOverlay(null)}
        >
          <ManualManifestForm
            miamiFacilities={miamiOpts}
            hubFacilities={hubOpts}
            onClose={() => setOverlay(null)}
          />
        </Overlay>
      )}

      {editRow && (
        <Overlay
          title={`Edit ${String(editRow.manifest_number)}`}
          subtitle="Carrier, route, and AWB for this open cargo manifesto."
          onClose={() => setEditRow(null)}
        >
          <EditManifestForm
            manifesto={editRow}
            miamiFacilities={miamiOpts}
            hubFacilities={hubOpts}
            onClose={() => setEditRow(null)}
          />
        </Overlay>
      )}

      {deleteRow && (
        <Overlay
          title="Delete cargo manifesto?"
          subtitle="Packages stay available and can be added to another manifesto."
          onClose={() => setDeleteRow(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Remove{' '}
              <span className="font-semibold text-slate-900">
                {String(deleteRow.manifest_number)}
              </span>
              ? This cannot be undone.
            </p>
            {deleteError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteRow(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => void confirmDelete()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {remove.isPending ? 'Deleting…' : 'Delete manifesto'}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

export function ManifestDetailPage() {
  const { id } = useParams();
  const orgId = useFreightOrgId();
  const qc = useQueryClient();
  const { data, isLoading, error } = useManifest(id);
  const miamiPkgs = usePackages('received_miami');
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [brokerRef, setBrokerRef] = useState('');
  const [flightOrVoyage, setFlightOrVoyage] = useState('');
  const [awbOrBl, setAwbOrBl] = useState('');

  const addPkgs = useMutation({
    mutationFn: () => freightService.addManifestPackages(id!, selected, orgId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'manifest', orgId, id] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      setSelected([]);
    },
  });
  const seal = useMutation({
    mutationFn: () => freightService.sealManifest(id!, orgId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'manifest', orgId, id] }),
  });
  const transition = useMutation({
    mutationFn: (status: string) => freightService.transitionManifest(id!, status, undefined, orgId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'manifest', orgId, id] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
    },
  });

  async function submitForCustoms() {
    if (!id) return;
    setSubmitBusy(true);
    setSubmitErr(null);
    try {
      const res = await freightService.submitManifestCustoms(
        id,
        {
          brokerRef: brokerRef.trim() || null,
          awbOrBl: awbOrBl.trim() || null,
          flightOrVoyage: flightOrVoyage.trim() || null,
        },
        orgId,
      );
      const blob = new Blob([res.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${res.manifestNumber}-customs.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(res.message || 'File ready for broker / Customs submission.');
      setSubmitOpen(false);
      void qc.invalidateQueries({ queryKey: ['freight', 'manifest', orgId, id] });
      void qc.invalidateQueries({ queryKey: ['freight', 'customs'] });
    } catch (ex) {
      setSubmitErr((ex as Error).message);
    } finally {
      setSubmitBusy(false);
    }
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-700">{(error as Error).message}</p>;
  if (!data?.manifest) return <p>Not found</p>;

  const m = data.manifest;
  const status = String(m.status);
  const customsCase = data.customsCase as Record<string, unknown> | null | undefined;
  const customsStatus = customsCase ? String(customsCase.status || '') : '';

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/manifests" className="text-sm text-slate-500 hover:underline">
          ← Manifests
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{String(m.manifest_number)}</h1>
        <p className="text-sm text-slate-500">
          {String(m.shipment_type)} · {status} · {String(m.carrier_name || '—')}
          {customsStatus ? ` · Customs: ${customsStatus}` : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {status === 'open' && (
          <button
            type="button"
            onClick={() => void seal.mutateAsync()}
            className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950"
          >
            Seal cargo manifesto
          </button>
        )}
        {(status === 'sealed' || status === 'shipped' || status === 'arrived_ja') && (
          <button
            type="button"
            onClick={() => {
              setAwbOrBl(String(m.awb_or_bl || ''));
              setSubmitErr(null);
              setSubmitOpen(true);
            }}
            className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950"
          >
            {customsStatus === 'submitted' || customsStatus === 'hold' || customsStatus === 'cleared'
              ? 'Re-download Customs file'
              : 'Download & mark submitted for Customs'}
          </button>
        )}
        {status === 'sealed' && (
          <button
            type="button"
            onClick={() => void transition.mutateAsync('shipped')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            Mark shipped
          </button>
        )}
        {status === 'shipped' && (
          <button
            type="button"
            onClick={() => void transition.mutateAsync('arrived_ja')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            Arrived Jamaica
          </button>
        )}
      </div>
      {msg && <p className="text-sm text-emerald-800">{msg}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Lines ({(data.lines ?? []).length})</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(data.lines ?? []).map((line) => {
            const pkg = line.packages as Record<string, unknown> | null;
            const suite = pkg?.suites as { suite_code?: string } | null;
            return (
              <li key={String(line.id)} className="flex justify-between border-b border-slate-50 pb-2">
                <span>
                  #{String(line.line_number)} · {String(pkg?.courier_tracking_number || pkg?.id)} ·{' '}
                  {suite?.suite_code || '—'}
                </span>
                <span className="text-slate-500">{String(pkg?.status || '')}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {status === 'open' && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Add Miami-received packages</h2>
          <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
            {(miamiPkgs.data?.packages ?? []).map((p) => (
              <li key={String(p.id)}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(String(p.id))}
                    onChange={(e) => {
                      const pkgId = String(p.id);
                      setSelected((prev) =>
                        e.target.checked ? [...prev, pkgId] : prev.filter((x) => x !== pkgId),
                      );
                    }}
                  />
                  {String(p.courier_tracking_number || p.id)}
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!selected.length || addPkgs.isPending}
            onClick={() => void addPkgs.mutateAsync()}
            className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            Add selected
          </button>
        </section>
      )}

      {submitOpen && (
        <Overlay
          title="Submit for Customs"
          subtitle="Downloads the electronic cargo file and marks this manifesto submitted. Not a live ASYCUDA connection."
          onClose={() => setSubmitOpen(false)}
        >
          <div className="space-y-3">
            <div>
              <FieldLabel tip={FIELD_TIPS.awb}>AWB / BL (optional)</FieldLabel>
              <input
                value={awbOrBl}
                onChange={(e) => setAwbOrBl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Leave blank if you do not have it yet"
              />
            </div>
            <div>
              <FieldLabel tip={FIELD_TIPS.flightOrVoyage}>Flight / voyage (optional)</FieldLabel>
              <input
                value={flightOrVoyage}
                onChange={(e) => setFlightOrVoyage(e.target.value)}
                placeholder="e.g. M8 123 / vessel name"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <FieldLabel tip={FIELD_TIPS.brokerRef}>Broker reference (optional)</FieldLabel>
              <input
                value={brokerRef}
                onChange={(e) => setBrokerRef(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Only if your broker already gave you one"
              />
            </div>
            {submitErr && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitErr}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSubmitOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitBusy}
                onClick={() => void submitForCustoms()}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
              >
                {submitBusy ? 'Preparing…' : 'Download & mark submitted'}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
