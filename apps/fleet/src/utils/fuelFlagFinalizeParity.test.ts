/**
 * Client/server flag-finalize parity — same fixtures as Deno F-1 gate tests.
 * Client: classifyFuelFillFlags.hasOpenCritical
 * Server: entryBlocksFinalizeForFlags (mirrored here; Deno owns the live import).
 */
import { describe, expect, it } from 'vitest';
import type { FuelEntry } from '../types/fuel';
import { classifyFuelFillFlags } from './fuelFillFlagClassify';
import { dispositionMapFromRows } from './fuelFlagDisposition';

/** Mirror of server entryBlocksFinalizeForFlags after OPEN-2 F-1 scope. */
function serverBlocksFinalizeForFlags(
  e: { id: string; metadata?: Record<string, unknown> },
  disposed: Set<string>,
): boolean {
  const id = String(e.id || '').trim();
  if (!id) return false;
  const meta = e.metadata || {};
  const signalTier = String(meta.signalTier || '').toLowerCase();
  const integrity = String(meta.integrityStatus || '').toLowerCase();
  const codes: string[] = [];
  if (signalTier === 'exception') codes.push('signal_exception');
  if (integrity === 'critical') codes.push('integrity_critical');
  if (codes.length > 0) {
    const legacyAck =
      meta.exceptionResolvedAt ||
      meta.reconExceptionAck === true ||
      meta.reconExceptionAck === 'true' ||
      meta.reconExceptionAck === 1 ||
      meta.reconExceptionAck === '1';
    for (const code of codes) {
      if (disposed.has(`${id}::${code}`)) continue;
      if (code === 'signal_exception' && legacyAck) continue;
      return true;
    }
  }
  // Legacy-only when integrity not stamped
  if (integrity) return false;
  const isCritical =
    signalTier === 'exception' || Boolean(meta.isException);
  if (!isCritical) return false;
  if (meta.exceptionResolvedAt) return false;
  const ack = meta.reconExceptionAck;
  if (ack === true || ack === 'true' || ack === 1 || ack === '1') return false;
  return !disposed.has(`${id}::signal_exception`);
}

function clientBlocks(
  entry: FuelEntry,
  disposedPairs: Array<{ entryId: string; flagCode: string }>,
): boolean {
  const map = dispositionMapFromRows(
    disposedPairs.map((p) => ({
      entryId: p.entryId,
      flagCode: p.flagCode,
      action: 'accepted',
      note: 'accepted',
      periodId: 'org:2026-09-07',
      at: '2026-09-18T16:06:12.364+00:00',
    })),
  );
  return classifyFuelFillFlags(entry, { dispositions: map }).hasOpenCritical;
}

const AUDIT_ENTRY_ID = '91aff97e-8e26-42ac-b383-2922819b58c0';

describe('fuel flag finalize parity (client ↔ server)', () => {
  it('disposed integrity_critical does not block either side', () => {
    const entry = {
      id: AUDIT_ENTRY_ID,
      metadata: {
        integrityStatus: 'critical',
        signalTier: 'observe',
        anomalyReason: 'Odometer Regression',
      },
    } as FuelEntry;
    const disposed = new Set([`${AUDIT_ENTRY_ID}::integrity_critical`]);
    expect(serverBlocksFinalizeForFlags(entry, disposed)).toBe(false);
    expect(
      clientBlocks(entry, [{ entryId: AUDIT_ENTRY_ID, flagCode: 'integrity_critical' }]),
    ).toBe(false);
  });

  it('undisposed integrity_critical blocks both sides', () => {
    const entry = {
      id: 'e-open',
      metadata: { integrityStatus: 'critical', signalTier: 'observe' },
    } as FuelEntry;
    expect(serverBlocksFinalizeForFlags(entry, new Set())).toBe(true);
    expect(clientBlocks(entry, [])).toBe(true);
  });

  it('legacy signal_exception without integrity blocks until disposed', () => {
    const entry = {
      id: 'e-legacy',
      metadata: { signalTier: 'exception' },
    } as FuelEntry;
    expect(serverBlocksFinalizeForFlags(entry, new Set())).toBe(true);
    expect(clientBlocks(entry, [])).toBe(true);
    const disposed = new Set(['e-legacy::signal_exception']);
    expect(serverBlocksFinalizeForFlags(entry, disposed)).toBe(false);
    expect(
      clientBlocks(entry, [{ entryId: 'e-legacy', flagCode: 'signal_exception' }]),
    ).toBe(false);
  });
});
