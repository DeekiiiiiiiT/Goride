/**
 * @vitest-environment node
 * U-10 — step notes from evidence audit must round-trip for wizard rehydrate.
 */
import { describe, expect, it } from 'vitest';
import { stepNotesFromEvidenceAudit } from '../components/fuel/reconciliation/useFuelWizardActions';

describe('stepNotesFromEvidenceAudit (U-10)', () => {
  it('extracts step notes with payload.step', () => {
    const notes = stepNotesFromEvidenceAudit([
      {
        action: 'step',
        at: '2026-09-15T12:00:00Z',
        payload: { step: 'leakage-gap', note: 'checked gaps' },
      },
      { action: 'second_approve', at: '2026-09-15T12:01:00Z', payload: { note: 'ok' } },
      { action: 'step', at: '2026-09-15T12:02:00Z', payload: { step: 'finalize', note: '' } },
    ]);
    expect(notes).toEqual([
      { step: 'leakage-gap', note: 'checked gaps', at: '2026-09-15T12:00:00Z' },
    ]);
  });

  it('fails closed when note is missing (control can fail)', () => {
    expect(stepNotesFromEvidenceAudit([{ action: 'step', payload: { step: 'x' } }])).toEqual([]);
  });
});
