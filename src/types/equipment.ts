export type EquipmentStatus = 'New' | 'Good' | 'Damaged' | 'Missing' | 'Maintenance';

export interface EquipmentSubItem {
    id: string;
    name: string;
    cost: number;
}

export interface EquipmentItem {
    id: string;
    vehicleId: string;
    name: string;
    description?: string;
    price: number;
    shippingCost?: number;
    purchaseDate?: string; // ISO Date YYYY-MM-DD
    status: EquipmentStatus;
    subItems?: EquipmentSubItem[];
    notes?: string; // For damage reports or maintenance notes
    createdAt: string;
    updatedAt: string;
}
