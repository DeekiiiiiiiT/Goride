import { DriverProfile } from '../components/drivers/DriversPage';
import { Vehicle } from '../types/vehicle';

/**
 * Normalizes a string for fuzzy matching (lowercase, alphanumeric only)
 */
export const normalizeIdentityString = (str: string): string => {
    return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
};

/**
 * Fuzzy matching strategy for Drivers
 */
export const findMatchingDriver = (
    query: { id?: string; name?: string; externalId?: string },
    drivers: any[]
) => {
    if (!drivers || drivers.length === 0) return null;

    const normalizedQueryName = normalizeIdentityString(query.name || '');
    const normalizedQueryId = query.id ? query.id.trim() : '';
    const normalizedQueryExt = query.externalId ? query.externalId.trim() : '';

    return drivers.find(d => {
        // 1. Exact ID Match
        if (normalizedQueryId && d.id === normalizedQueryId) return true;

        // 2. External ID Match
        if (normalizedQueryExt) {
            if (d.uberDriverId === normalizedQueryExt || d.inDriveDriverId === normalizedQueryExt) return true;
        }

        // 3. Name Match (Fuzzy)
        if (normalizedQueryName) {
            const normalizedDriverName = normalizeIdentityString(d.name || '');
            if (normalizedDriverName === normalizedQueryName) return true;
        }

        return false;
    });
};

/**
 * Fuzzy matching strategy for Vehicles
 */
export const findMatchingVehicle = (
    query: { id?: string; licensePlate?: string },
    vehicles: any[]
) => {
    if (!vehicles || vehicles.length === 0) return null;

    const normalizedQueryPlate = normalizeIdentityString(query.licensePlate || '');
    const normalizedQueryId = query.id ? query.id.trim() : '';

    return vehicles.find(v => {
        // 1. Exact ID Match
        if (normalizedQueryId && v.id === normalizedQueryId) return true;

        // 2. License Plate Match (Fuzzy)
        if (normalizedQueryPlate) {
            const normalizedVehiclePlate = normalizeIdentityString(v.licensePlate || '');
            if (normalizedVehiclePlate === normalizedQueryPlate) return true;
        }

        return false;
    });
};
