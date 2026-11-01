/** Minimal types retained after legacy equipment UI removal (R3-17). */
export type DamageReport = {
  id: string;
  vehicleId: string;
  reportedAt: string;
  description?: string;
  severity?: string;
  status?: string;
};

export type EquipmentItem = {
  id: string;
  vehicleId?: string;
  name?: string;
  status?: string;
};
