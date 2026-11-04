/**
 * AM-S4 find-parts mock rows shaped like `parts_for_vehicle` / find-parts API output.
 * Part numbers and params come from live Roomy catalog (csfllzzastacofsvcdsc, Nov 2026)
 * plus valid enum combinations from parts_for_vehicle SQL where live data has no row yet.
 */
import { formatMatchWhyLine } from "../packages/types/src/partMatchReason";

const AM_PART_ID = "d4444444-4444-4444-8444-444444444444";
const AM_DERIVED_ID = "11111111-1111-4111-8111-111111111115";
const AM_GROUP_ID = "g1111111-1111-4111-8111-111111111111";
const AM_VARIANT_ID = "b2222222-2222-4222-8222-222222222222";

const G2 = "22222222-2222-4222-8222-222222222222";
const G3 = "33333333-3333-4333-8333-333333333333";
const G4 = "44444444-4444-4444-8444-444444444444";
const G5 = "55555555-5555-4555-8555-555555555555";

function d(suffix: string) {
  return `11111111-1111-4111-8111-11111111${suffix}`;
}

type StitchRow = Record<string, unknown>;

function stitchRow(row: {
  partId: string;
  derivedId?: string | null;
  groupId: string;
  brand: string;
  number: string;
  name: string;
  tier: number;
  partKind: string;
  fitSource: string;
  via: string;
  matchReasonCode: string;
  matchReasonParams?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  matchStatus?: string;
  position?: string | null;
  side?: string | null;
  wva?: string | null;
  linkComponentName?: string | null;
  wvaPeerLabel?: string;
}): StitchRow {
  const matchStatus = row.matchStatus ?? "live";
  return {
    partId: row.partId,
    derivedId: row.derivedId ?? null,
    groupId: row.groupId,
    brand: row.brand,
    number: row.number,
    name: row.name,
    tier: row.tier,
    partKind: row.partKind,
    fitSource: row.fitSource,
    via: row.via,
    matchReasonCode: row.matchReasonCode,
    matchReasonParams: row.matchReasonParams ?? null,
    matchStatus,
    status: matchStatus === "needs_checking" ? "needs_checking" : "verified",
    reason: formatMatchWhyLine(row.matchReasonCode, row.matchReasonParams, row.fitSource),
    position: row.position ?? "front",
    side: row.side ?? null,
    wva: row.wva ?? null,
    linkComponentName: row.linkComponentName ?? null,
    wvaPeerLabel: row.wvaPeerLabel,
    fitsVariantIds: [AM_VARIANT_ID],
  };
}

