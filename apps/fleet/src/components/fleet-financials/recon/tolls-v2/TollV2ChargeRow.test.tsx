/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TollV2ChargeRow } from './TollV2ChargeRow';
import type { TollV2Charge } from './types';

const pickCharge: TollV2Charge = {
  id: 'pick-1',
  version: 1,
  section: 'pick',
  state: 'pending',
  occurredAt: '2026-08-28T12:22:00-05:00',
  amountMinor: 37000,
  openMinor: 37000,
  plazaName: 'Portmore West',
  plate: '5179KZ',
  driverName: 'Kenny Gregory Rattray',
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
  ],
  decision: null,
};

describe('TollV2ChargeRow pick branch', () => {
  it('keeps date on one line at 1024px', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    render(<TollV2ChargeRow charge={pickCharge} actions={{}} />);
    const when = screen.getByTestId('toll-v2-pick-when');
    expect(when.className).toMatch(/whitespace-nowrap/);
    expect(when.textContent).toMatch(/28 Aug, 12:22 PM/);
    expect(screen.getByText('Choose trip:')).toBeTruthy();
  });
});
