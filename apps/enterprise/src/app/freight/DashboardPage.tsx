import { type ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { useFreightDashboard } from '@/app/hooks/useFreight';
import { useModuleAccess } from '@/app/modules/ModuleAccessProvider';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import { freightService } from '@/app/services/freightService';
import { formatOldestLabel } from '@/app/freight/formatRelativeAge';
import { NeedsYouStrip } from '@/app/freight/os/NeedsYouStrip';
import { LANE_TILES, PIPELINE_FUNNEL } from '@/app/freight/os/mockData';

const STATUS_ORDER = [
  'draft',
  'booked',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
  'cancelled',
] as const;

/** Funnel key → work screen + seat module required to open it. */
const FUNNEL_LINKS: Record<string, { to: string; module: string; actionLabel?: string }> = {
  expected: {
    to: '/app/packages?tab=expected',
    module: 'freight_mailbox_packages',
    actionLabel: 'Review pre-alerts',
  },
  received_at_warehouse: {
    to: '/app/packages',
    module: 'freight_mailbox_packages',
    actionLabel: 'Open packages',
  },
  manifested: {
    to: '/app/manifests',
    module: 'freight_manifests',
    actionLabel: 'Open manifests',
  },
  in_transit_intl: {
    to: '/app/manifests',
    module: 'freight_manifests',
    actionLabel: 'Track transit',
  },
  customs_hold: {
    to: '/app/customs?tab=lanes',
    module: 'freight_customs_board',
    actionLabel: 'Work customs hold',
  },
  customs_cleared: {
    to: '/app/customs?tab=lanes',
    module: 'freight_customs_board',
    actionLabel: 'View cleared',
  },
  received_hub: {
    to: '/app/hub',
    module: 'freight_hub_station',
    actionLabel: 'Mark ready on hub',
  },
  ready_for_fulfillment: {
    to: '/app/fulfillment',
    module: 'freight_fulfillment',
    actionLabel: 'Assign last mile',
  },
  delivered: {
    to: '/app/fulfillment',
    module: 'freight_fulfillment',
    actionLabel: 'View delivered',
  },
  exception: {
    to: '/app/packages?tab=needs-invoice',
    module: 'freight_invoice_audit',
    actionLabel: 'Resolve exceptions',
  },
};

const LANE_LINK = { to: '/app/customs?tab=lanes', module: 'freight_customs_board' };
const DUTY_LINK = { to: '/app/billing', module: 'freight_billing' };
const EXCEPTION_LINK = {
  to: '/app/packages',
  module: 'freight_mailbox_packages',
};

function TileShell({
  to,
  clickable,
  className,
  children,
}: {
  to?: string;
  clickable: boolean;
  className: string;
  children: ReactNode;
}) {
  if (clickable && to) {
    return (
      <Link to={to} className={`${className} transition hover:ring-2 hover:ring-amber-300`}>
        {children}
      </Link>
    );
  }
  return <div className={className}>{children}</div>;
}

function hrefAllowed(
  href: string,
  canOpen: (module: string) => boolean,
): boolean {
  if (href.includes('needs-invoice')) return canOpen('freight_invoice_audit');
  if (href.startsWith('/app/packages')) return canOpen('freight_mailbox_packages');
  if (href.startsWith('/app/customs')) return canOpen('freight_customs_board');
  if (href.startsWith('/app/billing')) return canOpen('freight_billing');
  if (href.startsWith('/app/hub')) return canOpen('freight_hub_station');
  if (href.startsWith('/app/fulfillment')) return canOpen('freight_fulfillment');
  if (href.startsWith('/app/manifests')) return canOpen('freight_manifests');
  return true;
}

/** Unified /app home — mailbox funnel + domestic shipments strip. */
export function DashboardPage() {
  const { organizationId, session } = useAuth();
  const { isModuleEnabled } = useModuleAccess();
  const { canAccessModule } = useSeatAccess();

  const canSeePipeline =
    isModuleEnabled('freight_pipeline_command') && canAccessModule('freight_pipeline_command');
  const canSeeShipments =
    isModuleEnabled('freight_shipments') && canAccessModule('freight_shipments');

  const canOpen = (module: string) => isModuleEnabled(module) && canAccessModule(module);

  const pipelineQ = useQuery({
    queryKey: ['freight', 'pipeline-command', organizationId],
    queryFn: () => freightService.pipelineCommand(organizationId),
    enabled: Boolean(session) && canSeePipeline,
  });

  const shipmentsQ = useFreightDashboard();
  const shipmentData = canSeeShipments ? shipmentsQ.data : undefined;

  const counts = pipelineQ.data?.counts ?? {};
  const dutyJmd = pipelineQ.data?.dutyOutstandingJmdMinor;
  const oldestByStatus = pipelineQ.data?.oldestByStatus ?? {};
  const needsYou = useMemo(
    () =>
      (pipelineQ.data?.needsYou ?? []).filter((item) =>
        hrefAllowed(item.href, canOpen),
      ),
    // canOpen identity changes each render — gate on module flags + data
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pipelineQ.data?.needsYou, isModuleEnabled, canAccessModule],
  );
  const hasLive = Boolean(pipelineQ.data);
  const attentionCount = needsYou.reduce((a, i) => a + i.count, 0);

  const funnelTiles = useMemo(() => {
    return [...PIPELINE_FUNNEL].sort((a, b) => {
      const av = counts[a.key] ?? 0;
      const bv = counts[b.key] ?? 0;
      if (av === 0 && bv > 0) return 1;
      if (bv === 0 && av > 0) return -1;
      return 0;
    });
  }, [counts]);

  const leadNeed = needsYou[0];
  const primaryCta =
    leadNeed && (leadNeed.key === 'needs_invoice' || leadNeed.key === 'expected')
      ? leadNeed
      : null;

  if (!canSeePipeline && !canSeeShipments) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
          <p className="mt-1 text-sm text-slate-500">No overview modules enabled for this seat.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            {attentionCount > 0
              ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} need you`
              : 'Jamaica intl mailbox funnel · click any tile to jump to work'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canOpen('freight_mailbox_packages') && (
            <Link
              to="/app/packages"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
            >
              Packages
            </Link>
          )}
          {primaryCta ? (
            <Link
              to={primaryCta.href}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              {primaryCta.actionLabel}
            </Link>
          ) : null}
          {canOpen('freight_manifests') && (
            <Link
              to="/app/manifests"
              className={
                primaryCta
                  ? 'rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50'
                  : 'rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400'
              }
            >
              New Manifest
            </Link>
          )}
          {!canOpen('freight_manifests') && canOpen('freight_shipments') && !primaryCta && (
            <Link
              to="/app/shipments/new"
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              New shipment
            </Link>
          )}
        </div>
      </div>

      {canSeePipeline && (
        <section className="space-y-6">
          {pipelineQ.isLoading && <p className="text-sm text-slate-500">Loading pipeline…</p>}
          {pipelineQ.error && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Live counts unavailable — showing zeros.{' '}
              {(pipelineQ.error as Error).message}
            </p>
          )}

          {!pipelineQ.isLoading && (
            <NeedsYouStrip
              items={needsYou}
              canOpenHref={(href) => hrefAllowed(href, canOpen)}
              showCreatePreAlert={canOpen('freight_mailbox_packages')}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {funnelTiles.map((tile) => {
              const dest = FUNNEL_LINKS[tile.key];
              const clickable = dest ? canOpen(dest.module) : false;
              const value = counts[tile.key] ?? 0;
              const quiet = value === 0;
              const oldest = formatOldestLabel(oldestByStatus[tile.key]);
              const hotException = tile.key === 'exception' && value > 0;
              return (
                <TileShell
                  key={tile.key}
                  to={dest?.to}
                  clickable={clickable}
                  className={`rounded-xl border px-4 py-3 ${
                    quiet
                      ? 'border-slate-100 bg-slate-50/80 opacity-50'
                      : hotException
                        ? 'border-red-200 bg-red-50'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {tile.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
                  {!quiet && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {oldest ?? 'Ready'}
                      {dest?.actionLabel ? ` · ${dest.actionLabel}` : ''}
                    </p>
                  )}
                </TileShell>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LANE_TILES.map((lane) => {
              const clickable = canOpen(LANE_LINK.module);
              const value = hasLive
                ? lane.id === 'green'
                  ? (counts.customs_cleared ?? 0)
                  : lane.id === 'yellow' || lane.id === 'red'
                    ? (counts.customs_hold ?? 0)
                    : 0
                : 0;
              const quiet = value === 0;
              return (
                <TileShell
                  key={lane.id}
                  to={LANE_LINK.to}
                  clickable={clickable}
                  className={`rounded-xl border px-4 py-3 ${
                    quiet
                      ? 'border-slate-100 bg-slate-50/80 opacity-50'
                      : lane.tone === 'green'
                        ? 'border-green-200 bg-green-50'
                        : lane.tone === 'amber'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-red-200 bg-red-50'
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                    {lane.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
                </TileShell>
              );
            })}
            <TileShell
              to={DUTY_LINK.to}
              clickable={canOpen(DUTY_LINK.module)}
              className={`rounded-xl border px-4 py-3 ${
                !dutyJmd
                  ? 'border-slate-100 bg-slate-50/80 opacity-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Duty outstanding
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {dutyJmd != null ? `J$${(dutyJmd / 100).toLocaleString()}` : 'J$—'}
              </p>
              {dutyJmd ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatOldestLabel(pipelineQ.data?.oldestDutyAt) ?? 'Review billing'}
                </p>
              ) : null}
            </TileShell>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Exceptions</h2>
              {canOpen(EXCEPTION_LINK.module) && (counts.exception ?? 0) > 0 && (
                <Link
                  to={EXCEPTION_LINK.to}
                  className="text-xs font-medium text-amber-800 underline"
                >
                  Resolve exceptions
                </Link>
              )}
            </div>
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              {(counts.exception ?? 0) === 0 || !hasLive ? (
                <p>No open exceptions</p>
              ) : (
                <p>
                  {counts.exception} package{counts.exception === 1 ? '' : 's'} in exception
                  {canOpen(EXCEPTION_LINK.module) ? (
                    <>
                      {' — '}
                      <Link to={EXCEPTION_LINK.to} className="font-medium text-amber-800 underline">
                        open packages
                      </Link>
                    </>
                  ) : null}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {canSeeShipments && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Domestic shipments</h2>
              <p className="mt-0.5 text-xs text-slate-500">Jamaica local lane counts</p>
            </div>
            <Link
              to="/app/domestic"
              className="text-xs font-medium text-amber-800 underline"
            >
              Open shipments
            </Link>
          </div>

          {shipmentsQ.isLoading && canSeeShipments && (
            <p className="text-sm text-slate-500">Loading shipments…</p>
          )}
          {shipmentsQ.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {(shipmentsQ.error as Error).message}
            </p>
          )}

          {!shipmentsQ.isLoading && !shipmentsQ.error && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {STATUS_ORDER.map((status) => {
                  const value = shipmentData?.counts?.[status] ?? 0;
                  const quiet = value === 0;
                  return (
                    <Link
                      key={status}
                      to="/app/domestic"
                      className={`rounded-xl border px-4 py-3 transition hover:ring-2 hover:ring-amber-300 ${
                        quiet
                          ? 'border-slate-100 bg-slate-50/80 opacity-50'
                          : status === 'exception'
                            ? 'border-red-200 bg-red-50'
                            : 'border-slate-200 bg-white'
                      }`}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {status.replace(/_/g, ' ')}
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
                    </Link>
                  );
                })}
              </div>
              {(shipmentData?.exceptions ?? 0) > 0 && (
                <p className="text-sm font-medium text-red-700">
                  {shipmentData?.exceptions} shipment(s) in exception — review the shipments list.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