/** Stitch AM-S4 tier sections for e2e mocks. */
export function findPartsStitchPlainSections() {
  return [
    {
      tier: 1,
      plainLabel: "Made for your car",
      tag: "OEM",
      plainReason: "",
      items: [
        stitchRow({
          partId: "a1111111-1111-4111-8111-111111111101",
          derivedId: d("101"),
          groupId: AM_GROUP_ID,
          brand: "Toyota",
          number: "04465-B1190",
          name: "Front brake pad set",
          tier: 1,
          partKind: "oem",
          fitSource: "derived",
          via: "direct",
          matchReasonCode: "oe_number",
          matchReasonParams: { oe_number: "04465-B1190", oe_brand: "Toyota" },
          wva: "24551",
        }),
        stitchRow({
          partId: "a1111111-1111-4111-8111-111111111102",
          derivedId: d("102"),
          groupId: AM_GROUP_ID,
          brand: "Toyota",
          number: "04465-B1191",
          name: "Brake Pad Kit, Disc Front",
          tier: 1,
          partKind: "oem",
          fitSource: "kept",
          via: "direct",
          matchReasonCode: "oe_number_superseded",
          matchReasonParams: { oe_number: "04465-B1190", from: "04465-B1190", to: "04465-B1191", oe_brand: "Toyota" },
        }),
      ],
    },
    {
      tier: 2,
      plainLabel: "Same car, diff. badge",
      tag: "Sister",
      plainReason: "Daihatsu Thor / Subaru Justy",
      items: [
        stitchRow({
          partId: "a1111111-1111-4111-8111-111111111201",
          derivedId: d("201"),
          groupId: G2,
          brand: "Daihatsu",
          number: "04465-B1230",
          name: "Front Brake Pad Set (Thor Custom)",
          tier: 2,
          partKind: "oem",
          fitSource: "derived",
          via: "sister",
          matchReasonCode: "via_sister",
          matchReasonParams: { platform_code: "DAI-M900", source_vehicle_id: "thor-variant-id" },
        }),
        stitchRow({
          partId: "a1111111-1111-4111-8111-111111111202",
          groupId: G2,
          brand: "Subaru",
          number: "04465-B1320",
          name: "Disc Brake Pads (Justy M900F)",
          tier: 2,
          partKind: "oem",
          fitSource: "listed",
          via: "sister",
          matchReasonCode: "listed_direct",
          matchReasonParams: { part_listing_id: "2cfb9fed-c2c7-4786-9e27-a2d5599bf682" },
        }),
        stitchRow({
          partId: "a1111111-1111-4111-8111-111111111203",
          derivedId: d("203"),
          groupId: G3,
          brand: "Daihatsu",
          number: "04465-B1190",
          name: "Front brake pad set",
          tier: 2,
          partKind: "oem",
          fitSource: "derived",
          via: "sister",
          matchReasonCode: "via_sister",
          matchReasonParams: { platform_code: "DAI-M900" },
        }),
      ],
    },
    {
      tier: 3,
      plainLabel: "Fit the engine / Component",
      tag: "Cross-chassis",
      plainReason: "",
      items: [
        stitchRow({
          partId: "a1111111-1111-4111-8111-111111111301",
          derivedId: d("301"),
          groupId: G3,
          brand: "Mazda",
          number: "D6Y1-33-28Z",
          name: "Pad Set, Disc Brake",
          tier: 3,
          partKind: "oem",
          fitSource: "derived",
          via: "platform_link",
          matchReasonCode: "via_platform_link",
          matchReasonParams: {
            link_id: "link-am-s4-caliper",
            platform_code: "MAZ-DE",
            source_vehicle_id: "mazda-de-variant",
            source_tier: 1,
          },
          matchStatus: "needs_checking",
          linkComponentName: "caliper",
          side: "any",
        }),
        stitchRow({
          partId: "a1111111-1111-4111-8111-111111111302",
          groupId: G4,
          brand: "Daihatsu",
          number: "04465-B1010",
          name: "Front Brake Shoe & Liner",
          tier: 3,
          partKind: "oem",
          fitSource: "kept",
          via: "engine",
          matchReasonCode: "listed_direct",
          matchReasonParams: { part_listing_id: "kept-engine-tier3-listing" },
        }),
      ],
    },
    {
      tier: 4,
      plainLabel: "Other brands that replace it",
      tag: "Aftermarket",
      plainReason: "",
      items: [
        stitchRow({
          partId: AM_PART_ID,
          derivedId: AM_DERIVED_ID,
          groupId: G4,
          brand: "MK Kashiyama",
          number: "D0051M-01-J",
          name: "Premium Ceramic Disc Pad Set",
          tier: 4,
          partKind: "aftermarket",
          fitSource: "derived",
          via: "sister",
          matchReasonCode: "via_sister",
          matchReasonParams: { platform_code: "DAI-M900", source_vehicle_id: "thor-variant-id" },
          wva: "24551",
          wvaPeerLabel: "Same WVA 24551 as MK Kashiyama D0051M-01-J",
        }),
        stitchRow({
          partId: "d4444444-4444-4444-8444-444444444441",
          groupId: G4,
          brand: "Advics",
          number: "SN953P",
          name: "OEM Spec Front Brake Pads",
          tier: 4,
          partKind: "oe_supplier",
          fitSource: "kept",
          via: "direct",
          matchReasonCode: "listed_direct",
          matchReasonParams: { part_listing_id: "advics-kept-listing" },
        }),
        stitchRow({
          partId: "d4444444-4444-4444-8444-444444444444",
          derivedId: d("401"),
          groupId: G5,
          brand: "Brembo",
          number: "P 16 013",
          name: "Prime Axle Brake Pads",
          tier: 4,
          partKind: "aftermarket",
          fitSource: "listed",
          via: "sister",
          matchReasonCode: "listed_direct",
          matchReasonParams: { part_listing_id: "749f72d2-3a9f-4d8f-8f68-55b30f327cf2" },
        }),
        stitchRow({
          partId: "d4444444-4444-4444-8444-444444444443",
          derivedId: d("402"),
          groupId: G5,
          brand: "Bosch",
          number: "0 986 494 999",
          name: "QuietCast Premium Disc Pad",
          tier: 4,
          partKind: "aftermarket",
          fitSource: "derived",
          via: "direct",
          matchReasonCode: "index_badge",
          matchReasonParams: { index_type: "wva", value: "24551" },
        }),
      ],
    },
    {
      tier: 5,
      plainLabel: "Fits by size",
      tag: "Universal",
      plainReason: "L: 114.5mm · H: 48.0mm · THK: 15.5mm",
      items: [
        stitchRow({
          partId: "a1111111-1111-4111-8111-111111111501",
          groupId: G5,
          brand: "Seiken",
          number: "500-0112",
          name: "Universal Caliper Slide Pin & Shim Kit",
          tier: 5,
          partKind: "universal",
          fitSource: "universal",
          via: "universal",
          matchReasonCode: "universal_spec",
          matchReasonParams: [{ spec_key: "caliper_pin_pitch", value: "78.0", unit: "mm" }],
        }),
        stitchRow({
          partId: "a1111111-1111-4111-8111-111111111502",
          groupId: G5,
          brand: "Akebono",
          number: "UNV-24551",
          name: "Standard Dimension Replacement Set",
          tier: 5,
          partKind: "universal",
          fitSource: "universal",
          via: "universal",
          matchReasonCode: "universal_spec",
          matchReasonParams: [
            { spec_key: "pad_length_mm", value: "114.5", unit: "mm" },
            { spec_key: "pad_height_mm", value: "48.0", unit: "mm" },
            { spec_key: "pad_thickness_mm", value: "15.5", unit: "mm" },
          ],
        }),
      ],
    },
  ];
}
