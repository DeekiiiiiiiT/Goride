import { describe, expect, it } from 'vitest';
import {
  tollReadinessBlockerLabel,
  tollStepFromDrillPath,
} from './tollReadinessBlockers';

describe('tollReadinessBlockers', () => {
  it('labels step blockers with count', () => {
    expect(
      tollReadinessBlockerLabel({
        code: 'STEP_UNLINKED_REFUNDS',
        stepId: 'unlinked-refunds',
        count: 3,
      }),
    ).toBe('Unlinked refunds: 3 open');
  });

  it('parses step from drillPath', () => {
    expect(tollStepFromDrillPath('toll-recon?week=2026-09-07&step=unlinked-refunds')).toBe(
      'unlinked-refunds',
    );
    expect(tollStepFromDrillPath('toll-recon?week=2026-09-07&panel=identity')).toBeUndefined();
  });
});
