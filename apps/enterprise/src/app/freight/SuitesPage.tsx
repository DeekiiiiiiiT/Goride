import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Upload, UserPlus, X, Check } from 'lucide-react';
import { useCreateSuite, useFacilities, useFreightClients, useSuites } from '@/app/hooks/useFreight';
import { SuiteCsvImportPanel } from '@/app/freight/SuiteCsvImportPanel';

type OverlayMode = 'import' | 'import-success' | 'create' | null;

function SuitesOverlay({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
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
        aria-labelledby="suites-overlay-title"
        className={`relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-xl ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="suites-overlay-title" className="text-base font-semibold text-slate-900">
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

export function SuitesPage() {
  const { data, isLoading, error } = useSuites();
  const clients = useFreightClients();
  const allFacilities = useFacilities();
  const facilities = useFacilities('branch');
  const branchFacilities = useMemo(
    () => facilities.data?.facilities ?? [],
    [facilities.data?.facilities],
  );
  const needsFacilitiesSetup =
    !allFacilities.isLoading && (allFacilities.data?.facilities?.length ?? 0) === 0;
  const create = useCreateSuite();
  const [formError, setFormError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayMode>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  // Auto-dismiss CSV import success overlay
  useEffect(() => {
    if (overlay !== 'import-success') return;
    const t = window.setTimeout(() => {
      setOverlay(null);
      setImportSuccessMsg(null);
    }, 2800);
    return () => window.clearTimeout(t);
  }, [overlay]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await create.mutateAsync({
        clientId: (fd.get('clientId') as string) || null,
        suiteCode: (fd.get('suiteCode') as string) || undefined,
        contactName: fd.get('contactName') || null,
        contactPhone: fd.get('contactPhone') || null,
        contactEmail: fd.get('contactEmail') || null,
        trn: fd.get('trn') || null,
        defaultFulfillmentMode: fd.get('defaultFulfillmentMode') || 'pickup',
        defaultAssigneeType: fd.get('defaultAssigneeType') || 'org_fleet',
        defaultPickupFacilityId: (fd.get('defaultPickupFacilityId') as string) || null,
        deliveryAddress: fd.get('deliveryAddress') || null,
      });
      form.reset();
      setOverlay(null);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Suites</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            This is your customer list. Each row is a mailbox customer (a “suite”) with their own
            mailbox code. Add people here before you receive their packages.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOverlay('import')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setOverlay('create');
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            <UserPlus className="h-4 w-4" />
            Add customer
          </button>
        </div>
      </div>

      {needsFacilitiesSetup && (
        <div
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <p className="font-semibold">Facilities required before you continue</p>
          <p className="mt-1 text-amber-900/90">
            You must set up at least one facility (warehouse, hub, or branch) before receiving
            packages for these customers.
          </p>
          <Link
            to="/app/facilities"
            className="mt-3 inline-flex rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            Set up Facilities now
          </Link>
        </div>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Suite</th>
              <th className="px-4 py-2">Contact</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Fulfillment</th>
              <th className="px-4 py-2">Fleet default</th>
            </tr>
          </thead>
          <tbody>
            {(data?.suites ?? []).map((s) => (
              <tr key={String(s.id)} className="border-b border-slate-50">
                <td className="px-4 py-2 font-medium">{String(s.suite_code)}</td>
                <td className="px-4 py-2">{String(s.contact_name || '—')}</td>
                <td className="px-4 py-2">{String(s.contact_phone || '—')}</td>
                <td className="px-4 py-2">{String(s.default_fulfillment_mode).replace(/_/g, ' ')}</td>
                <td className="px-4 py-2">{String(s.default_assignee_type).replace(/_/g, ' ')}</td>
              </tr>
            ))}
            {!isLoading && !(data?.suites ?? []).length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No customers yet — click Add customer or Import CSV.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {overlay === 'import' && (
        <SuitesOverlay
          title="Import customers (CSV)"
          subtitle="Upload mailbox codes from your freight site. Re-import updates matching suite codes."
          onClose={() => setOverlay(null)}
          wide
        >
          <SuiteCsvImportPanel
            embedded
            onSuccess={(message) => {
              setImportSuccessMsg(message);
              setOverlay('import-success');
            }}
          />
        </SuitesOverlay>
      )}

      {overlay === 'import-success' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="presentation"
          onClick={() => {
            setOverlay(null);
            setImportSuccessMsg(null);
          }}
        >
          <div className="absolute inset-0 bg-slate-900/40" aria-hidden />
          <div
            role="status"
            className="relative z-10 w-full max-w-sm rounded-xl border border-emerald-200 bg-white px-6 py-8 text-center shadow-xl"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">Import complete</h2>
            <p className="mt-2 text-sm text-slate-600">
              {importSuccessMsg || 'Customers were added successfully.'}
            </p>
            <p className="mt-4 text-xs text-slate-400">Closes automatically — or click anywhere</p>
          </div>
        </div>
      )}

      {overlay === 'create' && (
        <SuitesOverlay
          title="Add customer"
          subtitle="Create one mailbox customer (suite) with their contact details and delivery defaults."
          onClose={() => setOverlay(null)}
          wide
        >
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Suite code (blank = auto)
                <input
                  name="suiteCode"
                  placeholder="JA-1042"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                Client
                <select name="clientId" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="">— Optional —</option>
                  {(clients.data?.clients ?? []).map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {String(c.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Contact name
                <input name="contactName" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="block text-sm">
                Phone (SMS)
                <input
                  name="contactPhone"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                Email
                <input
                  name="contactEmail"
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                TRN
                <input name="trn" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="block text-sm">
                Default fulfillment
                <select
                  name="defaultFulfillmentMode"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="pickup">Branch pickup</option>
                  <option value="door_delivery">Door delivery</option>
                </select>
              </label>
              <label className="block text-sm">
                Default fleet
                <select
                  name="defaultAssigneeType"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="org_fleet">Org fleet</option>
                  <option value="roam_marketplace">Auto-dispatch (org drivers)</option>
                  <option value="client_fleet">Client fleet</option>
                  <option value="third_party">3PL</option>
                </select>
              </label>
              <label className="block text-sm">
                Pickup branch
                <select
                  name="defaultPickupFacilityId"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">— Optional —</option>
                  {branchFacilities.map((f) => (
                    <option key={String(f.id)} value={String(f.id)}>
                      {String(f.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                Delivery address
                <input
                  name="deliveryAddress"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            {formError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
            >
              {create.isPending ? 'Saving…' : 'Create suite'}
            </button>
          </form>
        </SuitesOverlay>
      )}
    </div>
  );
}
