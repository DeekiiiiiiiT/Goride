import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  PackageDutyChrome,
  PackageSummaryPanel,
} from '@/app/freight/os/packageDuty/PackageDutyChrome';
import { InvoiceComparePanel } from '@/app/freight/os/packageDuty/InvoiceComparePanel';
import { DutyPanel } from '@/app/freight/os/packageDuty/DutyPanel';
import { CustodyTimelinePanel } from '@/app/freight/os/packageDuty/CustodyTimelinePanel';
import { PackageMissionRibbon } from '@/app/freight/os/packageDuty/PackageMissionRibbon';
import { usePackageDutyDetail } from '@/app/freight/os/packageDuty/usePackageDutyDetail';
import {
  derivePackageMission,
  type PackageMissionStageId,
} from '@/app/freight/os/packageMissionStages';

function StageAccordion({
  id,
  title,
  summary,
  done,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        id={`stage-${id}`}
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                done
                  ? 'bg-emerald-100 text-emerald-800'
                  : open
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {done ? '✓' : open ? '•' : ''}
            </span>
            {title}
          </p>
          <p className="mt-0.5 pl-7 text-xs text-slate-500">{summary}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? <div className="border-t border-slate-100 px-4 py-4">{children}</div> : null}
    </section>
  );
}

/** Package Detail — mission-control: sticky ribbon + staged checklist. */
export function PackageDutyDetailPage() {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const [params, setParams] = useSearchParams();
  const initialId = routeId || params.get('id') || '';
  const [packageId, setPackageId] = useState(initialId);
  const [openStage, setOpenStage] = useState<PackageMissionStageId | 'timeline' | null>(null);

  const d = usePackageDutyDetail(packageId);

  useEffect(() => {
    const fromRoute = routeId || null;
    const fromUrl = params.get('id');
    const next = fromRoute || fromUrl;
    if (next && next !== packageId) setPackageId(next);
  }, [routeId, params, packageId]);

  useEffect(() => {
    if (!packageId && d.packages.data?.packages?.[0]) {
      const id = String(d.packages.data.packages[0].id);
      setPackageId(id);
      if (routeId) {
        navigate(`/app/packages/${id}`, { replace: true });
      } else {
        setParams({ id }, { replace: true });
      }
    }
  }, [d.packages.data, packageId, setParams, routeId, navigate]);

  const mission = useMemo(
    () =>
      derivePackageMission(
        d.pkg,
        d.duty as Record<string, unknown> | null,
        d.scanEvents,
        d.invoices,
      ),
    [d.pkg, d.duty, d.scanEvents, d.invoices],
  );

  useEffect(() => {
    if (packageId) setOpenStage(mission.currentStageId);
  }, [packageId, mission.currentStageId]);

  function selectPackage(next: string) {
    setPackageId(next);
    if (routeId) {
      navigate(`/app/packages/${next}`, { replace: true });
    } else {
      setParams({ id: next });
    }
  }

  function toggleStage(id: PackageMissionStageId | 'timeline') {
    setOpenStage((prev) => (prev === id ? null : id));
  }

  const issuedInvoice = d.invoices[0];
  const status = String(d.pkg?.status ?? '');

  return (
    <div className="space-y-4">
      <PackageDutyChrome
        packageId={packageId}
        pkgOptions={d.packages.data?.packages ?? []}
        pkg={d.pkg}
        onSelect={selectPackage}
      />

      {!packageId && (
        <p className="text-sm text-slate-500">No packages yet — receive or create one first.</p>
      )}

      {d.detail.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(d.detail.error as Error).message}
        </p>
      )}

      {d.pkg && (
        <>
          <PackageMissionRibbon
            trackingLabel={String(
              d.pkg.courier_tracking_number || 'No tracking yet',
            ).slice(0, 40)}
            statusLabel={status.replace(/_/g, ' ')}
            mission={mission}
          />

          <div className="space-y-2">
            <StageAccordion
              id="receive"
              title="Receive"
              summary={mission.stages[0].summary}
              done={mission.stages[0].done}
              open={openStage === 'receive'}
              onToggle={() => toggleStage('receive')}
            >
              <PackageSummaryPanel
                key={String(d.pkg.id ?? packageId)}
                pkg={d.pkg}
                suite={d.suite}
                savingTracking={d.applyInvoiceFill.isPending}
                onSaveTracking={(tracking) =>
                  d.applyInvoiceFill.mutate({ courierTrackingNumber: tracking || null })
                }
              />
              {!mission.stages[0].done && (
                <p className="mt-3 text-sm text-slate-600">
                  Still expected — receive at{' '}
                  <Link to="/app/receive" className="font-medium text-amber-800 underline">
                    US Intake
                  </Link>{' '}
                  to advance this stage.
                </p>
              )}
            </StageAccordion>

            <StageAccordion
              id="invoice"
              title="Invoice"
              summary={mission.stages[1].summary}
              done={mission.stages[1].done}
              open={openStage === 'invoice'}
              onToggle={() => toggleStage('invoice')}
            >
              <InvoiceComparePanel
                packageId={packageId}
                pkg={d.pkg}
                hasCustomerInvoice={d.hasCustomerInvoice}
                hasWarehouseSlip={d.hasWarehouseSlip}
                requiredFromCustomer={d.requiredFromCustomer}
                unobtainable={d.unobtainable}
                note={d.note}
                setNote={d.setNote}
                unobtainableNote={d.unobtainableNote}
                setUnobtainableNote={d.setUnobtainableNote}
                parseReading={d.parseReading}
                invoiceSuggestion={d.invoiceSuggestion}
                setInvoiceSuggestion={d.setInvoiceSuggestion}
                uploadPending={d.uploadInvoice.isPending}
                verifyPending={d.verify.isPending}
                flagsPending={d.invoiceFlags.isPending}
                applyPending={d.applyInvoiceFill.isPending}
                applyError={d.applyInvoiceFill.error as Error | null}
                verifyError={d.verify.error as Error | null}
                uploadError={d.uploadInvoice.error as Error | null}
                flagsError={d.invoiceFlags.error as Error | null}
                onUpload={(file, slot) => void d.handleInvoiceUpload(file, slot)}
                onApplyFill={d.applyParsedInvoiceFields}
                onVerify={() => d.verify.mutate()}
                onToggleRequired={() =>
                  d.invoiceFlags.mutate({
                    invoiceRequiredFromCustomer: !d.requiredFromCustomer,
                  })
                }
                onMarkUnobtainable={() =>
                  d.invoiceFlags.mutate({
                    invoiceUnobtainable: true,
                    unobtainableNote: d.unobtainableNote || null,
                  })
                }
                onClearUnobtainable={() =>
                  d.invoiceFlags.mutate({ invoiceUnobtainable: false })
                }
              />
            </StageAccordion>

            <StageAccordion
              id="duty"
              title="Duty"
              summary={mission.stages[2].summary}
              done={mission.stages[2].done}
              open={openStage === 'duty'}
              onToggle={() => toggleStage('duty')}
            >
              <DutyPanel
                dutyView={d.dutyView}
                computePending={d.compute.isPending}
                computeError={d.compute.error as Error | null}
                onRecalculate={() => d.compute.mutate()}
              />
            </StageAccordion>

            <StageAccordion
              id="bill"
              title="Bill"
              summary={mission.stages[3].summary}
              done={mission.stages[3].done}
              open={openStage === 'bill'}
              onToggle={() => toggleStage('bill')}
            >
              {issuedInvoice ? (
                <div className="space-y-2 text-sm">
                  <p className="text-slate-700">
                    Consolidated invoice{' '}
                    <span className="font-mono font-semibold">
                      {String(issuedInvoice.invoice_number ?? issuedInvoice.id)}
                    </span>{' '}
                    · {String(issuedInvoice.status ?? 'issued')}
                  </p>
                  <Link
                    to={`/app/billing?packageId=${encodeURIComponent(packageId)}`}
                    className="inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                  >
                    Open in Billing
                  </Link>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="text-slate-600">
                    No consolidated invoice yet. Generate from duty + courier fees.
                  </p>
                  <Link
                    to={`/app/billing?packageId=${encodeURIComponent(packageId)}&autogenerate=1`}
                    className="inline-flex rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                  >
                    Generate invoice
                  </Link>
                </div>
              )}
            </StageAccordion>

            <StageAccordion
              id="clear"
              title="Clear"
              summary={mission.stages[4].summary}
              done={mission.stages[4].done}
              open={openStage === 'clear'}
              onToggle={() => toggleStage('clear')}
            >
              <p className="text-sm text-slate-600">
                Status: <span className="font-medium">{status.replace(/_/g, ' ') || '—'}</span>
              </p>
              <Link
                to="/app/customs?tab=lanes"
                className="mt-3 inline-flex rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                Open Customs lanes
              </Link>
            </StageAccordion>

            <StageAccordion
              id="deliver"
              title="Deliver"
              summary={mission.stages[5].summary}
              done={mission.stages[5].done}
              open={openStage === 'deliver'}
              onToggle={() => toggleStage('deliver')}
            >
              <p className="text-sm text-slate-600">
                Status: <span className="font-medium">{status.replace(/_/g, ' ') || '—'}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/app/hub"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                >
                  Hub station
                </Link>
                <Link
                  to="/app/fulfillment"
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                >
                  Last mile
                </Link>
              </div>
            </StageAccordion>

            <StageAccordion
              id="timeline"
              title="Timeline"
              summary="Custody scan history"
              done={d.scanEvents.length > 0}
              open={openStage === 'timeline'}
              onToggle={() => toggleStage('timeline')}
            >
              <CustodyTimelinePanel scanEvents={d.scanEvents} />
            </StageAccordion>
          </div>
        </>
      )}
    </div>
  );
}
