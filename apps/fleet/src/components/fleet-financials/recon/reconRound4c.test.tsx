/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReconApprovalDialog, approvalSubmitError } from './ReconApprovalDialog';
import { closeStepState } from './ReconCloseStep';
import { activityCardRows, tripsStepBlockers } from './ReconTripsEarningsStep';
import { filterHistory } from './ReconWeekHistory';

const blocker = (code: string, severity = 'block') => ({
  code, severity, driver_id: null, source_id: null, message: code, persisted: null, expected: null, delta: null,
});

describe('approval dialog rules (WRA-32)', () => {
  it('self-approval needs a real reason; send needs a note', () => {
    expect(approvalSubmitError('self', 'ok')).toMatch(/at least 8/);
    expect(approvalSubmitError('self', 'Checked every driver')).toBeNull();
    expect(approvalSubmitError('send', '  ')).toMatch(/note/);
    expect(approvalSubmitError('send', 'please')).toBeNull();
  });

  const base = {
    open: true, onOpenChange: () => {}, title: 'Close?', summary: 's', detail: 'd',
    confirmLabel: 'Approve & lock week', busy: false,
  };

  it('hides Send for approval when nobody else can approve', () => {
    render(<ReconApprovalDialog {...base} canApprove otherApprovers={0} onSend={vi.fn()} onSelfApprove={vi.fn()} />);
    expect(screen.queryByTestId('recon-approval-send')).toBeNull();
    expect(screen.getByTestId('recon-approval-self')).toBeTruthy();
  });

  it('non-approvers only see Send; self-approve is blocked without a reason', () => {
    const onSelf = vi.fn();
    const { unmount } = render(<ReconApprovalDialog {...base} canApprove={false} otherApprovers={2} onSend={vi.fn()} onSelfApprove={onSelf} />);
    expect(screen.queryByTestId('recon-approval-self')).toBeNull();
    unmount();
    render(<ReconApprovalDialog {...base} canApprove otherApprovers={0} onSend={vi.fn()} onSelfApprove={onSelf} />);
    fireEvent.click(screen.getByTestId('recon-approval-submit'));
    expect(onSelf).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('recon-approval-reason'), { target: { value: 'All drivers checked and tie' } });
    fireEvent.click(screen.getByTestId('recon-approval-submit'));
    expect(onSelf).toHaveBeenCalledWith('All drivers checked and tie');
  });
});

describe('Close reads the saved check only (WRA-07)', () => {
  const s = (over: Partial<Parameters<typeof closeStepState>[0]>) =>
    closeStepState({ closeCheck: { status: 'ok', blockers: [] }, runState: 'open', weekEnded: true, calculatorPaused: false, ...over });
  it('no saved check = waiting, Close off', () => {
    const r = s({ closeCheck: { status: 'none' } });
    expect(r.waiting).toBe(true);
    expect(r.canClose).toBe(false);
  });
  it('blocks, warnings, paused calculator and week not ended', () => {
    expect(s({ closeCheck: { status: 'ok', blockers: [blocker('TOLL_OPEN')] } }).canClose).toBe(false);
    expect(s({ closeCheck: { status: 'ok', blockers: [blocker('SOME_NOTE', 'warn')] } }).canClose).toBe(true);
    expect(s({ calculatorPaused: true }).why).toMatch(/paused/);
    expect(s({ weekEnded: false }).why).toMatch(/after the week ends/);
    expect(s({ closeCheck: { status: 'error' } }).canClose).toBe(false);
    expect(s({}).canClose).toBe(true);
    expect(s({ runState: 'closed' }).closed).toBe(true);
  });
});

describe('Trips & earnings reads the saved check only', () => {
  it('waiting, and seal needed only for earnings codes', () => {
    expect(tripsStepBlockers({ status: 'none' }).waiting).toBe(true);
    const r = tripsStepBlockers({ status: 'ok', blockers: [blocker('EARNINGS_STATEMENT_MISSING'), blocker('TOLL_OPEN')] });
    expect(r.needsSeal).toBe(true);
    expect(r.items.map((i) => i.code)).toEqual(['EARNINGS_STATEMENT_MISSING']);
  });
});

describe('History filter', () => {
  it('Show self-approved keeps only self-approved rows', () => {
    const rows = [
      { id: '1', at: '', step: null, label: 'a', reason: null, by: 'x', approval: null, selfApproved: false, status: 'applied', system: false },
      { id: '2', at: '', step: null, label: 'b', reason: 'r', by: 'x', approval: 'Self-approved', selfApproved: true, status: 'applied', system: false },
    ];
    expect(filterHistory(rows, true).map((r) => r.id)).toEqual(['2']);
    expect(filterHistory(rows, false)).toHaveLength(2);
  });
});

describe('Activity vs trips (WRA-21)', () => {
  it('shows the Uber hours per driver, with Roam names when known', () => {
    const rows = activityCardRows(
      {
        status: 'ok',
        uploadedAt: null,
        drivers: [
          { driverId: 'a', name: 'KENNY GREGORY RATTRAYCAS', tripsCompleted: 70, onlineHours: 56.7, onTripHours: 32.98, onTripPct: 58 },
          { driverId: 'b', name: 'UNKNOWN UBER', tripsCompleted: 0, onlineHours: 0, onTripHours: 0, onTripPct: null },
        ],
      },
      new Map([['a', 'Kenny Gregory Rattray']]),
    );
    expect(rows).toEqual([
      { driverId: 'a', name: 'Kenny Gregory Rattray', online: '56.7 h', onTrip: '33.0 h', share: '58%', trips: 70 },
      { driverId: 'b', name: 'UNKNOWN UBER', online: '0.0 h', onTrip: '0.0 h', share: '—', trips: 0 },
    ]);
  });

  it('nothing to list when the week has no upload or no recorded hours', () => {
    expect(activityCardRows({ status: 'no_upload' }, new Map())).toEqual([]);
    expect(activityCardRows({ status: 'not_recorded', uploadedAt: null }, new Map())).toEqual([]);
  });
});
