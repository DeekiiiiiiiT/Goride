/** Test fixture values — plate TEST-01, Nissan Note, etc. */

export const findPartsFixtureVehicle = {
  id: "veh-fixture-1",
  vehicle_id: "veh-fixture-1",
  plate: "TEST-01",
  label: "2016 Nissan Note",
  parts_on_shelf: 2,
  subtitle: "1.6 petrol · FIX-VAR · FWD",
  hub: "Fixture hub",
};

export const findPartsFixturePart = {
  id: "part-fixture-1",
  name: "Fixture Oil Filter",
  oem_part_number: "FIX-9999",
  brand: "Fixture OEM",
  manufacturer: "Fixture OEM",
  maintenance_component_id: "cmp-1",
};

export const findPartsFixtureOffer = {
  supplier_name: "Fixture Motors",
  landedCostJmd: 9999,
  lead_time_days: 2,
};

export const findPartsFixtureBrowse = {
  total: 3,
  common: [
    { id: "cmp-oil", name: "Fixture oil filter", priceJmd: 4200 },
    { id: "cmp-pad", name: "Fixture brake pads", priceJmd: 8900 },
  ],
  areas: [
    {
      id: "brakes",
      name: "Braking",
      parts: [{ id: "cmp-rotor", name: "Fixture rotor", priceJmd: 12000 }],
    },
  ],
};

export const findPartsFixtureFindSections = [
  {
    tier: 1,
    label: "Best match",
    items: [{
      part: findPartsFixturePart,
      stockQty: 2,
      matchPct: 100,
      offers: [findPartsFixtureOffer, { supplier_name: "Fixture Spares", landedCostJmd: 10200, lead_time_days: 4 }],
    }],
  },
  {
    tier: 2,
    label: "Alternate",
    items: [{
      part: { ...findPartsFixturePart, id: "part-fixture-2", name: "Fixture spin-on filter" },
      stockQty: 0,
      matchPct: 92,
      offers: [{ supplier_name: "Fixture Wholesale", landedCostJmd: 7800 }],
    }],
  },
];

export const findPartsFixtureVersions = [
  { id: "var-fix-1", name: "1.6 petrol", description: "FIX-VAR · FWD", chassisPrefix: "FIX-1000001", fleetCount: 1 },
  { id: "var-fix-2", name: "1.5 hybrid", description: "FIX-HYB · CVT", chassisPrefix: "FIX-2000001", fleetCount: 0 },
];
