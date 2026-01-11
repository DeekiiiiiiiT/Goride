import { inventoryService } from './inventoryService';
import { templateService, EquipmentTemplate } from './templateService';
import { InventoryItem } from '../types/fleet';

const INITIAL_INVENTORY: InventoryItem[] = [
    {
        id: 'inv_dashcam_01',
        name: '4K Dashcam Front/Rear',
        category: 'Electronics',
        quantity: 15,
        minQuantity: 5,
        costPerUnit: 129.99,
        sku: 'DASH-4K-001',
        location: 'Shelf A1'
    },
    {
        id: 'inv_firstaid_01',
        name: 'Standard First Aid Kit',
        category: 'Safety',
        quantity: 50,
        minQuantity: 10,
        costPerUnit: 25.00,
        sku: 'SAFE-FAK-001',
        location: 'Cabinet B'
    },
    {
        id: 'inv_cleaning_01',
        name: 'Microfiber Towel Pack (12)',
        category: 'Cleaning',
        quantity: 100,
        minQuantity: 20,
        costPerUnit: 12.50,
        sku: 'CLN-TWL-12',
        location: 'Shelf C3'
    },
    {
        id: 'inv_mount_01',
        name: 'Magnetic Phone Mount',
        category: 'Interior',
        quantity: 30,
        minQuantity: 8,
        costPerUnit: 15.99,
        sku: 'INT-MNT-MAG',
        location: 'Bin 4'
    }
];

const INITIAL_TEMPLATES: EquipmentTemplate[] = [
    {
        id: 'tpl_standard_onboard',
        name: 'Standard Onboarding Kit',
        description: 'Basic equipment required for all new fleet vehicles.',
        items: [
            { id: 't_i_1', name: 'Standard First Aid Kit', category: 'Safety', price: 25.00, status: 'Active', vehicleId: '' },
            { id: 't_i_2', name: 'Magnetic Phone Mount', category: 'Interior', price: 15.99, status: 'Active', vehicleId: '' },
            { id: 't_i_3', name: 'Microfiber Towel Pack (12)', category: 'Cleaning', price: 12.50, status: 'Active', vehicleId: '' }
        ]
    },
    {
        id: 'tpl_premium_safety',
        name: 'Premium Safety Package',
        description: 'Includes dashcams and advanced safety gear.',
        items: [
             { id: 't_i_4', name: '4K Dashcam Front/Rear', category: 'Electronics', price: 129.99, status: 'Active', vehicleId: '' },
             { id: 't_i_5', name: 'Standard First Aid Kit', category: 'Safety', price: 25.00, status: 'Active', vehicleId: '' }
        ]
    }
];

export const seederService = {
    async seedInitialData() {
        console.log("Seeding initial data...");
        
        // Seed Inventory
        try {
             await inventoryService.bulkUpdateStock(INITIAL_INVENTORY);
        } catch (e) {
             console.warn("Bulk update failed, falling back to individual", e);
             for (const item of INITIAL_INVENTORY) {
                await inventoryService.saveStock(item);
            }
        }

        // Seed Templates
        for (const tpl of INITIAL_TEMPLATES) {
            await templateService.saveTemplate(tpl);
        }
        
        return { inventoryCount: INITIAL_INVENTORY.length, templatesCount: INITIAL_TEMPLATES.length };
    }
};
