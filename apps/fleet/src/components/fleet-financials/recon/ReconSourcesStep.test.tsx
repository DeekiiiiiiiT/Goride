/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ReconSourceCard,
  attestNoneButtonLabel,
  uncoveredDaysForSource,
} from './ReconSourcesStep';

describe('uncoveredDaysForSource', () => {
  it('returns only days that are not covered or zero_attested', () => {
    expect(
      uncoveredDaysForSource('2026-10-05', {
        '2026-10-05': 'covered',
        '2026-10-06': 'zero_attested',
        '2026-10-07': 'missing',
      }),
    ).toEqual(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  });
});

describe('attestNoneButtonLabel', () => {
  it('names a few empty days and counts when many', () => {
    expect(attestNoneButtonLabel(['2026-10-07'])).toMatch(/No activity on Wed/i);
    expect(
      attestNoneButtonLabel(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']),
    ).toBe('No activity on 4 empty days');
  });
});

describe('ReconSourceCard', () => {
  it('renders a missing required source with action affordances', () => {
    render(
      <ReconSourceCard
        weekKey="2026-10-05"
        source={{
          id: 'toll_usage',
          label: 'Tag account usage statement',
          requirement: 'required',
          status: 'missing',
          coverage: {},
        }}
        onUpload={() => {}}
        onAttestNone={() => {}}
      />,
    );
    expect(screen.getByTestId('recon-source-toll_usage')).toBeTruthy();
    expect(screen.getByText(/Tag account usage statement/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upload statement/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /No activity on empty days/i })).toBeTruthy();
  });

  it('attests only uncovered days and labels them on the button', async () => {
    const onAttestNone = vi.fn();
    const user = userEvent.setup();
    render(
      <ReconSourceCard
        weekKey="2026-10-05"
        source={{
          id: 'toll_usage',
          label: 'Tag account usage statement',
          requirement: 'required',
          status: 'partial',
          coverage: {
            '2026-10-05': 'covered',
            '2026-10-06': 'covered',
            '2026-10-07': 'covered',
            '2026-10-08': 'covered',
            '2026-10-09': 'missing',
            '2026-10-10': 'missing',
            '2026-10-11': 'missing',
          },
        }}
        onUpload={() => {}}
        onAttestNone={onAttestNone}
      />,
    );
    const btn = screen.getByRole('button', { name: /No activity on Fri, Sat, Sun/i });
    fireEvent.pointerMove(btn, { pointerType: 'mouse' });
    await user.click(btn);
    expect(onAttestNone).toHaveBeenCalledWith('toll_usage', [
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('shows Upload on uber_bundle and indrive_trips cards', () => {
    const { rerender } = render(
      <ReconSourceCard
        weekKey="2026-10-05"
        source={{
          id: 'uber_bundle',
          label: 'Uber week bundle',
          requirement: 'required',
          status: 'missing',
          coverage: {},
        }}
        onUpload={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeTruthy();

    rerender(
      <ReconSourceCard
        weekKey="2026-10-05"
        source={{
          id: 'indrive_trips',
          label: 'InDrive trips',
          requirement: 'required',
          status: 'missing',
          coverage: {},
        }}
        onUpload={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeTruthy();
  });

  it('shows Remind Roam for waiting external fuel without fleet upload', () => {
    render(
      <ReconSourceCard
        weekKey="2026-10-05"
        source={{
          id: 'fuel_card_roam',
          label: 'Roam-issued fuel card statement',
          kind: 'external_dependency',
          requirement: 'required',
          status: 'waiting_external',
          coverage: {},
        }}
        onRemindRoam={() => {}}
        onUpload={() => {}}
        canUploadExternalSources={false}
      />,
    );
    expect(screen.getByRole('button', { name: /Remind Roam/i })).toBeTruthy();
    expect(screen.getByText(/Waiting on Roam/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Upload/i })).toBeNull();
  });

  it('shows Upload on Roam fuel only when recon.external_sources', () => {
    render(
      <ReconSourceCard
        weekKey="2026-10-05"
        source={{
          id: 'fuel_card_roam',
          label: 'Roam-issued fuel card statement',
          kind: 'external_dependency',
          requirement: 'required',
          status: 'waiting_external',
          coverage: {},
        }}
        onRemindRoam={() => {}}
        onUpload={() => {}}
        canUploadExternalSources
      />,
    );
    expect(screen.getByRole('button', { name: /Remind Roam/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upload statement/i })).toBeTruthy();
  });
});
