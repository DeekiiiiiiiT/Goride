/**
 * Pure stamp metadata helpers (no KV).
 * Run: deno test --no-check station_attach.test.ts merchant_station_match.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  applyMerchantHealMetadata,
  isAttachProtected,
} from "./station_attach_meta.ts";

Deno.test("isAttachProtected: GPS verified blocked", () => {
  assertEquals(
    isAttachProtected({
      metadata: {
        locationStatus: "verified",
        verificationMethod: "gps_smart_matching",
      },
    }),
    true,
  );
});

Deno.test("isAttachProtected: platform_ops_override blocked", () => {
  assertEquals(
    isAttachProtected({
      metadata: {
        locationStatus: "verified",
        verificationMethod: "platform_ops_override",
      },
    }),
    true,
  );
});

Deno.test("isAttachProtected: review_required not protected", () => {
  assertEquals(
    isAttachProtected({
      metadata: {
        locationStatus: "review_required",
        verificationMethod: "gps_ambiguous",
      },
    }),
    false,
  );
});

Deno.test("applyMerchantHealMetadata clears review and sets verified", () => {
  const entry: Record<string, unknown> = {
    vendor: "Unknown",
    location: "Unknown Vendor",
    metadata: {
      locationStatus: "review_required",
      verificationMethod: "gps_ambiguous",
      ambiguityReason: "too far",
      learntLocationId: "learnt-1",
      stationGateHold: true,
    },
  };
  applyMerchantHealMetadata(
    entry,
    { id: "st-1", name: "FESCO BEECHWOOD", status: "verified" },
    0.95,
    "FESCO BEECHWOOD",
  );
  const meta = entry.metadata as Record<string, unknown>;
  assertEquals(meta.locationStatus, "verified");
  assertEquals(meta.verificationMethod, "merchant_name_autoheal");
  assertEquals(entry.matchedStationId, "st-1");
  assertEquals(entry.vendor, "FESCO BEECHWOOD");
  assertEquals(meta.ambiguityReason, undefined);
  assertEquals(meta.learntLocationId, undefined);
  assertEquals(meta.stationGateHold, undefined);
  assertEquals(typeof meta.autoHealedAt, "string");
  assertEquals(meta.autoHealScore, 0.95);
});
