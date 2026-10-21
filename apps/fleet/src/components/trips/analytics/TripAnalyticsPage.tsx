import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { formatJMD } from '../../../utils/formatJMD';
import { TripDetailsDialog } from '../TripDetailsDialog';
import type { Trip } from '../../../types/data';
import type { Vehicle as FleetVehicle } from '../../../types/vehicle';
import { useTripAnalytics } from '../../../hooks/useTripAnalytics';
import {
  defaultAnalyticsState,
  rangeForPreset,
  readAnalyticsState,
  writeAnalyticsState,
  type TripAnalyticsState,
} from './tripAnalyticsModel';
import { TripAnalyticsToolbar } from './TripAnalyticsToolbar';
import { TripAnalyticsCoverageStrip } from './TripAnalyticsCoverageStrip';
import { TripAnalyticsKpiGrid } from './TripAnalyticsKpiGrid';
import {
  TripAnalyticsCancellations,
  TripAnalyticsEconomics,
  TripAnalyticsHeatmap,
  TripAnalyticsVolume,
} from './TripAnalyticsCharts';
import { TripAnalyticsGeo } from './TripAnalyticsGeo';
import { TripAnalyticsAnomalies } from './TripAnalyticsAnomalies';
import { TripAnalyticsTable } from './TripAnalyticsTable';
import { RoamRideFunnel } from './RoamRideFunnel';
import { TripAnalyticsCost } from './TripAnalyticsCost';

