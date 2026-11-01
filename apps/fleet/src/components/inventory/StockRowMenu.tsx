/** Row actions menu labels (Stitch IN2 stock table ⋮ menu). */
export const STOCK_ROW_MENU_LABELS = [
  'Receive stock…',
  'Issue to vehicle / tech…',
  'Transfer between hubs…',
  'Cycle count item…',
  'Archive SKU',
] as const;

export function StockRowMenu() {
  return (
    <div className="hidden" aria-hidden>
      {STOCK_ROW_MENU_LABELS.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}
