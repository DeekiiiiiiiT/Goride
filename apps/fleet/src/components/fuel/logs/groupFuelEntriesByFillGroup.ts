import type { FuelEntry } from '../../../types/fuel';

export type FuelLogDisplayRow =
  | { kind: 'single'; id: string; entry: FuelEntry }
  | {
      kind: 'split';
      id: string;
      fillGroupId: string;
      entries: FuelEntry[];
      pumpTotal: number;
      /** Representative entry for date/vehicle/driver columns. */
      primary: FuelEntry;
    };

function fillGroupIdOf(e: FuelEntry): string {
  const id = e.metadata?.fillGroupId;
  return typeof id === 'string' && id.length > 0 ? id : '';
}

/**
 * Collapse Gas Card + Cash siblings into one display row before pagination
 * so a split fill never straddles pages.
 */
export function groupFuelEntriesByFillGroup(entries: FuelEntry[]): FuelLogDisplayRow[] {
  const byGroup = new Map<string, FuelEntry[]>();
  const order: string[] = [];
  const singles: FuelEntry[] = [];

  for (const e of entries) {
    const gid = fillGroupIdOf(e);
    if (!gid) {
      singles.push(e);
      continue;
    }
    if (!byGroup.has(gid)) {
      byGroup.set(gid, []);
      order.push(`g:${gid}`);
    }
    byGroup.get(gid)!.push(e);
  }

  // Preserve original relative order: walk entries once
  const out: FuelLogDisplayRow[] = [];
  const emitted = new Set<string>();
  let singleIdx = 0;

  for (const e of entries) {
    const gid = fillGroupIdOf(e);
    if (!gid) {
      const s = singles[singleIdx++];
      if (s) out.push({ kind: 'single', id: s.id, entry: s });
      continue;
    }
    if (emitted.has(gid)) continue;
    emitted.add(gid);
    const group = byGroup.get(gid) || [e];
    if (group.length < 2) {
      out.push({ kind: 'single', id: group[0].id, entry: group[0] });
      continue;
    }
    const pumpTotal =
      Number(group[0].metadata?.splitPumpTotal) ||
      group.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const cash = group.find((r) => r.metadata?.splitRole === 'cash');
    const primary = cash || group[0];
    out.push({
      kind: 'split',
      id: gid,
      fillGroupId: gid,
      entries: group,
      pumpTotal,
      primary,
    });
  }

  return out;
}

/** Flatten display rows back to entries (export / selection). */
export function flattenFuelLogDisplayRows(rows: FuelLogDisplayRow[]): FuelEntry[] {
  const out: FuelEntry[] = [];
  for (const r of rows) {
    if (r.kind === 'single') out.push(r.entry);
    else out.push(...r.entries);
  }
  return out;
}
