export type EquipmentStatus = 'New' | 'Good' | 'Damaged' | 'Missing' | 'Maintenance';

export interface EquipmentSubItem {
    id: string;
    name: string;
    cost: number;
}

export interface DamageReport {
    id: string;
    date: string; // ISO string
    reporterName: string;
    type: string[]; // Array of DAMAGE_TYPES
    severity: string;
    description: string;
    images?: string[];
    cost?: number;
    merchant?: string;
}

export interface EquipmentItem {
    id: string;
    vehicleId: string;
    name: string;
    category?: 'Equipment' | 'Exterior';
    description?: string;
    price: number;
    shippingCost?: number;
    purchaseDate?: string; // ISO Date YYYY-MM-DD
    status: EquipmentStatus;
    subItems?: EquipmentSubItem[];
    inventoryId?: string; // Link to inventory item if assigned from stock
    notes?: string; // For damage reports or maintenance notes
    damageHistory?: DamageReport[];
    createdAt: string;
    updatedAt: string;
}
