import { useMemo } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { buildVehicleKitCardRow } from '../../inventoryViewRows';
import type { VehicleKitCardItemRow, VehicleKitCardRow } from '../../inventoryTypes';
import { useInScreenBase } from './useInShared';

/**
 * Stitch → data (In15 Vehicle kit card)
 * plate → VehicleKitCardRow.plate | completeness → VehicleKitCardRow.pctLabel | sku → VehicleKitCardRow.itemSku
 */
export function useIn15VehicleKitCardForm(vehicleId?: string | null) {
  const base = useInScreenBase();
  const { shell, submit, live } = base;
  const vehicle =
    live.kitVehicles.find((v) => v.vehicleId === vehicleId) ?? live.primaryVehicle;

  const kitItemRows: VehicleKitCardRow[] = useMemo(() => {
    if (!vehicle?.vehicleId) return [];
    const rows = shell.kitComplianceRows.filter(
      (r) => strField(r, 'vehicle_id', '') === vehicle.vehicleId,
    );
    return rows.map((r) =>
      buildVehicleKitCardRow(
        {
          vehicleId: vehicle.vehicleId,
          plate: vehicle.plate,
          pct: vehicle.pct,
          missingLabels: vehicle.missingLabels,
        },
        strField(r, 'sku', strField(r, 'item_sku', '—')),
        strField(r, 'name', strField(r, 'item_name', '—')),
      ),
    );
  }, [shell.kitComplianceRows, vehicle]);

  const kitCardItemRows: VehicleKitCardItemRow[] = useMemo(() => {
    if (!vehicle?.vehicleId) return [];
    return shell.kitComplianceRows
      .filter((r) => strField(r, 'vehicle_id', '') === vehicle.vehicleId)
      .map((r) => {
        const status = strField(r, 'status', '').toLowerCase();
        return {
          itemId: strField(r, 'item_id', ''),
          name: strField(r, 'name', strField(r, 'item_name', '—')),
          sku: strField(r, 'sku', strField(r, 'item_sku', '—')),
          isMissing: status.includes('missing') || status.includes('short'),
          locationLabel: strField(r, 'location_hint', strField(r, 'location', '—')),
          statusLabel: strField(r, 'status_label', strField(r, 'status', '—')),
          stockHint: strField(r, 'stock_hint', strField(r, 'storeroom_hint', '')),
          serialLabel: strField(r, 'serial_label', strField(r, 'serial', '')),
        };
      });
  }, [shell.kitComplianceRows, vehicle?.vehicleId]);

  const missingKitRows = useMemo(
    () => kitCardItemRows.filter((r) => r.isMissing),
    [kitCardItemRows],
  );
  const onCarKitRows = useMemo(
    () => kitCardItemRows.filter((r) => !r.isMissing),
    [kitCardItemRows],
  );

  const odometerLabel = useMemo(() => {
    const km = strField(vehicle ?? {}, 'odometer_km', strField(vehicle ?? {}, 'odometer', ''));
    if (km && km !== '—') return km.includes('km') ? km : `${km} km`;
    return '—';
  }, [vehicle]);

  const kitProgressLabel = vehicle?.pct != null ? `${vehicle.pct}%` : '—';

  const issueKit = () => shell.openModal('issue');

  const issueItem = (itemId: string) =>
    submit.run(async () => {
      if (!vehicle?.vehicleId) throw new Error('No vehicle');
      await inventoryApi.issue(
        {
          vehicle_ids: [vehicle.vehicleId],
          issue_available_only: true,
          lines: [{ item_id: itemId, qty: 1 }],
        },
        newInventoryIdempotencyKey('kit-card-issue'),
      );
      await shell.refresh();
    });

  const returnItem = (itemId: string) =>
    submit.run(async () => {
      if (!vehicle?.vehicleId) throw new Error('No vehicle');
      const loc = shell.stockRows.find((r) => strField(r, 'item_id', '') === itemId);
      await inventoryApi.returnStock(
        {
          item_id: itemId,
          vehicle_id: vehicle.vehicleId,
          to_location_id: strField(loc ?? {}, 'location_id', ''),
          qty: 1,
        },
        newInventoryIdempotencyKey('kit-return'),
      );
      await shell.refresh();
    });

  const reportProblem = (itemId?: string) => {
    if (itemId) shell.setSelectedItemId(itemId);
    shell.openGap('driver-report-update', { reportId: null });
  };

  const missingCount =
    (vehicle?.missingLines ?? 0) + (vehicle?.shortLines ?? 0);

  const issueKitDisabledReason = vehicle?.vehicleId ? '' : 'No vehicle selected for this kit card';

  const bookMaintenance = () => {
    const vid = vehicle?.vehicleId;
    if (!vid) return;
    const url = new URL('/maintenance', window.location.origin);
    url.searchParams.set('tab', 'work-orders');
    url.searchParams.set('vehicle_id', vid);
    window.location.assign(url.pathname + url.search);
  };

  const focusVehicleKits = () => {
    if (vehicle?.vehicleId) shell.setSelectedItemId(vehicle.vehicleId);
    shell.setTab('vehicle-kits');
  };

  const assignedDriverLabel = useMemo(() => {
    const row = shell.kitComplianceRows.find(
      (r) => strField(r, 'vehicle_id', '') === (vehicle?.vehicleId ?? ''),
    );
    const driver = strField(row ?? {}, 'driver_name', strField(row ?? {}, 'assigned_driver', ''));
    const hub = strField(row ?? {}, 'hub_name', strField(row ?? {}, 'home_base', ''));
    if (driver && hub) return `${driver} · ${hub}`;
    if (driver) return driver;
    if (hub) return hub;
    return '—';
  }, [shell.kitComplianceRows, vehicle?.vehicleId]);

  return {
    ...base,
    shell,
    submit,
    live,
    vehicle,
    kitItemRows,
    kitCardItemRows,
    missingKitRows,
    onCarKitRows,
    odometerLabel,
    kitProgressLabel,
    issueKit,
    issueItem,
    returnItem,
    reportProblem,
    missingCount,
    issueKitDisabledReason,
    bookMaintenance,
    focusVehicleKits,
    assignedDriverLabel,
    strField,
  };
}
