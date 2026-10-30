// Stitch: dominion-redesign/s36g-imports-checks
import { geoFetch } from '../geoClient';

export type ImportRow = {
  pcode: string;
  name?: string;
  matched?: boolean;
  level?: number | null;
  valid?: boolean;
  area_change_pct?: number | null;
  outside_parent_pct?: number | null;
  overlap_pct?: number | null;
};

export type ImportRun = {
  id: string;
  file_name: string | null;
  counts: { matched?: number; unknown?: number; broken?: number; drafts_saved?: number };
  errors?: string[];
  report?: ImportRow[];
  dry_run?: boolean;
  file_hash?: string | null;
  created_at: string;
};

export type QualityIssue = {
  pcode: string;
  name: string;
  admin_level: number;
  issue: string;
  severity?: string;
};

export const ISSUE_LABEL: Record<string, string> = {
  invalid_shape: 'Shape is broken',
  missing_parent: 'Parent missing',
  too_many_vertices: 'Too many points',
  outside_parent: 'Sticks out of its parent',
  sibling_overlap: 'Overlaps a neighbour',
  same_name: 'Same name as another area',
};

export function importChip(broken: number, unknown: number): { label: string; tone: 'red' | 'amber' | 'green' } {
  if (broken > 0) return { label: `${broken} broken`, tone: 'red' };
  if (unknown > 0) return { label: `${unknown} unknown`, tone: 'amber' };
  return { label: 'All matched', tone: 'green' };
}

export function canSaveDrafts(checkedHash: string | null, fileHashValue: string | null, broken: number): boolean {
  return Boolean(checkedHash && fileHashValue && checkedHash === fileHashValue && broken === 0);
}

export async function fileHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function publishInOrder<T extends { pcode: string; level: number }>(
  areas: T[],
  publish: (area: T) => Promise<void>,
): Promise<{ live: string[]; stopped: string | null; error: string | null }> {
  const ordered = [...areas].sort((a, b) => a.level - b.level);
  const live: string[] = [];
  for (const area of ordered) {
    try {
      await publish(area);
      live.push(area.pcode);
    } catch (reason) {
      return { live, stopped: area.pcode, error: reason instanceof Error ? reason.message : 'Publish stopped' };
    }
  }
  return { live, stopped: null, error: null };
}

export function fetchRuns(token: string): Promise<ImportRun[]> {
  return geoFetch(token, '/geo/imports').then((body) => (body.runs as ImportRun[]) ?? []);
}

export function fetchRun(token: string, id: string): Promise<ImportRun> {
  return geoFetch(token, `/geo/imports/${id}`).then((body) => body.run as ImportRun);
}

export function checkFile(token: string, fileName: string, hash: string, features: unknown[]) {
  return geoFetch(token, '/geo/import', {
    method: 'POST',
    body: JSON.stringify({ file_name: fileName, file_hash: hash, features, dry_run: true }),
  });
}

export function saveDrafts(token: string, runId: string) {
  return geoFetch(token, `/geo/imports/${runId}/drafts`, { method: 'POST', body: '{}' });
}

export function fetchQuality(token: string): Promise<QualityIssue[]> {
  return geoFetch(token, '/geo/quality').then((body) => (body.issues as QualityIssue[]) ?? []);
}

export function pageForIssue(level: number): string {
  if (level === 1) return 'world-parishes';
  if (level === 2) return 'world-towns';
  return 'world-communities';
}
