import { EquipmentItem, DamageReport, EquipmentStatus } from '../types/equipment';

export const createDamageReport = (
    reporterName: string,
    types: string[],
    severity: string,
    description: string,
    images: string[] = [],
    cost?: number,
    merchant?: string,
    customDate?: string
): DamageReport => {
    return {
        id: crypto.randomUUID(),
        date: customDate || new Date().toISOString(),
        reporterName,
        type: types,
        severity,
        description,
        images,
        cost,
        merchant
    };
};

export const appendDamageHistory = (
    item: EquipmentItem,
    report: DamageReport
): EquipmentItem => {
    const history = item.damageHistory ? [...item.damageHistory, report] : [report];
    
    // Determine new status based on report logic
    // If report mentions "Missing Parts", status should be 'Missing'.
    // Otherwise, it defaults to 'Damaged' unless currently 'Maintenance' implies otherwise, 
    // but usually a new report implies damage.
    let newStatus: EquipmentStatus = 'Damaged';
    
    // Check if "Missing Parts" is in the types
    if (report.type.some(t => t.toLowerCase().includes('missing'))) {
        newStatus = 'Missing';
    }

    // We preserve 'Maintenance' if the item was already in maintenance and this isn't a new damage? 
    // Actually, usually a report from a driver means something is wrong.

    return {
        ...item,
        status: newStatus,
        damageHistory: history,
        updatedAt: new Date().toISOString(),
        // Update notes with latest report summary for backward compatibility/easy view
        notes: `[${new Date(report.date).toLocaleDateString()}] ${report.type.join(', ')} (${report.severity}): ${report.description}`
    };
};
