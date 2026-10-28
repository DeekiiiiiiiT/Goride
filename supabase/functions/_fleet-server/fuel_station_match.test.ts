/**
 * Split fill uses the same station match as a gas-card fill.
 */
import { assertEquals } from "jsr:@std/assert";
import {
  applyStationMatch,
  fuelStationFromNearbyRow,
  mirrorStationOntoCash,
  type StationMatchDeps,
} from "./fuel_station_match.ts";

function memoryDeps(stations: Record<string, unknown>[]): { deps: StationMatchDeps; store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  for (const station of stations) {
    store.set(`station:${station.id}`, station);
  }
  const deps: StationMatchDeps = {
    get: async (key) => store.get(key),
    set: async (key, value) => {
      store.set(key, value);
    },
    getByPrefix: async (prefix) => {
      const out: unknown[] = [];
      for (const [key, value] of store) {
        if (key.startsWith(prefix)) out.push(value);
      }
      return out;
    },
  };
  return { deps, store };
}

const jampet = {
  id: "jampet",
  name: "Jampet Service Station",
  brand: "Independent",
  address: "Portmore",
  status: "verified",
  geofenceRadius: 150,
  location: { lat: 17.991, lng: -76.979 },
};

Deno.test("split card 10m from a verified station matches both halves", async () => {
  const { deps } = memoryDeps([jampet]);
  const card: Record<string, any> = {
    id: "card-1",
    liters: 0,
    amount: 0,
    metadata: {
      locationMetadata: { lat: 17.99109, lng: -76.979, accuracy: 1.2 },
    },
  };
  const cash: Record<string, any> = { id: "cash-1", metadata: { fillGroupId: "fg" } };
  const match = await applyStationMatch(card, { deferSignature: true, deps });
  mirrorStationOntoCash(card, cash);
  assertEquals(match.outcome, "verified");
  assertEquals(card.matchedStationId, "jampet");
  assertEquals(card.vendor, "Jampet Service Station");
  assertEquals(card.metadata.locationStatus, "verified");
  assertEquals(cash.matchedStationId, "jampet");
  assertEquals(cash.vendor, "Jampet Service Station");
  assertEquals(cash.metadata.locationStatus, "verified");
  assertEquals(cash.metadata.verificationMethod, "gps_handshake");
});

Deno.test("verified station with pinConfirmed false is excluded from GPS match", async () => {
  const placeholder = {
    ...jampet,
    id: "united-placeholder",
    name: "United Petroleum Placeholder",
    pinConfirmed: false,
  };
  const { deps } = memoryDeps([placeholder]);
  const card: Record<string, any> = {
    id: "card-pin",
    liters: 0,
    amount: 0,
    metadata: {
      locationMetadata: { lat: 17.99109, lng: -76.979, accuracy: 1.2 },
    },
  };
  const match = await applyStationMatch(card, { deferSignature: true, deps });
  assertEquals(match.outcome === "verified", false);
  assertEquals(card.matchedStationId, undefined);
});

Deno.test("split card with no GPS is held and both rows can still be saved", async () => {
  const { deps, store } = memoryDeps([]);
  const card: Record<string, any> = {
    id: "card-2",
    driverId: "drv-1",
    metadata: { fillGroupId: "fg-2" },
  };
  const cash: Record<string, any> = { id: "cash-2", metadata: { fillGroupId: "fg-2" } };
  const match = await applyStationMatch(card, { deferSignature: true, deps });
  mirrorStationOntoCash(card, cash);
  assertEquals(match.outcome, "no_gps");
  assertEquals(card.metadata.stationGateHold, true);
  assertEquals(card.metadata.locationStatus, "unknown");
  assertEquals(typeof card.metadata.learntLocationId, "string");
  assertEquals(store.has(`learnt_location:${card.metadata.learntLocationId}`), true);
  assertEquals(cash.id, "cash-2");
  assertEquals(cash.metadata.locationStatus, "unknown");
  assertEquals(card.id, "card-2");
  const saved = store.get(`learnt_location:${card.metadata.learntLocationId}`) as { originApp?: string } | undefined;
  assertEquals(saved?.originApp, "roam_fleet");
});

Deno.test("a second fill at a learnt pin reuses it", async () => {
  const learnt = {
    id: "learnt-1",
    name: "Roadside pump",
    status: "learnt",
    pinConfirmed: false,
    location: { lat: 17.991, lng: -76.979 },
    geofenceRadius: 150,
  };
  const store = new Map<string, unknown>([[`learnt_location:${learnt.id}`, learnt]]);
  const deps: StationMatchDeps = {
    get: async (key) => store.get(key),
    set: async (key, value) => { store.set(key, value); },
    getByPrefix: async (prefix) => [...store.entries()].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value),
  };
  const card: Record<string, any> = {
    id: "card-learnt",
    liters: 10,
    amount: 2800,
    metadata: { locationMetadata: { lat: 17.99105, lng: -76.979, accuracy: 5 } },
  };
  const match = await applyStationMatch(card, { deferSignature: true, deps });
  assertEquals(match.outcome, "learnt");
  assertEquals(card.metadata.learntLocationId, "learnt-1");
  assertEquals(card.metadata.locationStatus, "unknown");
  assertEquals([...store.keys()].filter((key) => key.startsWith("learnt_location:")).length, 1);
});

Deno.test("a GPS match writes back the full station (brand and address unchanged)", async () => {
  const full = {
    id: "rubis-spanish-town",
    name: "Rubis Spanish Town",
    brand: "Rubis",
    address: "Spanish Town Road",
    parish: "St. Catherine",
    phone: "876-555-0100",
    status: "verified",
    pinConfirmed: true,
    geofenceRadius: 180,
    location: { lat: 17.991, lng: -76.979 },
    stats: { totalVisits: 4, lastPrice: 172 },
  };
  const stripped = fuelStationFromNearbyRow({
    id: full.id,
    name: full.name,
    status: "verified",
    lat: 17.991,
    lng: -76.979,
    effective_geofence_m: 150,
    pin_state: "confirmed",
  });
  const store = new Map<string, unknown>([[`station:${full.id}`, full]]);
  const deps: StationMatchDeps = {
    get: async (key) => store.get(key),
    set: async (key, value) => { store.set(key, value); },
    getByPrefix: async () => [],
    loadFuelPool: async () => [stripped],
  };
  const card: Record<string, any> = {
    id: "card-full",
    liters: 20,
    amount: 3600,
    metadata: { locationMetadata: { lat: 17.99105, lng: -76.979, accuracy: 8 } },
  };
  const match = await applyStationMatch(card, { deferSignature: true, deps });
  const saved = store.get(`station:${full.id}`) as Record<string, any>;
  assertEquals(match.outcome, "verified");
  assertEquals(saved.brand, "Rubis");
  assertEquals(saved.address, "Spanish Town Road");
  assertEquals(saved.parish, "St. Catherine");
  assertEquals(saved.phone, "876-555-0100");
  assertEquals(saved.pinConfirmed, true);
  assertEquals(saved.geofenceRadius, 180);
  assertEquals(saved.stats.totalVisits, 5);
  assertEquals(card.stationAddress, "Spanish Town Road");
  assertEquals(stripped.brand, "");
  assertEquals(stripped.address, "");
});
