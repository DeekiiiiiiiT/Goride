import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tagStatement } from './tagStatement.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

const ctx = {
  tagToVehicle: { '1234': 'vehicle-a' },
  vehicleToDriver: { 'vehicle-a': 'driver-a' },
  plazaIdByName: { 'Main Toll Plaza': 'plaza-main' },
};

describe('tagStatement', () => {
  const text = readFileSync(join(FIXTURES, 'tag_statement.csv'), 'utf8');

  it('parses twin crossings, top-up, and problems with exact rows', () => {
    const out = tagStatement(text, ctx);
    expect(out.rows).toEqual([
      {
        source_ref: 'tag:1234|Main Toll Plaza|1|2024-03-15T10:30|37000#1',
        occurred_at: '2024-03-15T10:30:00-05:00',
        amount_minor: 37000,
        plaza_id: 'plaza-main',
        vehicle_id: 'vehicle-a',
        driver_id: 'driver-a',
        time_precision: 'minute',
      },
      {
        source_ref: 'tag:1234|Main Toll Plaza|1|2024-03-15T10:30|37000#2',
        occurred_at: '2024-03-15T10:30:00-05:00',
        amount_minor: 37000,
        plaza_id: 'plaza-main',
        vehicle_id: 'vehicle-a',
        driver_id: 'driver-a',
        time_precision: 'minute',
      },
    ]);
    expect(out.topups).toEqual([
      {
        source_ref: 'tagtopup:1234|2024-03-15T11:00|50000#1',
        topped_up_on: '2024-03-15',
        amount_minor: 50000,
        provider: 'transjam',
        account_ref: '1234',
        vehicle_id: 'vehicle-a',
      },
    ]);
    expect(out.problems.some((p) => p.reason.includes('Vehicle not found'))).toBe(true);
  });

  it('gives the same crossing ref for 001234 and 1234', () => {
    const a = `Tag ID,Plaza Name,Plaza Lane ID,Date & Time,Amount
001234,Main Toll Plaza,1,15/03/2024 10:30 am,-370`;
    const b = `Tag ID,Plaza Name,Plaza Lane ID,Date & Time,Amount
1234,Main Toll Plaza,1,15/03/2024 10:30 am,-370`;
    expect(tagStatement(a, ctx).rows[0].source_ref).toBe(
      tagStatement(b, ctx).rows[0].source_ref,
    );
  });

  it('keeps stable top-up refs when an extra line is inserted above data', () => {
    const base = `Tag ID,Plaza Name,Plaza Lane ID,Date & Time,Amount
001234,Main Toll Plaza,1,15/03/2024 11:00 am,500.00`;
    const reexport = `Tag ID,Plaza Name,Plaza Lane ID,Date & Time,Amount

001234,Main Toll Plaza,1,15/03/2024 11:00 am,500.00`;
    expect(tagStatement(base, ctx).topups[0].source_ref).toBe(
      tagStatement(reexport, ctx).topups[0].source_ref,
    );
  });

  it('reports unknown plaza', () => {
    const csv = `Tag ID,Plaza Name,Plaza Lane ID,Date & Time,Amount
1234,Unknown Plaza,1,15/03/2024 10:30 am,-370`;
    const out = tagStatement(csv, ctx);
    expect(out.rows).toHaveLength(0);
    expect(out.problems).toEqual([
      { row: 2, reason: 'Plaza not known: Unknown Plaza' },
    ]);
  });

  it('is deterministic', () => {
    expect(tagStatement(text, ctx)).toEqual(tagStatement(text, ctx));
  });
});