export function TripAnalyticsPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [state, setState] = useState<TripAnalyticsState>(() => readAnalyticsState());
  const [page, setPage] = useState(1);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [selected, setSelected] = useState<Trip | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState('');
  const pageSize = 25;
  const { analytics, table, refresh } = useTripAnalytics(state, page, pageSize);

  useEffect(() => {
    writeAnalyticsState(state);
  }, [state]);

  const drivers = useQuery({
    queryKey: ['drivers', 'options'],
    queryFn: async () => {
      const rows = await api.getDrivers();
      return rows.map((d: { id: string; name?: string; driverName?: string }) => ({
        id: d.id,
        label: d.name || d.driverName || 'Unknown',
      }));
    },
  });
  const vehicles = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.getVehicles(),
  });
  const ledger = useQuery({
    queryKey: ['trip-analytics-ledger', state.from, state.to],
    queryFn: () => api.getLedgerSummary({ startDate: state.from, endDate: state.to }),
  });

  const payload = analytics.data || {};
  const errors = (payload.errors || {}) as Record<string, string>;
  const coverage = payload.coverage;
  const kpis = payload.kpis;
  const trips = (table.data?.data || []) as unknown as Record<string, unknown>[];
  const total = table.data?.total ?? trips.length;
  const zones = (payload.geo?.areas || []).map((row: { area: string }) => row.area);

  function update(next: TripAnalyticsState) {
    const ranged = next.preset === 'custom' ? null : rangeForPreset(next.preset);
    const merged = ranged ? { ...next, from: ranged.from, to: ranged.to } : next;
    setPage(1);
    setState(merged);
  }

  async function exportCsv() {
    setExporting(true);
    setExportNote('');
    try {
      const blob = await api.exportTripsFiltered({
        startDate: state.from,
        endDate: state.to,
        platform: state.platforms[0],
        platforms: state.platforms,
        driverId: state.driverId || undefined,
        vehicleId: state.vehicleId || undefined,
        status: state.status || undefined,
        paymentMethod: state.payment || undefined,
        zone: state.zone || undefined,
        tripType: state.tripType || undefined,
        hour: state.hour,
        dow: state.dow,
        limit: 10000,
        offset: 0,
      } as Parameters<typeof api.exportTripsFiltered>[0]);
      const text = await blob.text();
      const rows = text.trim() ? text.trim().split(/\r?\n/).length - 1 : 0;
      const expected = Math.min(total, 10000);
      setExportNote(rows === expected
        ? `Exported ${rows.toLocaleString()} trips.`
        : `Export has ${rows.toLocaleString()} rows. The table total is ${expected.toLocaleString()}.`);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `trip-analytics-${state.from}-${state.to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportNote(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const failedAll = analytics.isError && !analytics.data;
  const empty = !analytics.isLoading && !failedAll && coverage && coverage.total === 0;

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Trip Analytics</h2>
        <p className="text-sm text-slate-500">Platform-reported fares in Jamaica time. A dash means the platform did not send that number.</p>
      </div>
      <TripAnalyticsToolbar
        state={state}
        drivers={drivers.data || []}
        vehicles={(vehicles.data || []).map((v: { id: string; plateNumber?: string; licensePlate?: string }) => ({
          id: v.id,
          label: v.plateNumber || v.licensePlate || v.id,
        }))}
        zones={zones}
        onChange={update}
      />
      {analytics.isLoading ? <p className="text-sm text-slate-500">Loading this period…</p> : null}
      {failedAll ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">Trip Analytics could not load.</p>
          <p className="mt-1">{analytics.error instanceof Error ? analytics.error.message : 'Try again. This is not a zero result.'}</p>
          <button type="button" className="mt-3 min-h-11 rounded-lg bg-white px-3" onClick={() => analytics.refetch()}>Retry</button>
        </div>
      ) : null}
      {empty ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
          No trips in this range. Try Last 30 days.
          <div>
            <button type="button" className="mt-3 min-h-11 rounded-lg bg-indigo-600 px-3 text-white" onClick={() => update(defaultAnalyticsState())}>Last 30 days</button>
          </div>
        </div>
      ) : null}
      {!failedAll && !empty ? (
        <>
          {errors.coverage ? <SectionError title="Coverage" body={errors.coverage} onRetry={() => refresh()} /> : (
            <TripAnalyticsCoverageStrip coverage={coverage} open={coverageOpen} onToggle={() => setCoverageOpen((v) => !v)} />
          )}
          {errors.kpis ? <SectionError title="Summary cards" body={errors.kpis} onRetry={() => refresh()} /> : (
            <TripAnalyticsKpiGrid current={kpis?.current} prior={kpis?.prior} />
          )}
          {errors.volume ? <SectionError title="Demand" body={errors.volume} onRetry={() => refresh()} /> : <TripAnalyticsVolume volume={payload.volume} />}
          {errors.heatmap ? <SectionError title="Hour and day" body={errors.heatmap} onRetry={() => refresh()} /> : (
            <TripAnalyticsHeatmap
              heatmap={payload.heatmap}
              measure={state.measure}
              onMeasure={(measure) => update({ ...state, measure })}
              onPick={(dow, hour) => update({ ...state, dow, hour })}
            />
          )}
          {errors.cancellations ? <SectionError title="Cancellations" body={errors.cancellations} onRetry={() => refresh()} /> : (
            <TripAnalyticsCancellations
              data={payload.cancellations}
              onDriver={(driverId) => update({ ...state, driverId })}
            />
          )}
          {errors.economics ? <SectionError title="Trip economics" body={errors.economics} onRetry={() => refresh()} /> : (
            <TripAnalyticsEconomics data={payload.economics} />
          )}
          {errors.geo ? <SectionError title="Map" body={errors.geo} onRetry={() => refresh()} /> : (
            <TripAnalyticsGeo geo={payload.geo} onZone={(zone) => update({ ...state, zone })} />
          )}
          {errors.anomalies ? <SectionError title="Anomalies" body={errors.anomalies} onRetry={() => refresh()} /> : (
            <TripAnalyticsAnomalies
              data={payload.anomalies}
              onOpen={(tripId) => {
                const trip = trips.find((row) => String(row.id) === tripId);
                setSelected((trip as Trip) || ({ id: tripId } as Trip));
              }}
              onChanged={() => refresh()}
            />
          )}
          <TripAnalyticsCost
            from={state.from}
            to={state.to}
            km={kpis?.current?.avgDistance != null && kpis?.current?.completed != null
              ? Number(kpis.current.avgDistance) * Number(kpis.current.completed)
              : null}
            fee={kpis?.current?.platformFee != null ? Number(kpis.current.platformFee) : null}
            vehicles={(vehicles.data || []) as FleetVehicle[]}
          />
          {errors.funnel ? <SectionError title="Roam rider app" body={errors.funnel} onRetry={() => refresh()} /> : (
            <RoamRideFunnel funnel={payload.funnel} />
          )}
          <TripAnalyticsTable
            trips={trips}
            total={total}
            page={page}
            pageSize={pageSize}
            loading={table.isLoading}
            onPage={setPage}
            onOpen={(trip) => setSelected(trip as unknown as Trip)}
            onExport={exportCsv}
            exporting={exporting}
          />
          {exportNote ? <p className="text-sm text-slate-600">{exportNote}</p> : null}
          {table.isError ? <SectionError title="Trip list" body={table.error instanceof Error ? table.error.message : 'The list failed. The cards above are unchanged.'} onRetry={() => table.refetch()} /> : null}
          <p className="text-sm text-slate-500">
            Ledger net for this period:{' '}
            {ledger.isError || ledger.data?.summary?.netBalance == null
              ? '—'
              : formatJMD(Number(ledger.data.summary.netBalance), 0)}
            . This is the books, not the platform fare.
            <button type="button" className="ml-2 min-h-11 text-indigo-700" onClick={() => onNavigate?.('transaction-list')}>Open ledgers</button>
          </p>
        </>
      ) : null}
      <TripDetailsDialog
        trip={selected}
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        onOpenLogs={() => onNavigate?.('trips')}
      />
    </div>
  );
}

function SectionError({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p className="font-semibold">{title} could not load.</p>
      <p className="mt-1">{body} This is not a zero.</p>
      <button type="button" className="mt-3 min-h-11 rounded-lg bg-white px-3" onClick={onRetry}>Retry</button>
    </div>
  );
}
