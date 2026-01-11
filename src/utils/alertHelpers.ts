import { InventoryItem } from '../types/fleet';
import { Vehicle } from '../types/vehicle';
import { differenceInDays, parseISO, isBefore, addDays } from 'date-fns';

export interface FleetAlert {
    id: string;
    type: 'low_stock' | 'maintenance' | 'expiry';
    severity: 'critical' | 'warning' | 'info';
    message: string;
    entityId: string;
    entityName: string;
    date?: string;
    details?: string;
}

export function getInventoryAlerts(inventory: InventoryItem[]): FleetAlert[] {
    const alerts: FleetAlert[] = [];
    
    inventory.forEach(item => {
        if (!item.quantity && item.quantity !== 0) return; // Skip if invalid
        
        if (item.quantity <= 0) {
            alerts.push({
                id: `alert-stock-crit-${item.id}`,
                type: 'low_stock',
                severity: 'critical',
                message: `Out of stock: ${item.name}`,
                entityId: item.id,
                entityName: item.name,
                details: `0 items remaining (Min: ${item.minQuantity})`
            });
        } else if (item.quantity <= item.minQuantity) {
            alerts.push({
                id: `alert-stock-warn-${item.id}`,
                type: 'low_stock',
                severity: 'warning',
                message: `Low stock: ${item.name}`,
                entityId: item.id,
                entityName: item.name,
                details: `${item.quantity} items remaining (Min: ${item.minQuantity})`
            });
        }
    });

    return alerts;
}

export function getVehicleAlerts(vehicles: Vehicle[]): FleetAlert[] {
    const alerts: FleetAlert[] = [];
    const today = new Date();
    const warningThreshold = addDays(today, 30);

    vehicles.forEach(vehicle => {
        // Maintenance Alerts
        if (vehicle.serviceStatus === 'Overdue') {
             alerts.push({
                id: `alert-maint-crit-${vehicle.id}`,
                type: 'maintenance',
                severity: 'critical',
                message: `Service Overdue: ${vehicle.licensePlate}`,
                entityId: vehicle.id,
                entityName: `${vehicle.year} ${vehicle.model} (${vehicle.licensePlate})`,
                details: `Due ${vehicle.daysToService ? Math.abs(vehicle.daysToService) + ' days ago' : 'now'}`
            });
        } else if (vehicle.serviceStatus === 'Due Soon' || (vehicle.nextServiceDate && isBefore(parseISO(vehicle.nextServiceDate), warningThreshold))) {
            // Avoid duplicate if serviceStatus is Due Soon AND date is close
            alerts.push({
                id: `alert-maint-warn-${vehicle.id}`,
                type: 'maintenance',
                severity: 'warning',
                message: `Service Due Soon: ${vehicle.licensePlate}`,
                entityId: vehicle.id,
                entityName: `${vehicle.year} ${vehicle.model} (${vehicle.licensePlate})`,
                date: vehicle.nextServiceDate,
                details: `Due in ${vehicle.daysToService ?? '?'} days`
            });
        }

        // Document Alerts
        checkExpiry(alerts, vehicle, 'Registration', vehicle.registrationExpiry);
        checkExpiry(alerts, vehicle, 'Insurance', vehicle.insuranceExpiry);
        checkExpiry(alerts, vehicle, 'Fitness Cert', vehicle.fitnessExpiry);
    });

    return alerts;
}

function checkExpiry(alerts: FleetAlert[], vehicle: Vehicle, docType: string, dateStr?: string) {
    if (!dateStr) return;
    
    const expiry = parseISO(dateStr);
    const today = new Date();
    const daysLeft = differenceInDays(expiry, today);

    if (daysLeft < 0) {
        alerts.push({
            id: `alert-doc-crit-${vehicle.id}-${docType}`,
            type: 'expiry',
            severity: 'critical',
            message: `${docType} Expired: ${vehicle.licensePlate}`,
            entityId: vehicle.id,
            entityName: `${vehicle.year} ${vehicle.model}`,
            date: dateStr,
            details: `Expired ${Math.abs(daysLeft)} days ago`
        });
    } else if (daysLeft <= 30) {
        alerts.push({
            id: `alert-doc-warn-${vehicle.id}-${docType}`,
            type: 'expiry',
            severity: 'warning',
            message: `${docType} Expiring Soon: ${vehicle.licensePlate}`,
            entityId: vehicle.id,
            entityName: `${vehicle.year} ${vehicle.model}`,
            date: dateStr,
            details: `Expires in ${daysLeft} days`
        });
    }
}
