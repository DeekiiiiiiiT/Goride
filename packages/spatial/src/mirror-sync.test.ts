/**
 * Guardrail: Deno geoIndex mirror must export the same constants/signatures as @roam/spatial.
 * Full source sync is manual; this test catches API drift on the shared surface.
 */
import { describe, expect, it } from 'vitest';
import * as spatial from './index';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const DENO_MIRROR = join(ROOT, 'supabase/functions/_shared/h3/geoIndex.ts');

const REQUIRED_EXPORTS = [
  'DEFAULT_H3_RESOLUTION',
  'COMPILE_H3_RESOLUTIONS',
  'H3_EDGE_KM',
  'latLngToH3',
  'h3ToLatLng',
  'h3Disk',
  'h3DiskFromCell',
  'kRingForRadiusKm',
  'kRingForRadiusKmWithMargin',
  'getWaveKRings',
  'getCellsForWave',
  'polygonToH3Cells',
  'cellBoundary',
  'isMatchingH3SupplyEnabled',
  'isH3SupplyEnabled',
  'isMatchingH3SurgeEnabled',
  'isRushH3DispatchEnabled',
  'isRushHexCoverageEnabled',
] as const;

describe('@roam/spatial ↔ Deno geoIndex sync', () => {
  it('exports the shared surface from the package', () => {
    for (const name of REQUIRED_EXPORTS) {
      expect(spatial, name).toHaveProperty(name);
    }
  });

  it('Deno mirror declares the same export names', () => {
    const src = readFileSync(DENO_MIRROR, 'utf8');
    for (const name of REQUIRED_EXPORTS) {
      expect(src, `missing export ${name} in Deno mirror`).toMatch(
        new RegExp(`export (const|function|type) ${name}\\b|export \\{[^}]*\\b${name}\\b`),
      );
    }
  });

  it('DEFAULT_H3_RESOLUTION matches', () => {
    expect(spatial.DEFAULT_H3_RESOLUTION).toBe(7);
    const src = readFileSync(DENO_MIRROR, 'utf8');
    expect(src).toMatch(/export const DEFAULT_H3_RESOLUTION = 7/);
  });
});
