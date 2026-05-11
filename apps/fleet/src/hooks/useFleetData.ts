import { useState, useEffect, useCallback } from 'react';
import { equipmentService } from '../services/equipmentService';
import { inventoryService } from '../services/inventoryService';
import { api } from '../services/api';
import { EquipmentItem } from '../types/equipment';
import { InventoryItem } from '../types/fleet';
import { Vehicle } from '../types/vehicle';

export function useFleetExpenses() {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [equipData, vehicleData] = await Promise.all([
        equipmentService.getAllEquipment(),
        api.getVehicles()
      ]);
      setEquipment(equipData);
      setVehicles(vehicleData);
    } catch (err: any) {
      console.error("Failed to fetch fleet data", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    equipment,
    vehicles,
    loading,
    error,
    refresh: fetchData
  };
}

export function useInventory() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await inventoryService.getInventory();
      setInventory(data);
    } catch (err: any) {
      console.error("Failed to fetch inventory", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  return {
    inventory,
    loading,
    error,
    refresh: fetchInventory
  };
}
