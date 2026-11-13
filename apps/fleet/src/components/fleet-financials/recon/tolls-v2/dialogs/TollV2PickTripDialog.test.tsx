/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { TollV2PickTripDialog } from './TollV2PickTripDialog';
import type { TollV2Charge } from '../types';

const charge: TollV2Charge = {
  id: 'pick-1',
  version: 1,
  section: 'pick',
  state: 'pending',
  occurredAt: '2026-08-28T12:22:00-05:00',
  amountMinor: 37000,
  openMinor: 37000,
  plazaName: 'Portmore West',
  confidence: 'two_trips',
  suggestions: [
    {
      suggestionId: 's1',
      paybackId: 'p1',
      paybackVersion: 1,
      paidBackMinor: 37000,
      trip: {
        requestAt: '2026-08-28T11:50:00-05:00',
        dropoffAt: '2026-08-28T12:28:00-05:00',
        paymentMethod: 'cash',
      },
    },
    {
      suggestionId: 's2',
      paybackId: 'p2',
      paybackVersion: 1,
      paidBackMinor: 37000,
      trip: {
        requestAt: '2026-08-28T12:23:00-05:00',
        dropoffAt: '2026-08-28T13:30:00-05:00',
        paymentMethod: 'card',
      },
    },
  ],
  decision: null,
};

describe('TollV2PickTripDialog', () => {
  it('has none radio, red-outline cancel, and stacked timeline rows', () => {
    render(
      <TollV2PickTripDialog
        open
        onOpenChange={() => {}}
        charge={charge}
        pickQueue={{ current: 1, total: 1 }}
        onConfirm={() => {}}
        busy={false}
      />,
    );
    expect(screen.getByText('Which trip was this toll on?')).toBeTruthy();
    expect(screen.getByTestId('toll-v2-pick-none')).toBeTruthy();
    expect(screen.getByTestId('toll-v2-pick-cancel').className).toMatch(/ba1a1a/);
    expect(screen.getAllByTestId('toll-v2-timeline-row').length).toBe(2);
  });

  it('closes without confirming when none is selected', () => {
    const onOpenChange = vi.fn();
    render(
      <TollV2PickTripDialog
        open
        onOpenChange={onOpenChange}
        charge={charge}
        pickQueue={{ current: 1, total: 1 }}
        onConfirm={vi.fn()}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByTestId('toll-v2-pick-none'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
