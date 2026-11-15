// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekResultCards, formatExactJmd, formatWholeJmd } from './ReconWeekResult';

const week28Sep = {
  revenueMinor: 9202120,
  expensesMinor: 2800000,
  fuelMinor: 2800000,
  tollsMinor: 0,
  profitMinor: 6402120,
  fleetProfitMinor: 3465447,
  driverProfitMinor: 2936673,
  marginPercent: 70,
  fleetSharePercent: 54,
  driverSharePercent: 46,
  driverCount: 1,
};

describe('Week result (Stitch screens 1–3)', () => {
  it('money formats: whole J$ on the card, exact on hover, minus for a loss', () => {
    expect(formatWholeJmd(9202120)).toBe('J$92,021');
    expect(formatExactJmd(9202120)).toBe('J$92,021.20');
    expect(formatWholeJmd(-550000)).toBe('−J$5,500');
  });

  it('screen 1: a week that made money shows the five numbers, margin, shares and the split bar', () => {
    render(<WeekResultCards result={week28Sep} />);
    expect(screen.getByTestId('week-result-revenue').textContent).toContain('J$92,021');
    expect(screen.getByTestId('week-result-expenses').textContent).toContain('J$28,000');
    expect(screen.getByTestId('week-result-expenses').textContent).toContain('Fuel + tolls');
    expect(screen.getByTestId('week-result-profit').textContent).toContain('J$64,021');
    expect(screen.getByText('70% margin')).toBeTruthy();
    expect(screen.getByTestId('week-result-fleet-profit').textContent).toBe('J$34,654');
    expect(screen.getByTestId('week-result-driver-profit').textContent).toBe('J$29,367');
    expect(screen.getByText('54%')).toBeTruthy();
    expect(screen.getByText('46%')).toBeTruthy();
    expect(screen.getByText('After paying drivers')).toBeTruthy();
    expect(screen.getByText("Driver's cut after expenses")).toBeTruthy();
    expect(screen.getByTestId('week-result-split-bar')).toBeTruthy();
    expect(screen.getByTestId('week-result-profit').querySelector('[title]')?.getAttribute('title')).toBe('J$64,021.20');
    // No driver names, no evidence list, no history.
    expect(screen.queryByText(/Kenny/)).toBeNull();
    expect(screen.queryByText('Evidence')).toBeNull();
  });

  it('screen 2: a loss week shows red numbers, a Loss chip, no percents and the loss note', () => {
    render(
      <WeekResultCards
        result={{
          ...week28Sep,
          revenueMinor: 4000000,
          expensesMinor: 4550000,
          profitMinor: -550000,
          fleetProfitMinor: -1790000,
          driverProfitMinor: 1240000,
          marginPercent: -14,
          fleetSharePercent: null,
          driverSharePercent: null,
        }}
      />,
    );
    expect(screen.getByTestId('week-result-profit').textContent).toContain('−J$5,500');
    expect(screen.getByText('Loss')).toBeTruthy();
    expect(screen.queryByText(/margin/)).toBeNull();
    expect(screen.queryByTestId('week-result-split-bar')).toBeNull();
    expect(screen.getByTestId('week-result-loss-note').textContent).toContain('the fleet carried the loss');
    expect(screen.getByTestId('week-result-fleet-profit').textContent).toBe('−J$17,900');
  });

  it('screen 3: still adding up shows the labels, placeholders and the 2-minute line', () => {
    render(<WeekResultCards result={null} />);
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('Fleet profit')).toBeTruthy();
    expect(screen.getByTestId('week-result-adding-up').textContent).toContain('about 2 minutes');
    expect(screen.queryByTestId('week-result-fleet-profit')).toBeNull();
  });
});
