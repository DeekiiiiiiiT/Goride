import { describe, expect, it } from 'vitest';
import { RECON_STEP_ORDER } from '@roam/finance-core';
import { BLOCKER_LABELS, WIZARD_STEP_BY_BLOCKER, wizardStepForBlockerCode } from './weekCloseBlockers';

describe('wizard step for each close blocker', () => {
  it('maps every label to exactly one wizard step', () => {
    expect(Object.keys(WIZARD_STEP_BY_BLOCKER).sort()).toEqual(Object.keys(BLOCKER_LABELS).sort());
    for (const code of Object.keys(BLOCKER_LABELS)) {
      const step = wizardStepForBlockerCode(code);
      expect(step, code).toBeTruthy();
      expect(RECON_STEP_ORDER).toContain(step);
    }
  });
});
