/**
 * Fleet find-parts mocks for AM-S4F (Frame 1 tiers + why-it-fits fields).
 * Shaped like fleet-core /parts/find sections (match_reason_*, fit_source, via).
 */
import { formatFleetWhyLine } from "../packages/types/src/partMatchReason";
import { STITCH_VISUAL_COMPONENT_ID, STITCH_VISUAL_LABEL, STITCH_VISUAL_PLATE } from "./findPartsStitchVisualFixtures";

function item(row: {
  partId: string;
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
  position?: string;
  linkComponentName?: string | null;
}): Record<string, unknown> {
  const matchStatus = row.matchStatus ?? "live";
  return {
    tier: row.tier,
    position: row.position ?? "front",
    side: "both",
    fit_source: row.fitSource,
    via: row.via,
    match_reason_code: row.matchReasonCode,
    match_reason_params: row.matchReasonParams ?? null,
    match_status: matchStatus,
    link_component_name: row.linkComponentName ?? null,
    part: {
      id: row.partId,
      name: row.name,
      brand: row.brand,
      manufacturer: row.brand,
      oem_part_number: row.number,
      part_kind: row.partKind,
      maintenance_component_id: STITCH_VISUAL_COMPONENT_ID,
    },
    sister_names: row.matchReasonCode === "via_sister" ? "Daihatsu Thor" : null,
    reason: formatFleetWhyLine(row.matchReasonCode, row.matchReasonParams, row.fitSource, {
      carShortName: "Roomy",
      linkComponentName: row.linkComponentName ?? null,
      sisterModelName: row.matchReasonCode === "via_sister" ? "Daihatsu Thor" : null,
      positionLabel: row.position === "front" ? "Front" : row.position ?? null,
      indexEquivalentLabel: row.matchReasonCode === "index_badge" ? "MK Kashiyama D0051M-01-J" : null,
    }),
  };
}

/** Five tier sections shown in Stitch AM-S4F Frame 1 (Roomy front brake pads). */
export function stitchAutoMatchFindSections() {
  return [
    {
      tier: 1,
      label: "Made for your car",
      items: [
        item({
          partId: "part-am-s4f-oem-1191",
          brand: "Toyota",
          number: "04465-B1191",
          name: "Front brake pad set",
          tier: 1,
          partKind: "oem",
          fitSource: "derived",
          via: "direct",
          matchReasonCode: "oe_number_superseded",
          matchReasonParams: { oe_number: "04465-B1190", from: "04465-B1190", to: "04465-B1191", oe_brand: "Toyota" },
        }),
      ],
    },
    {
      tier: 2,
      label: "Same car, different badge",
      items: [
        item({
          partId: "part-am-s4f-sister-1191",
          brand: "Daihatsu",
          number: "04465-B1191",
          name: "Front brake pad set",
          tier: 2,
          partKind: "oem",
          fitSource: "derived",
          via: "sister",
          matchReasonCode: "via_sister",
          matchReasonParams: { platform_code: "DAI-M900", source_vehicle_id: "daihatsu-thor-variant" },
        }),
      ],
    },
    {
      tier: 3,
      label: "Fits your engine or shares parts",
      items: [
        item({
          partId: "part-am-s4f-shared-mazda",
          brand: "Mazda",
          number: "DFY1-33-28ZA",
          name: "Front brake pad set",
          tier: 3,
          partKind: "oem",
          fitSource: "derived",
          via: "platform_link",
          matchReasonCode: "via_platform_link",
          matchReasonParams: {
            link_id: "link-am-s4f-brake-pad",
            platform_code: "MAZ-DE",
            source_vehicle_id: "mazda-de-variant",
            source_tier: 1,
          },
          matchStatus: "needs_checking",
          linkComponentName: "brake pad",
        }),
      ],
    },
    {
      tier: 4,
      label: "Other brands that replace it",
      items: [
        item({
          partId: "part-am-s4f-mk",
          brand: "MK Kashiyama",
          number: "D0051M-01-J",
          name: "Front brake pad set",
          tier: 4,
          partKind: "aftermarket",
          fitSource: "derived",
          via: "direct",
          matchReasonCode: "oe_number",
          matchReasonParams: { oe_number: "04465-B1191", oe_brand: "Toyota" },
        }),
        item({
          partId: "part-am-s4f-brembo",
          brand: "Brembo",
          number: "P 16 013",
          name: "Front brake pad set",
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
      label: "Fits by size",
      items: [
        item({
          partId: "part-am-s4f-advics",
          brand: "Advics",
          number: "SN145P",
          name: "Front brake pad set",
          tier: 5,
          partKind: "universal",
          fitSource: "universal",
          via: "universal",
          matchReasonCode: "universal_spec",
          matchReasonParams: [
            { spec_key: "pad_length_mm", value: "116.0", unit: "mm" },
            { spec_key: "pad_height_mm", value: "44.5", unit: "mm" },
            { spec_key: "pad_thickness_mm", value: "15.0", unit: "mm" },
          ],
        }),
      ],
    },
  ];
}

/** Frame 3: tier 3 with every row needs_checking (Stitch all-checking section). */
export function stitchAutoMatchFindSectionsAllChecking() {
  const sharedRow = (partId: string, brand: string, number: string) => item({
    partId,
    brand,
    number,
    name: "Front brake pad set",
    tier: 3,
    partKind: "oem",
    fitSource: "derived",
    via: "platform_link",
    matchReasonCode: "via_platform_link",
    matchReasonParams: {
      link_id: `link-am-s4f-${partId}`,
      platform_code: "MAZ-DE",
      source_vehicle_id: "mazda-de-variant",
      source_tier: 1,
    },
    matchStatus: "needs_checking",
    linkComponentName: "brake pad",
  });
  return [
    {
      tier: 3,
      label: "Fits your engine or shares parts",
      items: [
        sharedRow("part-am-s4f-shared-mazda", "Mazda", "DFY1-33-28ZA"),
        sharedRow("part-am-s4f-shared-ford", "Ford", "1779602"),
        sharedRow("part-am-s4f-shared-honda", "Honda", "45022-TF0-G01"),
      ],
    },
  ];
}

export function stitchAutoMatchFindResultAllChecking() {
  return {
    ...stitchAutoMatchFindResult(),
    sections: stitchAutoMatchFindSectionsAllChecking(),
  };
}

export function stitchAutoMatchFindResult() {
  return {
    sections: stitchAutoMatchFindSections(),
    car: { label: STITCH_VISUAL_LABEL, plate: STITCH_VISUAL_PLATE, year: 2019 },
    chassis: "M900A",
    trimBadge: "Pre-Facelift",
    linked: true,
    requestCount: 2,
    standard_ref: "JIS D4411-2015",
  };
}
