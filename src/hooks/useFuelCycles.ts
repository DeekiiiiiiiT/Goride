import { useMemo } from 'react';
import { FuelEntry } from '../types/fuel';
import { calculateFuelCycles, FuelCycle } from '../utils/fuelCycleEngine';
import { Vehicle } from '../types/vehicle';

export function useFuelCycles(entries: FuelEntry[], vehicles: Vehicle[] = []) {
    return useMemo(() => {
        if (!entries || entries.length === 0) return [];
        return calculateFuelCycles(entries, vehicles);
    }, [entries, vehicles]);
}
