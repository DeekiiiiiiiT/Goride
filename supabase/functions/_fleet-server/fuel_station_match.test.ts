/**
 * Split fill uses the same station match as a gas-card fill.
 */
import { assertEquals } from "jsr:@std/assert";
import {
  applyStationMatch,
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
});
