/** Stitch gap placeholders (audit §2) — see docs/stitch/roam-fleet-app/inventory/STITCH_GAP_SCREENS.md */
function GapShell({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-w-lg rounded-xl bg-white p-6 shadow-lg dark:bg-slate-900">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">
          Stitch screen pending — export design to <code className="text-xs">docs/stitch/roam-fleet-app/inventory/</code>{' '}
          then port via <code className="text-xs">scripts/port-inventory-stitch.mjs</code>.
        </p>
        {onClose ? (
          <button type="button" className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function GapInventorySettings(p: { onClose?: () => void }) {
  return <GapShell title="Inventory settings" onClose={p.onClose} />;
}
export function GapItemEditor(p: { onClose?: () => void }) {
  return <GapShell title="Add / edit item" onClose={p.onClose} />;
}
export function GapImportItems(p: { onClose?: () => void }) {
  return <GapShell title="Import items" onClose={p.onClose} />;
}
export function GapLocationsBins(p: { onClose?: () => void }) {
  return <GapShell title="Locations & bins" onClose={p.onClose} />;
}
export function GapOpeningBalances(p: { onClose?: () => void }) {
  return <GapShell title="Opening balances" onClose={p.onClose} />;
}
export function GapRegisterAsset(p: { onClose?: () => void }) {
  return <GapShell title="Register asset" onClose={p.onClose} />;
}
export function GapPurchaseOrder(p: { onClose?: () => void }) {
  return <GapShell title="Purchase order" onClose={p.onClose} />;
}
export function GapVendorEditor(p: { onClose?: () => void }) {
  return <GapShell title="Vendor" onClose={p.onClose} />;
}
export function GapCountSession(p: { onClose?: () => void }) {
  return <GapShell title="Count session" onClose={p.onClose} />;
}
export function GapRequisition(p: { onClose?: () => void }) {
  return <GapShell title="Requisition" onClose={p.onClose} />;
}
export function GapApprovalDrawer(p: { onClose?: () => void }) {
  return <GapShell title="Approval review" onClose={p.onClose} />;
}
export function GapScannerPair(p: { onClose?: () => void }) {
  return <GapShell title="Pair scanner" onClose={p.onClose} />;
}
export function GapSnoozeSettings(p: { onClose?: () => void }) {
  return <GapShell title="Snooze settings" onClose={p.onClose} />;
}
export function GapKitCompare(p: { onClose?: () => void }) {
  return <GapShell title="Kit version compare" onClose={p.onClose} />;
}
export function GapDriverReportUpdate(p: { onClose?: () => void }) {
  return <GapShell title="Update reported item" onClose={p.onClose} />;
}
