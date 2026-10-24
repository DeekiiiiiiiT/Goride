import {
  DEMO_PARTS,
  DEMO_PLACES,
  DEMO_STATIONS,
  seedPins,
  seedVehicle,
  type DemoPin,
  type DemoVehicle,
} from './fixtures';

export type DemoDb = {
  vehicles: DemoVehicle[];
  logs: { id: string; vehicle_id: string; grade: string; amount: number; litres: number; odometer: number; station_id: string | null; created_at: string }[];
  services: { id: string; vehicle_id: string; op_code: string; odometer: number | null; done_on: string }[];
  reminders: { id: string; vehicle_id: string; kind: string; due_on: string | null }[];
  pins: DemoPin[];
  notes: { id: string; title: string; body: string; created_at: string }[];
  fills: number;
};

const KEY = 'plug-demo-db';

function fresh(): DemoDb {
  return {
    vehicles: [seedVehicle()],
    logs: [],
    services: [],
    reminders: [{ id: 'demo-fit', vehicle_id: 'demo-car', kind: 'fitness', due_on: '2026-12-01' }],
    pins: seedPins(),
    notes: [{ id: 'demo-note', title: 'DEMO Pin received', body: 'Your pin is waiting for approval.', created_at: new Date().toISOString() }],
    fills: 0,
  };
}

export function readDb(): DemoDb {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return fresh();
    return { ...fresh(), ...JSON.parse(raw) } as DemoDb;
  } catch {
    return fresh();
  }
}

export function writeDb(db: DemoDb) {
  sessionStorage.setItem(KEY, JSON.stringify(db));
  window.dispatchEvent(new Event('plug-refresh'));
}

export function resetDemoDb() {
  sessionStorage.removeItem(KEY);
}

export function demoStations() {
  return DEMO_STATIONS;
}

export function demoPlaces() {
  return DEMO_PLACES;
}

export function demoParts() {
  return DEMO_PARTS;
}
