import { EquipmentItem } from './equipment';

export interface FleetMetric {
    totalAssetValue: number;
    totalItems: number;
    vehiclesEquipped: number;
    vehiclesLowStock: number; // e.g. missing essential items
    upcomingRenewals: number;
    inventoryValue: number;
}

export interface InventoryItem {
    id: string;
    name: string;
    category: string;
    quantity: number;
    minQuantity: number; // Reorder level
    costPerUnit: number;
    location?: string;
    description?: string;
    lastRestockDate?: string;
    createdAt: string;
    updatedAt: string;
}

export interface BulkOperationPayload {
    vehicleIds: string[];
    items: EquipmentItem[]; // Template items to be cloned
    sourceType: 'inventory' | 'template' | 'new';
    inventoryItemId?: string; // If source is inventory
}
