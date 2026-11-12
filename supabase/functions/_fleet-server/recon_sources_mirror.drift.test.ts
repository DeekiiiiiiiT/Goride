/**
 * Fail when edge recon manifest drifts from finance-core.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import {
  orgMainLine as coreOrgMainLine,
  resolveSourceLine as coreResolveSourceLine,
  sourcesForLine as coreSourcesForLine,
  RECON_SOURCES as CORE_SOURCES,
  type OrgReconProfile as CoreProfile,
} from "../../../packages/finance-core/src/reconSources.ts";
import {
  orgMainLine as edgeOrgMainLine,
  resolveSourceLine as edgeResolveSourceLine,
  sourcesForLine as edgeSourcesForLine,
  RECON_SOURCES as EDGE_SOURCES,
  type OrgReconProfile as EdgeProfile,
} from "./recon_sources_mirror.ts";

function extractManifestIds(source: string): string[] {
  const match = source.match(/export const RECON_SOURCES[\s\S]*?\] as const;/);
  if (!match) throw new Error("RECON_SOURCES block not found");
  return [...match[0].matchAll(/\bid:\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]).sort();
}

function manifestRows(text: string) {
  const block = text.match(/export const RECON_SOURCES[\s\S]*?\] as const;/);
  if (!block) throw new Error("RECON_SOURCES block not found");
  const rows: Array<{ id: string; line: string; kind: string; coverage: string; feeds: string[] }> = [];
  for (const chunk of block[0].split(/\},\s*\{/)) {
    const id = chunk.match(/\bid:\s*['"]([a-z_]+)['"]/)?.[1];
    if (!id) continue;
    rows.push({
      id,
      line: chunk.match(/\bline:\s*['"]([a-z_]+)['"]/)?.[1] ?? "",
      kind: chunk.match(/\bkind:\s*['"]([a-z_]+)['"]/)?.[1] ?? "",
      coverage: chunk.match(/\bcoverage:\s*['"]([a-z_]+)['"]/)?.[1] ?? "",
      feeds: [...chunk.matchAll(/feeds:\s*\[([^\]]*)\]/g)].flatMap((m) =>
        [...m[1].matchAll(/['"]([a-z_]+)['"]/g)].map((f) => f[1])
      ),
    });
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

const SAMPLE_PROFILES: Record<string, CoreProfile> = {
  a_both_main_rideshare: {
    serviceLines: ["rideshare", "rush_delivery"],
    hasUberDrivers: true,
    hasIndriveDrivers: false,
    hasTollTags: true,
    hasRoamFuelCards: true,
    hasSelfServeJaa: false,
    rushDeliveryEnabled: true,
  },
  b_rideshare_only: {
    serviceLines: ["rideshare"],
    hasUberDrivers: true,
    hasIndriveDrivers: false,
    hasTollTags: true,
    hasRoamFuelCards: false,
    hasSelfServeJaa: false,
    rushDeliveryEnabled: false,
  },
  c_delivery_only: {
    serviceLines: ["rush_delivery"],
    hasUberDrivers: false,
    hasIndriveDrivers: false,
    hasTollTags: false,
    hasRoamFuelCards: false,
    hasSelfServeJaa: false,
    rushDeliveryEnabled: true,
  },
  d_delivery_main_on_old_run: {
    serviceLines: ["rideshare", "rush_delivery"],
    hasUberDrivers: true,
    hasIndriveDrivers: false,
    hasTollTags: true,
    hasRoamFuelCards: true,
    hasSelfServeJaa: false,
    rushDeliveryEnabled: true,
  },
  e_neither_active: {
    serviceLines: ["rush_delivery"],
    hasUberDrivers: false,
    hasIndriveDrivers: false,
    hasTollTags: false,
    hasRoamFuelCards: false,
    hasSelfServeJaa: false,
    rushDeliveryEnabled: false,
  },
};

Deno.test("RECON_SOURCE_IDS match packages/finance-core/src/reconSources.ts", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const corePath = join(here, "../../../packages/finance-core/src/reconSources.ts");
  const mirrorPath = join(here, "recon_sources_mirror.ts");
  const coreText = await Deno.readTextFile(corePath);
  const mirrorText = await Deno.readTextFile(mirrorPath);
  const coreIds = extractManifestIds(coreText);
  const mirrorIds = extractManifestIds(mirrorText);
  assertEquals(mirrorIds, coreIds);
});

Deno.test("manifest fields and helper outputs stay mirrored", () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const corePath = join(here, "../../../packages/finance-core/src/reconSources.ts");
  const mirrorPath = join(here, "recon_sources_mirror.ts");
  const coreRows = manifestRows(Deno.readTextFileSync(corePath));
  const edgeRows = manifestRows(Deno.readTextFileSync(mirrorPath));
  assertEquals(edgeRows, coreRows);

  for (const [name, profile] of Object.entries(SAMPLE_PROFILES)) {
    const edgeProfile = profile as unknown as EdgeProfile;
    assertEquals(edgeOrgMainLine(edgeProfile), coreOrgMainLine(profile), name);

    const main = coreOrgMainLine(profile) ?? "rideshare";
    const altMain = name === "d_delivery_main_on_old_run" ? "rush_delivery" : main;

    for (const def of CORE_SOURCES) {
      assertEquals(
        edgeResolveSourceLine(EDGE_SOURCES.find((s) => s.id === def.id)!, altMain),
        coreResolveSourceLine(def, altMain),
        `${name}:${def.id}`,
      );
    }

    for (const line of ["rideshare", "rush_delivery"] as const) {
      assertEquals(
        edgeSourcesForLine(line, altMain).map((s) => s.id).sort(),
        coreSourcesForLine(line, altMain).map((s) => s.id).sort(),
        `${name}:${line}`,
      );
    }
  }
});
