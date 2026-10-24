import { getSupabaseFunctionsBaseUrl, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { supabasePlugApp } from '../../../packages/auth-client/src/supabase';
import { demoOn } from './demo/mode';
import { DEMO_PARISHES, DEMO_TOLLS, DEMO_TASKS } from './demo/fixtures';
import { demoParts, demoPlaces, demoStations, readDb, writeDb } from './demo/store';

const catalog = `${getSupabaseFunctionsBaseUrl()}/platform-catalog`;
const explorer = `${getSupabaseFunctionsBaseUrl()}/explorer`;

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabasePlugApp.auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function demoPublic(path: string): unknown {
  const url = new URL(path, 'https://plug.local');
  const name = url.pathname;
  if (name === '/stations') {
    const pcode = url.searchParams.get('pcode');
    const kind = url.searchParams.get('kind');
    let rows = demoStations();
    if (pcode) rows = rows.filter((row) => row.pcode === pcode);
    if (kind && kind !== 'fuel' && kind !== 'station') rows = [];
    return { stations: rows };
  }
  const station = name.match(/^\/stations\/([^/]+)$/);
  if (station) {
    const row = demoStations().find((item) => item.id === decodeURIComponent(station[1]));
    if (!row) throw new Error('Station not found');
    return { station: row };
  }
  if (name === '/places') {
    const kind = url.searchParams.get('kind');
    const pcode = url.searchParams.get('pcode');
    let rows = demoPlaces();
    if (kind) rows = rows.filter((row) => row.kind === kind);
    if (pcode) rows = rows.filter((row) => row.pcode === pcode);
    return { places: rows };
  }
  const place = name.match(/^\/places\/([^/]+)$/);
  if (place) {
    const row = demoPlaces().find((item) => item.id === decodeURIComponent(place[1]));
    if (!row) throw new Error('Place not found');
    return { place: row };
  }
  if (name === '/geo/parishes') return { parishes: DEMO_PARISHES };
  if (name === '/tolls') return { plazas: DEMO_TOLLS };
  if (name === '/parts') return { parts: demoParts(), comingSoon: false };
  if (name === '/schedules') return { tasks: DEMO_TASKS, generalSchedule: false };
  if (name === '/vehicle-catalog') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const vehicles = [
      { id: 'demo-variant', make: 'Toyota', model: 'Roomy', year: 2019, trim_series: 'G' },
      { id: 'demo-honda', make: 'Honda', model: 'Fit', year: 2018, trim_series: 'LX' },
    ].filter((row) => !q || `${row.make} ${row.model}`.toLowerCase().includes(q));
    return { vehicles };
  }
  throw new Error('Could not load that');
}

