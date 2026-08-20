import type { InventoryNode } from '../../types/enterprise-inventory';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

const NODE_ICONS: Record<InventoryNode['nodeType'], string> = {
  storefront: 'storefront',
  commissary: 'soup_kitchen',
  warehouse: 'warehouse',
};

interface LocationNodePickerProps {
  nodes: InventoryNode[];
  selectedId: string;
  onChange: (nodeId: string) => void;
}

export default function LocationNodePicker({ nodes, selectedId, onChange }: LocationNodePickerProps) {
  return (
    <div className="flex flex-wrap gap-inset-sm">
      {nodes.map((node) => {
        const active = node.id === selectedId;
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onChange(node.id)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm font-medium transition-colors ${
              active
                ? 'border-primary-container bg-primary-container/15 text-on-primary-container'
                : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <MaterialIcon name={NODE_ICONS[node.nodeType]} className="text-[18px]" />
            <span>{node.name}</span>
            <span className="text-label-sm capitalize text-on-surface-variant">({node.nodeType})</span>
          </button>
        );
      })}
    </div>
  );
}
