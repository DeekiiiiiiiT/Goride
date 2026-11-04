/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn11PurchasingForm } from './hooks/useIn11PurchasingForm';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import { InventoryPrimaryTabs } from '../InventoryPrimaryTabs';
import { firstOpenPoNumber, firstVendorName, strField } from '../inventoryData';
export function In11Purchasing() {
  const form = useIn11PurchasingForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const summary = form.selectedPoSummary;
  const poId = form.selectedPoId ?? '';
  const poNumber = summary?.ref ?? '—';
  const vendorName = summary?.vendorName ?? '—';
  const firstVendorId = live.vendors[0] ? strField(live.vendors[0], 'id', '') || null : null;
  const openVendorEditor = () => shell.openGap('vendor-editor', { vendorId: firstVendorId });
  const openRequisition = () => shell.openGap('requisition');
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="px-margin-desktop py-space-lg bg-surface-container-lowest shadow-sm">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-space-lg">

      <div className="flex flex-wrap items-center justify-between gap-space-md">
      <div>
      <div className="flex items-center gap-space-xs text-on-surface-variant font-caption text-caption mb-1">
      <span>Fleet Operations</span>
      <span className="material-symbols-outlined text-[13px]">chevron_right</span>
      <span>Asset Control</span>
      <span className="material-symbols-outlined text-[13px]">chevron_right</span>
      <span className="text-on-surface font-semibold">Procurement</span>
      </div>
      <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">What you have, where it is, and what every car is missing.</p>
      </div>

      <div className="flex items-center gap-space-lg bg-surface-container-low px-space-lg py-space-sm rounded-lg">
      <div className="flex flex-col text-right">
      <span className="font-caption text-caption uppercase text-on-surface-variant">Procurement Cap</span>
      <span className="font-label-price text-label-price text-on-surface">{form.totals} / Mo</span>
      </div>
      <div className="w-px h-8 bg-surface-container-highest"></div>
      <div className="flex flex-col text-right">
      <span className="font-caption text-caption uppercase text-on-surface-variant">Pending PO Approvals</span>
      <span className="font-label-code text-label-code text-on-surface font-bold text-on-tertiary-container">1 Order</span>
      </div>
      </div>
      </div>

      <InventoryPrimaryTabs variant="pill" />
      </div>
      </div>

      <div className="px-margin-desktop py-space-xl max-w-[1440px] mx-auto w-full flex flex-col gap-space-xl">

      <div className="flex flex-wrap items-center justify-between gap-space-md">

      <div className="flex items-center bg-surface-container-high p-1 rounded-lg">
      <button type="button" className="px-space-lg py-1.5 rounded-md font-body-sm text-body-sm bg-primary text-on-primary font-semibold shadow-sm flex items-center gap-space-xs transition-all" data-stitch-data-stitch-id="sub-pill-orders" onClick={() => form.setTab('orders')}>
      <span className="material-symbols-outlined text-[15px]">inventory</span>
      <span>Orders</span>
      </button>
      <button type="button" className="px-space-lg py-1.5 rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface flex items-center gap-space-xs transition-all" data-stitch-data-stitch-id="sub-pill-suggested" onClick={() => form.setTab('suggested')}>
      <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
      <span>Suggested</span>
      <span className="px-1.5 py-0.2 bg-tertiary-fixed text-on-tertiary-fixed font-label-code text-[11px] font-bold rounded-full">{form.suggestedCount}</span>
      </button>
      <button type="button" className="px-space-lg py-1.5 rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface flex items-center gap-space-xs transition-all" data-stitch-data-stitch-id="sub-pill-vendors" onClick={() => form.setTab('vendors')}>
      <span className="material-symbols-outlined text-[15px]">storefront</span>
      <span>Vendors</span>
      <span className="px-1.5 py-0.2 bg-surface-container-lowest text-on-surface-variant font-label-code text-[11px] rounded-full">{form.vendorCount}</span>
      </button>
      </div>

      <div className="flex items-center gap-space-md">
      <button type="button" className="h-9 px-space-lg bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded shadow-sm hover:bg-surface-container transition-all flex items-center gap-space-xs" onClick={() => form.exportPurchasing()}>
      <span className="material-symbols-outlined text-[16px]">file_download</span>
                Export Audit Ledger
              </button>
      <button type="button" onClick={() => shell.openModal('purchase-order')} className="h-9 px-space-lg bg-primary text-on-primary font-body-sm text-body-sm rounded font-semibold shadow-sm hover:bg-primary-container transition-all flex items-center gap-space-xs active:scale-[0.98]">
      <span className="material-symbols-outlined text-[16px]">add</span>
                + New purchase order
              </button>
      </div>
      </div>

      <div className="flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-primary text-[18px]">view_kanban</span>
      <h2 className="font-headline-sm text-headline-sm text-on-surface tracking-tight">Orders Pipeline</h2>
      <span className="text-on-surface-variant font-caption text-caption uppercase tracking-wider bg-surface-container-high px-2 py-0.5 rounded">Active Batch FY-26</span>
      </div>
      <div className="font-caption text-caption text-on-surface-variant">
                Showing 7 open & closed purchase vouchers
              </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-space-md items-start">

      <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-md shadow-sm">
      <div className="flex items-center justify-between px-space-xs">
      <div className="flex items-center gap-space-xs">
      <span className="w-2.5 h-2.5 rounded-full bg-surface-tint"></span>
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Draft</span>
      </div>
      <span className="font-label-code text-caption font-bold text-on-surface-variant bg-surface-container-lowest px-2 py-0.5 rounded">1</span>
      </div>

      <div className="bg-surface-container-lowest rounded-lg p-space-md shadow-sm flex flex-col gap-space-sm cursor-pointer hover:shadow-md transition-all">
      <div className="flex items-center justify-between">
      <span className="font-label-code text-label-code font-bold text-on-surface bg-surface-container-low px-1.5 py-0.5 rounded">{poNumber}</span>
      <span className="font-caption text-caption px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-semibold">Draft</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">{vendorName}</span>
      <span className="font-caption text-caption text-on-surface-variant flex items-center gap-1">
      <span className="material-symbols-outlined text-[13px]">location_on</span>
                      {live.hubShort}
                    </span>
      </div>
      <div className="bg-surface-container-low p-2 rounded flex items-center justify-between">
      <span className="font-caption text-caption text-on-surface-variant">3 lines</span>
      <span className="font-label-price text-label-price text-on-surface">{form.totals}</span>
      </div>
      <div className="text-on-surface-variant font-caption text-caption flex items-center gap-1">
      <span className="material-symbols-outlined text-[14px]">event</span>
                    Expected 8 Nov 2026
                  </div>
      <div className="bg-surface-container p-2 rounded text-on-surface-variant font-caption text-caption">
      <div className="font-semibold text-on-surface text-[10px] uppercase mb-0.5">Manifest Preview:</div>
      <p className="truncate">5× Phone holder, 2× Tyre pump, 1× Warning tri.</p>
      </div>
      <div className="pt-1 mt-1 bg-surface-container-low/50 rounded p-1.5 flex items-center gap-1.5 text-on-tertiary-container font-caption text-caption font-semibold">
      <span className="material-symbols-outlined text-[15px]">lock_clock</span>
      <span>Awaiting owner approval</span>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-md shadow-sm">
      <div className="flex items-center justify-between px-space-xs">
      <div className="flex items-center gap-space-xs">
      <span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Ordered</span>
      </div>
      <span className="font-label-code text-caption font-bold text-on-surface-variant bg-surface-container-lowest px-2 py-0.5 rounded">0</span>
      </div>
      <div className="h-32 rounded-lg bg-surface-container flex flex-col items-center justify-center p-space-md text-center">
      <span className="material-symbols-outlined text-surface-dim text-[24px]">local_shipping</span>
      <span className="font-caption text-caption text-on-surface-variant mt-1">No dispatched shipments pending</span>
      </div>
      </div>

      <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-md shadow-sm">
      <div className="flex items-center justify-between px-space-xs">
      <div className="flex items-center gap-space-xs">
      <span className="w-2.5 h-2.5 rounded-full bg-on-tertiary-container"></span>
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Part received</span>
      </div>
      <span className="font-label-code text-caption font-bold text-on-surface-variant bg-surface-container-lowest px-2 py-0.5 rounded">0</span>
      </div>
      <div className="h-32 rounded-lg bg-surface-container flex flex-col items-center justify-center p-space-md text-center">
      <span className="material-symbols-outlined text-surface-dim text-[24px]">incomplete_circle</span>
      <span className="font-caption text-caption text-on-surface-variant mt-1">No split dock receipts</span>
      </div>
      </div>

      <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-md shadow-sm">
      <div className="flex items-center justify-between px-space-xs">
      <div className="flex items-center gap-space-xs">
      <span className="w-2.5 h-2.5 rounded-full bg-primary-container"></span>
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Received</span>
      </div>
      <span className="font-label-code text-caption font-bold text-on-surface-variant bg-surface-container-lowest px-2 py-0.5 rounded">2</span>
      </div>

      <div className="bg-surface-container-lowest rounded-lg p-space-md shadow-sm flex flex-col gap-space-sm opacity-90 hover:opacity-100 transition-opacity">
      <div className="flex items-center justify-between">
      <span className="font-label-code text-label-code font-bold text-on-surface bg-surface-container px-1.5 py-0.5 rounded">{live.purchaseOrders[1] ? strField(live.purchaseOrders[1], 'number', '—') : '—'}</span>
      <span className="font-caption text-caption px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-semibold">Staged</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Kingston Auto Supplies</span>
      <span className="font-caption text-caption text-on-surface-variant">Wharf St, Depot 4</span>
      </div>
      <div className="bg-surface-container-low p-2 rounded flex items-center justify-between">
      <span className="font-caption text-caption text-on-surface-variant">4 lines</span>
      <span className="font-label-price text-label-price text-on-surface">{form.totals}</span>
      </div>
      <div className="text-on-surface-variant font-caption text-caption flex items-center gap-1">
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    Dock check verified 28 Oct
                  </div>
      </div>

      <div className="bg-surface-container-lowest rounded-lg p-space-md shadow-sm flex flex-col gap-space-sm opacity-90 hover:opacity-100 transition-opacity">
      <div className="flex items-center justify-between">
      <span className="font-label-code text-label-code font-bold text-on-surface bg-surface-container px-1.5 py-0.5 rounded">{live.purchaseOrders[2] ? strField(live.purchaseOrders[2], 'number', '—') : '—'}</span>
      <span className="font-caption text-caption px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-semibold">Staged</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Amazon Cargo Freight</span>
      <span className="font-caption text-caption text-on-surface-variant">Air Logistics JMD</span>
      </div>
      <div className="bg-surface-container-low p-2 rounded flex items-center justify-between">
      <span className="font-caption text-caption text-on-surface-variant">1 line</span>
      <span className="font-label-price text-label-price text-on-surface">{form.totals}</span>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-md shadow-sm">
      <div className="flex items-center justify-between px-space-xs">
      <div className="flex items-center gap-space-xs">
      <span className="w-2.5 h-2.5 rounded-full bg-outline"></span>
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Closed</span>
      </div>
      <span className="font-label-code text-caption font-bold text-on-surface-variant bg-surface-container-lowest px-2 py-0.5 rounded">4</span>
      </div>

      {form.allOrders
        .filter((po) => {
          const st = form.strField(po, 'status', '').toLowerCase();
          return st === 'closed' || st === 'cancelled' || st === 'canceled';
        })
        .slice(0, form.showArchived ? undefined : 2)
        .map((po) => {
          const id = form.strField(po, 'id', '');
          const ref = form.strField(po, 'number', form.strField(po, 'po_number', '—'));
          const vendor = form.strField(po, 'vendor_name', vendorName);
          const total = form.formatJmd(Number(form.strField(po, 'total_jmd', form.strField(po, 'total', '0'))));
          return (
      <div key={id || ref} className="bg-surface-container-lowest rounded-lg p-space-md shadow-sm flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
      <span className="font-label-code text-caption font-bold text-on-surface-variant">{ref}</span>
      <span className="font-caption text-[10px] text-on-surface-variant">{form.strField(po, 'closed_at', form.strField(po, 'updated_at', ''))}</span>
      </div>
      <span className="font-body-sm text-body-sm text-on-surface truncate">{vendor}</span>
      <div className="flex items-center justify-between text-on-surface-variant font-label-price text-caption">
      <span>Settled</span>
      <span>{total}</span>
      </div>
      </div>
          );
        })}
      {form.archivedCount > 2 ? (
      <button type="button" className="py-1 text-center font-caption text-caption text-on-surface-variant hover:text-on-surface transition-colors" onClick={() => form.setShowArchived(!form.showArchived)}>
                  + {form.archivedCount - 2} more archived orders
                </button>
      ) : null}
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-md p-space-lg md:p-space-xl flex flex-col gap-space-lg">

      <div className="flex flex-col gap-space-sm pb-space-md bg-surface-container-low -mx-space-lg -mt-space-lg md:-mx-space-xl md:-mt-space-xl p-space-lg md:p-space-xl rounded-t-xl">
      <div className="flex items-center gap-space-xs font-caption text-caption text-on-surface-variant">
      <span>Inventory</span>
      <span className="material-symbols-outlined text-[12px]">chevron_right</span>
      <span>Purchasing</span>
      <span className="material-symbols-outlined text-[12px]">chevron_right</span>
      <span className="font-label-code text-label-code font-bold text-on-surface">{poNumber}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-space-md mt-1">

      <div className="flex items-center gap-space-md">
      <div className="w-12 h-12 rounded-lg bg-primary-container text-on-primary flex items-center justify-center shadow-sm">
      <span className="material-symbols-outlined text-[24px]">receipt_long</span>
      </div>
      <div>
      <div className="flex items-center gap-space-sm">
      <h3 className="font-headline-sm text-headline-sm text-on-surface">{poNumber} · {vendorName}</h3>
      <span className="px-2.5 py-0.5 rounded-full font-caption text-caption bg-surface-container-highest text-on-surface font-semibold">Draft Voucher</span>
      <span className="px-2.5 py-0.5 rounded-full font-caption text-caption bg-tertiary-fixed text-on-tertiary-fixed font-bold flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container animate-pulse"></span>
                        Limit Approval Required
                      </span>
      </div>
      <div className="font-caption text-caption text-on-surface-variant flex items-center gap-space-md mt-1">
      <span>Created: <strong className="text-on-surface font-medium">{form.poDetailMeta?.createdLabel ?? '—'}</strong></span>
      <span>•</span>
      <span>Initiated by: <strong className="text-on-surface font-medium font-label-code">{form.poDetailMeta?.initiatedByLabel ?? '—'}</strong></span>
      <span>•</span>
      <span>Warehouse Target: <strong className="text-on-surface font-medium">{live.hubName}</strong></span>
      </div>
      </div>
      </div>

      <div className="flex items-center flex-wrap gap-space-sm">
      <button type="button" className="h-9 px-space-md bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm rounded transition-all" onClick={() => poId && form.poAction(poId, 'cancel')}>
                    Cancel order
                  </button>
      <button type="button" className="h-9 px-space-md bg-surface-container-highest hover:bg-surface-dim text-on-surface font-body-sm text-body-sm rounded font-medium transition-all flex items-center gap-1" onClick={() => poId && form.poAction(poId, 'submit')}>
      <span className="material-symbols-outlined text-[16px]">verified</span>
                    Send for approval
                  </button>
      <button type="button" className="h-9 px-space-lg bg-primary text-on-primary font-body-sm text-body-sm rounded font-semibold shadow-sm hover:bg-primary-container transition-all flex items-center gap-space-xs" onClick={() => poId && form.poAction(poId, 'order')}>
      <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                    Mark ordered
                  </button>
      <button
        type="button"
        className="h-9 px-space-md bg-surface-container text-on-surface font-body-sm text-body-sm rounded flex items-center gap-1 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        disabled={!form.canReceive}
        title={form.canReceive ? 'Receive against this PO' : form.receiveDisabledReason}
        onClick={() => poId && form.openReceive(poId)}
      >
      <span className="material-symbols-outlined text-[16px]">move_to_inbox</span>
                    Receive items
                  </button>
      </div>
      </div>
      </div>

      <div className="bg-tertiary-fixed-dim/30 p-space-md rounded-lg flex items-center justify-between text-on-tertiary-fixed">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-[20px] text-on-tertiary-container">info</span>
      <span className="font-body-sm text-body-sm">
      <strong>Spending Threshold Policy:</strong> This order total exceeds the local dispatcher threshold of <strong>{form.totals}</strong>. Authorization token from Kingston platform administrator is required prior to invoice dispatch.
                </span>
      </div>
      <span className="font-label-code text-caption font-bold bg-surface-container-lowest px-2 py-1 rounded text-on-surface">Rule REG-801-JMD</span>
      </div>

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <h4 className="font-body-lg text-body-lg font-semibold text-on-surface">Order Line Items</h4>
      <span className="font-caption text-caption text-on-surface-variant font-label-code">SKU Group: ACC / TLS / SAF</span>
      </div>
      <div className="overflow-x-auto rounded-lg bg-surface-container-low shadow-sm">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container-high text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <th className="py-space-md px-space-lg">Item & Master SKU</th>
      <th className="py-space-md px-space-md text-center">Ordered Qty</th>
      <th className="py-space-md px-space-md text-center">Received</th>
      <th className="py-space-md px-space-md text-right">Unit Price (J$)</th>
      <th className="py-space-md px-space-lg text-right">Line Total (J$)</th>
      <th className="py-space-md px-space-md text-center">Actions</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container bg-surface-container-lowest font-body-sm text-body-sm">
      {form.poLineRows.length === 0 ? (
      <tr>
      <td colSpan={6} className="py-space-xl px-space-lg text-center text-on-surface-variant font-body-sm">
      No line items on this purchase order yet.
      </td>
      </tr>
      ) : (
      form.poLineRows.map((line) => (
      <tr key={line.id} className="hover:bg-surface-container-low transition-colors">
      <td className="py-space-md px-space-lg">
      <div className="flex items-center gap-space-md">
      <div className="w-9 h-9 rounded bg-surface-container flex items-center justify-center">
      <span className="material-symbols-outlined text-primary text-[18px]">{line.icon}</span>
      </div>
      <div className="flex flex-col">
      <span className="font-semibold text-on-surface">{line.name}</span>
      <span className="font-label-code text-caption text-on-surface-variant">{line.sku}</span>
      </div>
      </div>
      </td>
      <td className="py-space-md px-space-md text-center font-label-code font-bold text-on-surface">
                        {line.orderedLabel}
                      </td>
      <td className="py-space-md px-space-md text-center">
      <span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">{line.receivedLabel}</span>
      </td>
      <td className="py-space-md px-space-md text-right font-label-price text-label-price text-on-surface">
                        {line.unitCost}
                      </td>
      <td className="py-space-md px-space-lg text-right font-label-price text-label-price font-bold text-on-surface">
                        {line.lineTotal}
                      </td>
      <td className="py-space-md px-space-md text-center">
      <button type="button" className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-error transition-colors" title="Delete Line" onClick={() => poId && form.removePoLine(poId, line.id)}>
      <span className="material-symbols-outlined text-[16px]">delete</span>
      </button>
      </td>
      </tr>
      ))
      )}
      </tbody>
      </table>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg pt-space-sm items-start">

      <div className="lg:col-span-7 bg-surface-container-low p-space-lg rounded-xl flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-primary text-[18px]">calculate</span>
      <span className="font-body-md text-body-md font-semibold text-on-surface">Landed Cost Adjustments</span>
      </div>
      <span className="font-caption text-caption px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">Allocation: FIFO Proportional</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Freight and duty expenditures are automatically weighted across line units to update replacement unit valuation upon intake.
                </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md pt-1">
      <div className="bg-surface-container-lowest p-space-md rounded-lg flex flex-col gap-1 shadow-sm">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Local Drayage / Courier</span>
      <div className="flex items-center justify-between">
      <span className="font-body-sm text-body-sm font-medium text-on-surface">Kingston Express Delivery</span>
      <span className="font-label-price text-label-price font-bold text-on-surface">{form.totals}</span>
      </div>
      </div>
      <div className="bg-surface-container-lowest p-space-md rounded-lg flex flex-col gap-1 shadow-sm">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Port / Processing Duty</span>
      <div className="flex items-center justify-between">
      <span className="font-body-sm text-body-sm font-medium text-on-surface">Consolidated Wharf Surcharge</span>
      <span className="font-label-price text-label-price font-bold text-on-surface">{form.totals}</span>
      </div>
      </div>
      </div>
      <div className="flex items-center gap-space-sm text-on-surface-variant font-caption text-caption pt-1">
      <span className="material-symbols-outlined text-[16px] text-surface-tint">sync_saved_locally</span>
      <span>Landed allocation formula: <code className="font-label-code text-on-surface font-semibold">Unit_Base + ((Item_Subtotal / 41,100) × 4,000)</code></span>
      </div>
      </div>

      <div className="lg:col-span-5 bg-surface-container-high p-space-lg rounded-xl flex flex-col gap-space-md">
      <span className="font-caption text-caption uppercase text-on-surface-variant tracking-wider font-semibold">Purchase Order Ledger Total</span>
      <div className="flex flex-col gap-space-xs font-body-sm text-body-sm text-on-surface">
      <div className="flex justify-between py-1">
      <span className="text-on-surface-variant">Item Catalog Subtotal:</span>
      <span className="font-label-price text-label-price text-on-surface font-medium">{form.totals}</span>
      </div>
      <div className="flex justify-between py-1">
      <span className="text-on-surface-variant">Freight, Port Handling & Taxes:</span>
      <span className="font-label-price text-label-price text-on-surface font-medium">{form.totals}</span>
      </div>
      <div className="h-px bg-surface-container-highest my-1"></div>
      <div className="flex justify-between items-baseline py-1">
      <span className="font-headline-sm text-headline-sm font-bold text-on-surface">Total PO Value:</span>
      <div className="text-right">
      <div className="font-headline-sm text-headline-sm font-bold font-label-price text-on-surface">{form.totals}</div>
      <div className="font-caption text-caption text-on-surface-variant">Currency: Jamaican Dollar (JMD)</div>
      </div>
      </div>
      </div>

      <div className="bg-primary text-on-primary p-space-md rounded-lg flex items-center justify-between mt-space-xs">
      <div className="flex flex-col">
      <span className="font-caption text-caption text-on-primary-container uppercase font-bold">Authorized Sign-off</span>
      <span className="font-body-sm text-body-sm">{form.signoffLabel}</span>
      </div>
      <button type="button" className="px-space-md py-1 bg-surface-container-lowest text-primary rounded font-body-sm text-body-sm font-bold hover:bg-surface-container transition-all" onClick={() => featuredPoId && form.poAction(featuredPoId, 'authorize')}>
                    Authorize {form.totals}
                  </button>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg md:p-space-xl flex flex-col gap-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary">
      <span className="material-symbols-outlined text-[22px]">auto_awesome</span>
      </div>
      <div>
      <div className="flex items-center gap-space-xs">
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Suggested to Buy</h3>
      <span className="px-2 py-0.5 rounded-full font-label-code text-caption bg-tertiary-fixed text-on-tertiary-fixed font-bold">1 Rule Match</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Automated trigger based on minimum stock policies in Kingston central repository.</p>
      </div>
      </div>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="px-space-md py-1.5 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm hover:bg-surface-container transition-colors" onClick={() => form.recomputeThresholds()}>
                  Recompute Thresholds
                </button>
      </div>
      </div>

      <div className="overflow-x-auto rounded-lg bg-surface-container-low">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container-high text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <th className="py-space-md px-space-md w-10 text-center">
      <input defaultChecked className="rounded border-outline text-primary focus:ring-0 cursor-pointer" type="checkbox"/>
      </th>
      <th className="py-space-md px-space-lg">Item & Catalog SKU</th>
      <th className="py-space-md px-space-md text-center">Available</th>
      <th className="py-space-md px-space-md text-center">On Order</th>
      <th className="py-space-md px-space-md text-center">Reorder At</th>
      <th className="py-space-md px-space-md text-center">Suggest</th>
      <th className="py-space-md px-space-lg">Preferred Vendor</th>
      <th className="py-space-md px-space-md text-center">Lead Time</th>
      <th className="py-space-md px-space-lg text-right">Est. Total</th>
      <th className="py-space-md px-space-lg text-right">Action</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container bg-surface-container-lowest font-body-sm text-body-sm">
      <tr className="hover:bg-surface-container-low transition-colors">
      <td className="py-space-md px-space-md text-center">
      <input defaultChecked className="rounded border-outline text-primary focus:ring-0 cursor-pointer" type="checkbox"/>
      </td>
      <td className="py-space-md px-space-lg">
      <div className="flex items-center gap-space-sm">
      <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center">
      <span className="material-symbols-outlined text-[16px] text-primary">stay_current_portrait</span>
      </div>
      <div>
      <span className="font-semibold text-on-surface block">Phone Holder Mount</span>
      <span className="font-label-code text-caption text-on-surface-variant">{form.suggestedSku}</span>
      </div>
      </div>
      </td>
      <td className="py-space-md px-space-md text-center">
      <span className="px-2 py-0.5 rounded font-label-code text-caption font-bold bg-error-container text-on-error-container">1 unit</span>
      </td>
      <td className="py-space-md px-space-md text-center font-label-code text-on-surface-variant">
                      0
                    </td>
      <td className="py-space-md px-space-md text-center font-label-code text-on-surface">
                      3
                    </td>
      <td className="py-space-md px-space-md text-center">
      <span className="px-2 py-0.5 rounded font-label-code text-caption font-bold bg-secondary-fixed text-on-secondary-fixed">+5 units</span>
      </td>
      <td className="py-space-md px-space-lg text-on-surface font-medium">
                      {vendorName}
                    </td>
      <td className="py-space-md px-space-md text-center font-caption text-caption text-on-surface-variant">
                      7 days
                    </td>
      <td className="py-space-md px-space-lg text-right font-label-price text-label-price font-bold text-on-surface">
                      {form.totals}
                    </td>
      <td className="py-space-md px-space-lg text-right">
      <button type="button" onClick={openRequisition} className="px-space-md py-1.5 bg-primary text-on-primary font-body-sm text-body-sm rounded font-medium hover:bg-primary-container shadow-sm transition-all whitespace-nowrap">
                        Create draft order
                      </button>
      </td>
      </tr>
      </tbody>
      </table>
      </div>
      </div>

      <div className="flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-primary text-[18px]">domain</span>
      <h3 className="font-headline-sm text-headline-sm text-on-surface tracking-tight">Active Vendor Directory</h3>
      <span className="font-caption text-caption bg-surface-container-high px-2 py-0.5 rounded text-on-surface-variant">3 Active Partners</span>
      </div>
      <button type="button" onClick={openVendorEditor} className="font-body-sm text-body-sm text-on-surface font-semibold hover:underline flex items-center gap-1">
                Manage all vendors
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between gap-space-md hover:shadow-md transition-all">
      <div className="flex flex-col gap-space-xs">
      <div className="flex items-center justify-between">
      <span className="font-headline-sm text-[16px] font-bold text-on-surface">{vendorName}</span>
      <span className="w-2 h-2 rounded-full bg-on-surface"></span>
      </div>
      <span className="font-label-code text-caption text-on-surface-variant">876-928-1144</span>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Primary supplier for in-cabin mounting devices, chargers, safety alerts, and tyre diagnostics tools.
                  </p>
      </div>
      <div className="pt-space-md bg-surface-container-low -mx-space-lg -mb-space-lg p-space-md rounded-b-xl flex items-center justify-between font-caption text-caption text-on-surface">
      <span className="flex items-center gap-1 text-on-surface-variant">
      <span className="material-symbols-outlined text-[15px]">schedule</span>
                    7 days average turnaround
                  </span>
      <span className="font-label-code font-bold">Grade A</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between gap-space-md hover:shadow-md transition-all">
      <div className="flex flex-col gap-space-xs">
      <div className="flex items-center justify-between">
      <span className="font-headline-sm text-[16px] font-bold text-on-surface">Kingston Auto Supplies</span>
      <span className="w-2 h-2 rounded-full bg-on-surface"></span>
      </div>
      <div className="flex items-center gap-2">
      <span className="font-label-code text-caption text-on-surface-variant">876-967-3321</span>
      <span className="font-caption text-[10px] px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-semibold">Linked to Dominion</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Specialized powertrain parts, fluids, brake hardware, and quick-intake emergency replacements.
                  </p>
      </div>
      <div className="pt-space-md bg-surface-container-low -mx-space-lg -mb-space-lg p-space-md rounded-b-xl flex items-center justify-between font-caption text-caption text-on-surface">
      <span className="flex items-center gap-1 text-on-surface-variant">
      <span className="material-symbols-outlined text-[15px]">schedule</span>
                    3 days rapid logistics
                  </span>
      <span className="font-label-code font-bold">Grade A+</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between gap-space-md hover:shadow-md transition-all">
      <div className="flex flex-col gap-space-xs">
      <div className="flex items-center justify-between">
      <span className="font-headline-sm text-[16px] font-bold text-on-surface">Amazon via Shipping Agent</span>
      <span className="w-2 h-2 rounded-full bg-surface-tint"></span>
      </div>
      <span className="font-label-code text-caption text-on-surface-variant">Freight Forwarding / Miami</span>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Consolidated bulk imports for specialized OBD-II telemetry trackers, diagnostic readers, and GPS dongles.
                  </p>
      </div>
      <div className="pt-space-md bg-surface-container-low -mx-space-lg -mb-space-lg p-space-md rounded-b-xl flex items-center justify-between font-caption text-caption text-on-surface">
      <span className="flex items-center gap-1 text-on-surface-variant">
      <span className="material-symbols-outlined text-[15px]">schedule</span>
                    14 days overseas freight
                  </span>
      <span className="font-label-code font-bold">Import FIFO</span>
      </div>
      </div>
      </div>
      </div>
      </div>


      </div></div>
    </div>
  );
}
