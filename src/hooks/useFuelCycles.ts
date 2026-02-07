import { useMemo } from 'react';
import { FuelEntry } from '../types/fuel';
import { calculateFuelCycles, FuelCycle } from '../utils/fuelCycleEngine';

export function useFuelCycles(entries: FuelEntry[]) {
    return useMemo(() => {
        if (!entries || entries.length === 0) return [];
        return calculateFuelCycles(entries);
    }, [entries]);
}
