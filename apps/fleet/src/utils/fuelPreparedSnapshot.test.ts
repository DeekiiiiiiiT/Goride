import { describe, expect, it, beforeEach } from 'vitest';
import {
  currentFuelSnapshotVersion,
  rememberFuelSnapshotVersion,
} from './fuelPreparedSnapshot';

describe('fuelPreparedSnapshot', () => {
  beforeEach(() => {
    rememberFuelSnapshotVersion('p-sep14', null);
  });

  it('remembers a real compute version for finalize', () => {
    rememberFuelSnapshotVersion('p-sep14', 1);
    expect(currentFuelSnapshotVersion('p-sep14')).toBe(1);
  });

  it('clears version when prepare returns null (shadow / not ready)', () => {
    rememberFuelSnapshotVersion('p-sep14', 1);
    rememberFuelSnapshotVersion('p-sep14', null);
    expect(currentFuelSnapshotVersion('p-sep14')).toBeNull();
  });

  it('ignores zero so fake version 1 from a bad client path is not stored as 0', () => {
    rememberFuelSnapshotVersion('p-sep14', 0);
    expect(currentFuelSnapshotVersion('p-sep14')).toBeNull();
  });
});
