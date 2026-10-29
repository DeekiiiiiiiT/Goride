import { assertEquals } from "jsr:@std/assert";
import { mergeStationPayload } from "./station_merge.ts";

Deno.test("partial station POST keeps parish, geofence, aliases, phone, amenities and pin", () => {
  const existing = {
    id: "station-1",
    name: "RUBiS Half Way Tree",
    parish: "Saint Andrew",
    geofenceRadius: 80,
    gpsAliases: [{ lat: 18.01, lng: -76.79 }],
    aliases: ["RUBIS HWT"],
    contactInfo: { phone: "876-555-0100" },
    amenities: ["restrooms", "convenience_store"],
    pinConfirmed: true,
    pin_state: "confirmed",
    plusCode: "776W+2X",
    verifiedAt: "2026-01-01T00:00:00.000Z",
  };
  const saved = mergeStationPayload(existing, { id: "station-1", isPreferred: true });
  assertEquals(saved.isPreferred, true);
  assertEquals(saved.parish, "Saint Andrew");
  assertEquals(saved.geofenceRadius, 80);
  assertEquals(saved.gpsAliases, existing.gpsAliases);
  assertEquals(saved.aliases, existing.aliases);
  assertEquals(saved.contactInfo, existing.contactInfo);
  assertEquals(saved.amenities, existing.amenities);
  assertEquals(saved.pinConfirmed, true);
  assertEquals(saved.pin_state, "confirmed");
  assertEquals(saved.plusCode, "776W+2X");
  assertEquals(saved.verifiedAt, existing.verifiedAt);
});

Deno.test("an explicit empty string clears a station field", () => {
  const saved = mergeStationPayload(
    { id: "station-1", parish: "Saint Andrew", phone: "876-555-0100" },
    { phone: "" },
  );
  assertEquals(saved.parish, "Saint Andrew");
  assertEquals(saved.phone, "");
});

Deno.test("a new station is stored as sent", () => {
  const saved = mergeStationPayload(null, { id: "new", name: "New station" });
  assertEquals(saved, { id: "new", name: "New station" });
});