function demoSend(path: string, method: string, payload?: unknown): unknown {
  const body = (payload || {}) as Record<string, unknown>;
  const db = readDb();
  const url = new URL(path, 'https://plug.local');
  const name = url.pathname;
  if (name === '/flags' && method === 'GET') {
    return {
      flags: {
        'plug.explore': true,
        'plug.fuel_log': true,
        'plug.garage': true,
        'plug.parts': true,
        'plug.map_it': true,
        'plug.tolls': true,
        'plug.documents': true,
      },
    };
  }
  if (name === '/profile') return { ok: true };
  if (name === '/garage') return { vehicles: db.vehicles };
  if (name === '/vehicles' && method === 'POST') {
    const vehicle = {
      id: `demo-car-${db.vehicles.length + 1}`,
      nickname: String(body.nickname || 'DEMO car'),
      year: Number(body.year) || new Date().getFullYear(),
      catalog_variant_id: (body.catalogVariantId as string) || null,
      starting_odometer: Number(body.startingOdometer) || 0,
      make: String(body.make || ''),
      model: String(body.model || ''),
    };
    db.vehicles = [...db.vehicles, vehicle];
    writeDb(db);
    sessionStorage.setItem('plug-vehicle', vehicle.id);
    return { vehicle };
  }
  const removeVehicle = name.match(/^\/vehicles\/([^/]+)$/);
  if (removeVehicle && method === 'DELETE') {
    db.vehicles = db.vehicles.filter((row) => row.id !== decodeURIComponent(removeVehicle[1]));
    writeDb(db);
    return { ok: true };
  }
  if (name === '/fuel-logs' && method === 'POST') {
    if (!body.vehicleId) throw new Error('Add a vehicle first');
    db.fills += 1;
    db.logs.unshift({
      id: `demo-fill-${db.fills}`,
      vehicle_id: String(body.vehicleId),
      grade: String(body.grade || 'e10_87'),
      amount: Number(body.amount) || 0,
      litres: Number(body.litres) || 0,
      odometer: Number(body.odometer) || 0,
      station_id: (body.stationId as string) || null,
      created_at: new Date().toISOString(),
    });
    writeDb(db);
    return { ok: true, first: db.fills === 1 };
  }
  if (name === '/fuel-logs') return { logs: db.logs };
  if (name === '/services' && method === 'POST') {
    db.services.unshift({
      id: `demo-svc-${db.services.length + 1}`,
      vehicle_id: String(body.vehicleId || 'demo-car'),
      op_code: String(body.opCode || 'oil'),
      odometer: body.odometer == null ? null : Number(body.odometer),
      done_on: String(body.doneOn || new Date().toISOString().slice(0, 10)),
    });
    writeDb(db);
    return { id: db.services[0]?.id };
  }
  if (name === '/services') return { services: db.services };
  if (name === '/reminders' && method === 'POST') {
    db.reminders.unshift({
      id: `demo-rem-${db.reminders.length + 1}`,
      vehicle_id: String(body.vehicleId || 'demo-car'),
      kind: String(body.kind || 'fitness'),
      due_on: (body.dueOn as string) || null,
    });
    writeDb(db);
    return { reminder: db.reminders[0] };
  }
  if (name === '/reminders') return { reminders: db.reminders };
  if (name === '/pins' && method === 'POST') {
    const pin = {
      id: `demo-pin-${db.pins.length + 1}`,
      name: String(body.name || 'DEMO place'),
      status: 'pending' as const,
      kind: String(body.kind || 'mechanic'),
      lat: Number(body.lat) || 18.01,
      lng: Number(body.lng) || -76.8,
      pcode: 'JM-SA',
    };
    db.pins = [pin, ...db.pins];
    db.notes.unshift({
      id: `demo-note-${db.notes.length + 1}`,
      title: 'DEMO Pin received',
      body: `${pin.name} is waiting for approval.`,
      created_at: new Date().toISOString(),
    });
    writeDb(db);
    return { id: pin.id, status: 'pending' };
  }
  const withdraw = name.match(/^\/pins\/([^/]+)\/withdraw$/);
  if (withdraw) {
    db.pins = db.pins.filter((row) => row.id !== decodeURIComponent(withdraw[1]));
    writeDb(db);
    return { ok: true };
  }
  if (name === '/contributions') {
    return { pins: db.pins, level: { name: 'Mapper', nextAt: 5 }, trust: { score: 1, approved_count: 1, rejected_count: 0 } };
  }
  if (name === '/notifications') return { notifications: db.notes };
  if (name === '/me/export') return { profile: { name: 'DEMO driver' }, garage: db };
  if (name === '/me' && method === 'DELETE') {
    writeDb({ vehicles: [], logs: [], services: [], reminders: [], pins: [], notes: [], fills: 0 });
    sessionStorage.removeItem('plug-demo-signed-in');
    return { ok: true };
  }
  if (name === '/care') return { dueOn: null, status: 'upcoming' };
  if (name === '/push/public-key') return { publicKey: '' };
  if (name === '/push-subscriptions') return { ok: true };
  if (name === '/demand') return { ok: true };
  return { ok: true };
}

export async function publicGet<T>(path: string): Promise<T> {
  if (demoOn()) return demoPublic(path) as T;
  const response = await fetch(`${catalog}${path}`, { headers: supabaseAnonFunctionHeaders() });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not load that');
  return body as T;
}

export async function plugSend<T>(path: string, method: string, payload?: unknown): Promise<T> {
  if (demoOn()) return demoSend(path, method, payload) as T;
  const response = await fetch(`${explorer}${path}`, {
    method,
    headers: supabaseAnonFunctionHeaders(await authHeaders() as Record<string, string>),
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not save that');
  return body as T;
}

export function googleDirections(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function wazeDirections(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}
