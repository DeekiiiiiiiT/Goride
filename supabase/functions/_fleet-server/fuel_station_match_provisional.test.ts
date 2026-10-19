import { assertEquals } from "jsr:@std/assert";
import { applyStationMatch, type StationMatchDeps } from "./fuel_station_match.ts";

function memoryDeps(stations: Record<string, unknown>[]): {
  deps: StationMatchDeps;
  store: Map<string, unknown>;
} {
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

const fesco = {
  id: "9d72d4e7-369b-40eb-b730-e4f751c5640b",
  name: "FESCO Spanish Town Road",
  brand: "FESCO",
  address: "Spanish Town Road",
  status: "verified",
  geofenceRadius: 75,
  location: { lat: 18.0103125, lng: -76.8375625 },
};

const csvTwin = {
  id: "csv-twin",
  name: "FESCO CSV Twin",
  brand: "FESCO",
  address: "Spanish Town Road",
  status: "unverified",
  location: { lat: 18.0103125, lng: -76.8375625 },
};

Deno.test("397m late log → provisional LATE_LOG, no learnt, no GPS alias", async () => {
  const { deps, store } = memoryDeps([fesco]);
  const entry: Record<string, any> = {
    id: "incident-fill",
    metadata: {
      locationMetadata: {
        lat: 18.0075033,
        lng: -76.8352467,
        accuracy: 2.4,
        fixAt: "2026-10-18T00:10:32Z",
        ageS: 5,
      },
    },
  };
  const match = await applyStationMatch(entry, { deferSignature: true, deps });
  assertEquals(match.outcome, "provisional");
  assertEquals(entry.metadata.locationStatus, "provisional");
  assertEquals(entry.matchedStationId, fesco.id);
  assertEquals(entry.metadata.stationResolution?.reason, "LATE_LOG");
  assertEquals(entry.metadata.learntLocationId, undefined);
  const learntKeys = [...store.keys()].filter((k) => k.startsWith("learnt_location:"));
  assertEquals(learntKeys.length, 0);
  // Provisional must not write a GPS alias onto the station record
  const stored = store.get(`station:${fesco.id}`) as { gpsAliases?: unknown[] } | undefined;
  assertEquals(Array.isArray(stored?.gpsAliases) ? stored!.gpsAliases!.length : 0, 0);
});

Deno.test("unverified CSV twin at 0m does not win over verified", async () => {
  const { deps } = memoryDeps([csvTwin, fesco]);
  const entry: Record<string, any> = {
    id: "at-pump",
    metadata: {
      locationMetadata: { lat: 18.0103125, lng: -76.8375625, accuracy: 3 },
    },
  };
  const match = await applyStationMatch(entry, { deferSignature: true, deps });
  assertEquals(match.outcome, "verified");
  assertEquals(entry.matchedStationId, fesco.id);
});

const farStation = {
  id: "far-station",
  name: "Far Away Fuels",
  brand: "FAR",
  status: "verified",
  geofenceRadius: 75,
  // ~5 km from FESCO Spanish Town Road
  location: { lat: 18.055, lng: -76.8375625 },
};

Deno.test("O2: claim 5 km away with no local GPS hit → not provisional", async () => {
  const { deps, store } = memoryDeps([farStation]);
  const entry: Record<string, any> = {
    id: "claim-far",
    metadata: {
      locationMetadata: {
        lat: 18.0075033,
        lng: -76.8352467,
        accuracy: 5,
        fixAt: "2026-10-18T00:10:32Z",
        ageS: 5,
      },
      driverClaim: {
        stationId: farStation.id,
        stationName: farStation.name,
        leftStation: true,
        minutesAgo: 10,
      },
    },
  };
  const match = await applyStationMatch(entry, { deferSignature: true, deps });
  assertEquals(match.outcome, "learnt");
  assertEquals(entry.metadata.locationStatus, "unknown");
  assertEquals(entry.metadata.stationResolution?.evidence?.driverClaim?.stationId, farStation.id);
  const learntKeys = [...store.keys()].filter((k) => k.startsWith("learnt_location:"));
  assertEquals(learntKeys.length, 1);
});

Deno.test("O2: claim differs from GPS provisional → review_required", async () => {
  const { deps } = memoryDeps([fesco]);
  const entry: Record<string, any> = {
    id: "claim-differs",
    metadata: {
      locationMetadata: {
        lat: 18.0075033,
        lng: -76.8352467,
        accuracy: 5,
        ageS: 5,
      },
      driverClaim: {
        stationId: farStation.id,
        stationName: farStation.name,
        leftStation: true,
        minutesAgo: 10,
      },
    },
  };
  const match = await applyStationMatch(entry, { deferSignature: true, deps });
  assertEquals(match.outcome, "review_required");
  assertEquals(entry.metadata.locationStatus, "review_required");
  assertEquals(entry.metadata.stationResolution?.reason, "DRIVER_CLAIM_CONFLICT");
  assertEquals(entry.metadata.stationResolution?.gpsStationId, fesco.id);
  assertEquals(entry.metadata.stationResolution?.claimStationId, farStation.id);
});
