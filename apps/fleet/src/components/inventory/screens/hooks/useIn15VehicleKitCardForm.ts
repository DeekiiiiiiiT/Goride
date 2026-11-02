import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { useInScreenBase } from './useInShared';

export function useIn15VehicleKitCardForm(vehicleId?: string | null) {
  const base = useInScreenBase();
  const { shell, submit, live } = base;
  const vehicle =
    live.kitVehicles.find((v) => v.vehicleId === vehicleId) ?? live.primaryVehicle;

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

  return {
    ...base,
    shell,
    submit,
    live,
    vehicle,
    issueKit,
    issueItem,
    returnItem,
    reportProblem,
    missingCount,
    bookMaintenance,
    focusVehicleKits,
    strField,
  };
}
