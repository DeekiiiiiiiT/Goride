import { useMemo } from 'react';
import { FuelEntry, FuelCycle } from '../types/fuel';
import { calculateFuelCycles } from '../utils/fuelCycleEngine';
import { Vehicle } from '../types/vehicle';

export function useFuelCycles(entries: FuelEntry[], vehicles: Vehicle[] = []): FuelCycle[] {
    return useMemo(() => {
        if (!entries || entries.length === 0) return [];
        return calculateFuelCycles(entries, vehicles);
    }, [entries, vehicles]);
}
