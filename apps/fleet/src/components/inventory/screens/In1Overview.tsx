/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn1OverviewForm } from './hooks/useIn1OverviewForm';
import { InventoryOverflowMenu } from '../InventoryOverflowMenu';
import { InventoryPrimaryTabs } from '../InventoryPrimaryTabs';
import { useInventoryLive } from '../inventoryLive';
import { firstVendorName, strField } from '../inventoryData';
import { useInventoryShell } from '../InventoryShellContext';

export function In1Overview() {
  const form = useIn1OverviewForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">
      <div className="max-w-[1440px] w-full mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
      <div className="flex flex-col gap-space-xs">
      <div className="flex items-center gap-space-md">
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">
                  Inventory & Asset Management
                </h1>
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant">
                What you have, where it is, and what every car is missing.
              </p>
      <div className="flex items-center gap-space-xs mt-space-xs">
      <span className="relative flex h-2 w-2">
      {live.chainCheckOk === false ? (
      <span className="relative inline-flex rounded-full h-2 w-2 bg-error"></span>
      ) : (
      <>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-on-surface opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-on-surface"></span>
      </>
      )}
      </span>
      <span className={`font-label-code text-caption ${live.chainCheckOk === false ? 'text-error font-semibold' : 'text-secondary'}`}>
                  {live.chainCheckOk === false
                    ? 'Nightly check found stock numbers that do not add up — cannot snooze'
                    : 'Nightly check ran 06:30 today · all stock numbers add up'}
                </span>
      </div>
      </div>

      <div className="flex items-center gap-space-sm shrink-0">
      <button type="button" onClick={() => shell.openModal('inventory-settings')} aria-label="Settings" className="h-9 px-space-md flex items-center justify-center rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors shadow-sm" title="Settings">
      <span className="material-symbols-outlined text-[18px]">settings</span>
      </button>
      <InventoryOverflowMenu
        items={form.headerMoreMenuItems}
        className="h-9 px-space-md flex items-center justify-center rounded-lg bg-surface-container-lowest shadow-sm"
        title="More Options"
      />
      {!shell.readOnly ? (
      <>
      <button type="button" onClick={() => shell.openModal('receive')} className="h-9 px-space-lg flex items-center gap-space-xs rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors shadow-sm font-body-sm text-body-sm font-medium">
      <span className="material-symbols-outlined text-[16px]">move_to_inbox</span>
      <span>Receive</span>
      </button>
      <button type="button" onClick={() => shell.openModal('issue')} className="h-9 px-space-lg flex items-center gap-space-xs rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-all shadow-sm font-body-sm text-body-sm font-medium active:scale-95">
      <span className="material-symbols-outlined text-[16px]">grid_view</span>
      <span>Issue</span>
      </button>
      </>
      ) : null}
      </div>
      </div>

      <InventoryPrimaryTabs variant="pill" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-space-md">

      <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-space-md">
      <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">Stock value</span>
      <div className="flex flex-col gap-1">
      <span className="font-label-price text-headline-sm text-on-surface tracking-tight">{live.totalStockValue}</span>
      <span className="font-label-code text-caption text-secondary">{live.inStoreValue} in store · {live.onCarsValue} on cars</span>
      </div>
      </div>

      <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-space-md">
      <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">Low or out of stock</span>
      <div className="flex flex-col gap-1">
      <span className="font-label-code text-headline-sm text-on-surface tracking-tight font-bold">{live.lowStockCount}</span>
      <span className="font-body-sm text-body-sm text-tertiary font-medium">{live.lowStockLabel}</span>
      </div>
      </div>

      <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-space-md">
      <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">Cars with a full kit</span>
      <div className="flex flex-col gap-1">
      <span className="font-label-code text-headline-sm text-on-surface tracking-tight font-bold">{live.kitFullCount} of {live.kitVehicleCount}</span>
      <span className="font-body-sm text-body-sm text-error font-medium">{Math.max(0, live.kitVehicleCount - live.kitFullCount)} cars missing items</span>
      </div>
      </div>

      <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-space-md">
      <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">Devices needing attention</span>
      <div className="flex flex-col gap-1">
      <span className="font-label-code text-headline-sm text-on-surface tracking-tight font-bold">{live.devicesNeedingAttention}</span>
      <span className="font-body-sm text-body-sm text-tertiary font-medium">{live.devicesNeedingAttention ? 'Devices need attention' : 'All devices OK'}</span>
      </div>
      </div>

      <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-space-md">
      <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">Open purchase orders</span>
      <div className="flex flex-col gap-1">
      <span className="font-label-code text-headline-sm text-on-surface tracking-tight font-bold">{live.openPoCount}</span>
      <span className="font-label-code text-caption text-secondary">{live.openPoCount ? 'Open purchase orders' : 'Nothing on order'}</span>
      </div>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">

      <div className="lg:col-span-8 flex flex-col rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden">
      <div className="p-space-lg flex flex-col gap-space-xs bg-surface-container-lowest">
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">Needs action</h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Immediate alerts and missing kit dispatches</p>
      </div>

      <div className="flex flex-col">

      {live.kitVehicles.filter((v) => v.missingLines + v.shortLines > 0).map((vehicle, idx) => (
        <div key={vehicle.vehicleId}>
          {idx > 0 ? <div className="h-px w-full bg-surface-container-low"></div> : null}
          <div className="p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
            <div className="flex items-center gap-space-md min-w-0">
              <div className="relative shrink-0 w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
                <span className="material-symbols-outlined text-[20px]">directions_car</span>
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-error ring-2 ring-surface-container-lowest"></span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-body-sm text-body-sm text-on-surface font-medium truncate">
                  <span className="font-label-plate text-label-plate tracking-wider">{vehicle.plate}</span>
                  {vehicle.missingLines + vehicle.shortLines >= vehicle.requiredLines
                    ? ' is missing its whole kit'
                    : ` is missing ${vehicle.missingLines + vehicle.shortLines} item${vehicle.missingLines + vehicle.shortLines === 1 ? '' : 's'}`}
                </span>
                <span className="font-label-code text-caption text-error font-medium">
                  {vehicle.missingLines + vehicle.shortLines} missing · {vehicle.okLines} of {vehicle.requiredLines} OK
                </span>
              </div>
            </div>
            <button type="button" onClick={() => shell.openModal('issue')} className="shrink-0 h-8 px-space-md rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-all font-body-sm text-body-sm font-medium active:scale-95 shadow-sm">
              Issue kit
            </button>
          </div>
        </div>
      ))}

      {live.lowStockCount > 0 && live.lowStockLabel !== '—' ? (
        <>
          <div className="h-px w-full bg-surface-container-low"></div>
          <div className="p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
            <div className="flex items-center gap-space-md min-w-0">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
                <span className="material-symbols-outlined text-[20px]">inventory_2</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-body-sm text-body-sm text-on-surface font-medium truncate">
                  {live.lowStockLabel} is low or out
                </span>
                <span className="font-label-code text-caption text-secondary">
                  {live.lowStockCount} item{live.lowStockCount === 1 ? '' : 's'} need attention
                </span>
              </div>
            </div>
            {shell.phaseFlags.phase6Purchasing ? (
            <button type="button" onClick={() => shell.setTab('purchasing')} className="shrink-0 h-8 px-space-md rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors font-body-sm text-body-sm font-medium">
              Reorder
            </button>
            ) : null}
          </div>
        </>
      ) : null}

      {shell.phaseFlags.phase4Assets
        ? live.assets.filter((a) => !strField(a, 'serial_number', '')).slice(0, 1).map((asset) => (
        <div key={strField(asset, 'id', 'asset')}>
          <div className="h-px w-full bg-surface-container-low"></div>
          <div className="p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
            <div className="flex items-center gap-space-md min-w-0">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
                <span className="material-symbols-outlined text-[20px]">videocam</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-body-sm text-body-sm text-on-surface font-medium truncate">
                  {strField(asset, 'name', 'Asset')} has no serial number
                </span>
                <span className="font-body-sm text-caption text-secondary">
                  Tag {strField(asset, 'asset_tag', '—')}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                shell.setSelectedAssetId(strField(asset, 'id', '') || null);
                shell.openModal('asset-page');
              }}
              className="shrink-0 h-8 px-space-md rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors font-body-sm text-body-sm font-medium"
            >
              Add serial
            </button>
          </div>
        </div>
      ))
        : null}

      {live.openAlertCount === 0 &&
      live.kitVehicles.every((v) => v.missingLines + v.shortLines === 0) &&
      live.lowStockCount === 0 ? (
        <div className="p-space-lg font-body-sm text-body-sm text-on-surface-variant">Nothing needs action right now.</div>
      ) : null}
      </div>
      </div>

      <div className="lg:col-span-4 flex flex-col gap-space-xl">

      <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-lg">
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">Kit completeness</h3>
      <span className="font-label-code text-caption text-secondary">{live.kitVehicleCount} Vehicles Active</span>
      </div>

      <div className="flex flex-col gap-space-lg">
      {live.kitVehicles.length === 0 ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">No vehicle kits configured yet.</p>
      ) : (
        live.kitVehicles.map((vehicle) => (
          <div key={vehicle.vehicleId} className="flex flex-col gap-space-xs">
            <div className="flex items-center justify-between">
              <span className="font-body-sm text-body-sm font-medium text-on-surface">{vehicle.plate}</span>
              <span className="font-label-plate text-label-plate text-on-surface">{vehicle.plate}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
              <div
                className={`h-full transition-all ${vehicle.pct >= 100 ? 'bg-secondary' : vehicle.pct > 0 ? 'bg-secondary' : 'bg-error'}`}
                style={{ width: `${vehicle.pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-caption font-label-code text-secondary">
              <span className={vehicle.pct >= 100 ? '' : 'text-error font-medium'}>
                {vehicle.okLines} of {vehicle.requiredLines} items allocated
              </span>
              <span className={vehicle.pct >= 100 ? 'font-semibold text-on-surface' : 'text-error font-semibold'}>
                {vehicle.pct}%
              </span>
            </div>
          </div>
        ))
      )}
      </div>
      <button type="button" onClick={() => shell.setTab('vehicle-kits')} className="inline-flex items-center gap-space-xs font-body-sm text-body-sm text-primary font-semibold hover:underline mt-space-xs">
      <span>Open Vehicle kits</span>
      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </button>
      </div>

      <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-lg">
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">Suggested to buy</h3>
      <span className="w-2 h-2 rounded-full bg-primary"></span>
      </div>

      {shell.phaseFlags.phase6Purchasing ? (
      <>
      <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-space-xs">
      <div className="flex items-center justify-between">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Phone Holder Mount</span>
      <span className="font-label-code text-caption font-bold bg-surface-container px-2 py-0.5 rounded text-on-surface">Buy 5</span>
      </div>
      <div className="flex flex-col gap-0.5 text-caption font-body-sm text-secondary">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[14px]">storefront</span>
      <span>{firstVendorName(live.vendors)}</span>
      </div>
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[14px]">schedule</span>
      <span>7 days lead time</span>
      </div>
      </div>
      </div>
      <button type="button" onClick={() => shell.setTab('purchasing')} className="w-full h-9 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors font-body-sm text-body-sm font-medium flex items-center justify-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px]">add_shopping_cart</span>
      <span>Create draft order</span>
      </button>
      </>
      ) : null}
      </div>
      </div>
      </div>
      </div>
      </div></div>
    </div>
  );
}
