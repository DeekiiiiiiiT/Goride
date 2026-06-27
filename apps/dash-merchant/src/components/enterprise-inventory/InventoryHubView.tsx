import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { formatJmd } from '../../lib/partner-utils';
import type { EnterpriseInventoryView, InventoryHubKpis } from '../../types/enterprise-inventory';
import KpiStatCard from './KpiStatCard';
import LocationNodePicker from './LocationNodePicker';
import type { InventoryNode } from '../../types/enterprise-inventory';

const QUICK_ACTIONS: { view: EnterpriseInventoryView; label: string; description: string; icon: string }[] = [
  { view: 'receiving', label: 'Receive delivery', description: 'Log vendor delivery against PO', icon: 'inventory' },
  { view: 'count', label: 'Start count', description: 'Blind physical count sheet', icon: 'fact_check' },
  { view: 'transfers', label: 'Transfers', description: 'Move stock between locations', icon: 'swap_horiz' },
  { view: 'vendors', label: 'Vendors', description: 'Supplier directory & catalog', icon: 'store' },
  { view: 'recipes', label: 'Recipes', description: 'Yield % and depletion units', icon: 'menu_book' },
  { view: 'ledger', label: 'Audit trail', description: 'Immutable stock history', icon: 'history' },
  { view: 'locations', label: 'Locations', description: 'Company hierarchy', icon: 'account_tree' },
];

interface InventoryHubViewProps {
  nodes: InventoryNode[];
  selectedNodeId: string;
  onNodeChange: (id: string) => void;
  kpis: InventoryHubKpis;
  onNavigate: (view: EnterpriseInventoryView) => void;
}

export default function InventoryHubView({
  nodes,
  selectedNodeId,
  onNodeChange,
  kpis,
  onNavigate,
}: InventoryHubViewProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-inset-lg p-margin-mobile md:p-margin-tablet">
      <section className="space-y-inset-sm">
        <h2 className="text-title-md font-semibold">Location</h2>
        <LocationNodePicker nodes={nodes} selectedId={selectedNodeId} onChange={onNodeChange} />
      </section>

      <div className="grid gap-inset-md sm:grid-cols-2 lg:grid-cols-4">
        <KpiStatCard label="Stock value" value={formatJmd(kpis.stockValue)} />
        <KpiStatCard label="Low stock items" value={String(kpis.lowStockCount)} tone="error" />
        <KpiStatCard label="Open POs" value={String(kpis.openPoCount)} tone="warning" />
        <KpiStatCard label="Variance (period)" value={formatJmd(kpis.varianceCost)} tone="warning" />
      </div>

      <section className="space-y-inset-md">
        <h2 className="text-title-md font-semibold">Quick actions</h2>
        <div className="grid gap-inset-sm sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.view}
              type="button"
              onClick={() => onNavigate(action.view)}
              className="flex items-start gap-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md text-left transition-colors hover:border-primary-container/40 hover:bg-surface-container-low"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/15 text-primary-container">
                <MaterialIcon name={action.icon} />
              </div>
              <div>
                <p className="text-body-sm font-semibold">{action.label}</p>
                <p className="mt-0.5 text-label-sm text-on-surface-variant">{action.description}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
