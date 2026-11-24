/**
 * @vitest-environment jsdom
 * Part J screens 1, 2, 3, 12 — what is shown, and that Stitch's invented words are not.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { priceFuelWeekV3, type FuelV3Input, type WeeklyFuelReport } from '@roam/fuel-core';
import { FuelWhoPaysSection } from './FuelWhoPays';
import { buildWhoPaysWeek } from '../../../utils/fuelWhoPaysModel';

const rule = {
  id: 'r', category: 'Fuel', coverageType: 'Percentage', coverageValue: 80,
  rideShareCoverage: 80, deadheadCoverage: 50, companyUsageCoverage: 100, personalCoverage: 0, miscCoverage: 50,
} as unknown as FuelV3Input['rule'];
const v3 = priceFuelWeekV3({
  spendWithOdometer: 24_500, spendNoOdometer: 0, odometerKm: 1_503, chainUsable: true,
  km: { trips: 1_320, pickups: 150, companyErrands: 0, personal: 0, commute: 18 },
  rule, commuteCompanyPct: 100, leftover: { mode: 'percentage', driverPct: 50 } as never,
});

function weekFor(meta: Record<string, unknown>) {
  const report = {
    id: 'r1', weekStart: '2026-11-16', weekEnd: '2026-11-22', vehicleId: 'v1', driverId: 'kenny',
    totalGasCardCost: 24_500, totalTripDistance: 1_320, rideShareCost: 23_621.4, companyMiscDistance: 0,
    companyUsageCost: 0, personalDistance: 0, personalUsageCost: 0, deadheadDistance: 150, deadheadCost: 2_684.21,
    miscellaneousCost: 0, companyShare: 18_433.59, driverShare: 6_066.41, status: 'Draft',
    metadata: {
      scenarioName: 'Standard Fleet Rule', fuelPolicyVersion: { effectiveFrom: '2026-08-03' },
      spanStartOdometer: 198_250, spanEndOdometer: 199_753, referenceKmPerLiter: 12, engineVersion: 'fuel-chain-v2.2',
      ...meta,
    },
  } as unknown as WeeklyFuelReport;
  return buildWhoPaysWeek({
    report,
    vehicles: [{ id: 'v1', licensePlate: '5179KZ', make: 'Toyota', model: 'Roomy' }],
    fills: [
      { vehicleId: 'v1', amount: 10_000, gasCard: true },
      { vehicleId: 'v1', amount: 14_500, gasCard: false },
    ],
    driverName: 'Kenny Gregory Rattray',
  });
}

const INVENTED = [
  'Charged & Apportioned', 'Apportionment', 'Drive purpose & allocation', 'Personal non-shift', 'zero variance',
  'telematics', 'Telemetry', 'paper pump slips', 'Co:', 'View rule doc', 'Audited', 'Dynamic', 'Receipt',
];

describe('FuelWhoPaysSection', () => {
  it('charged week: chip, tiles, rows, adds-up line, fill windows', () => {
    const onMark = vi.fn();
    render(
      <FuelWhoPaysSection
        weeks={[weekFor({ fuelV3: v3, chargedBy: 'fuel-chain-v3' })]}
        review={{ needed: true, onMarkReviewed: onMark }}
        chainReview={null}
        stopToStopFor={() => ({ windows: 6, open: 0, summary: '' })}
      />,
    );
    expect(screen.getByTestId('who-pays-chip')).toHaveTextContent('Charged');
    expect(screen.getByText('Gas card J$10,000.00 · Cash J$14,500.00')).toBeInTheDocument();
    expect(screen.getByText('Odometer 198,250 → 199,753')).toBeInTheDocument();
    expect(screen.getByText(/Standard Fleet Rule · from 3 Aug 2026/)).toBeInTheDocument();
    const trips = screen.getByTestId('who-pays-row-uber_trips');
    expect(trips).toHaveTextContent('1,320 km × J$16.30');
    expect(trips).toHaveTextContent('Driver 20%');
    expect(screen.getAllByText('0 km · nothing to split')).toHaveLength(2);
    expect(screen.getByTestId('who-pays-adds-up')).toHaveTextContent('= J$24,500.00 fuel bought.');
    expect(screen.getByTestId('who-pays-s2s')).toHaveTextContent('6 / 6 checked');
    expect(screen.queryByTestId('who-pays-comparison')).toBeNull();
    for (const word of INVENTED) expect(document.body.textContent).not.toContain(word);
  });

  it('Mark reviewed shows only when a review is needed, and runs it', async () => {
    const onMark = vi.fn();
    const { rerender } = render(
      <FuelWhoPaysSection weeks={[weekFor({ fuelV3: v3 })]} review={{ needed: true, onMarkReviewed: onMark }} chainReview={null} stopToStopFor={() => null} />,
    );
    await userEvent.click(screen.getByTestId('who-pays-mark-reviewed'));
    expect(onMark).toHaveBeenCalled();
    rerender(
      <FuelWhoPaysSection weeks={[weekFor({ fuelV3: v3 })]} review={{ needed: false, onMarkReviewed: onMark }} chainReview={null} stopToStopFor={() => null} />,
    );
    expect(screen.queryByTestId('who-pays-mark-reviewed')).toBeNull();
    expect(screen.getByText('Nothing to review')).toBeInTheDocument();
  });

  it('preview week: old vs new and "Preview" on each row; no chip, box or "moved most" (owner 23 Nov)', () => {
    render(<FuelWhoPaysSection weeks={[weekFor({ fuelV3: v3 })]} review={null} chainReview={null} stopToStopFor={() => null} />);
    expect(screen.queryByTestId('who-pays-chip')).toBeNull();
    const cmp = screen.getByTestId('who-pays-comparison');
    expect(cmp).toHaveTextContent('J$6,066.41');
    expect(cmp).toHaveTextContent("Priced at the car's usual 12.0 km per litre");
    expect(cmp).toHaveTextContent('less for the driver');
    expect(cmp).not.toHaveTextContent('moved most');
    expect(document.body.textContent).not.toContain('New pricing preview');
    expect(document.body.textContent).not.toContain('Distance and who pays');
    expect(within(screen.getByTestId('who-pays-row-uber_trips')).getByText('Preview')).toBeInTheDocument();
  });

  it('Why this charge opens the four steps and closes', async () => {
    render(<FuelWhoPaysSection weeks={[weekFor({ fuelV3: v3 })]} review={null} chainReview={null} stopToStopFor={() => null} />);
    await userEvent.click(screen.getByRole('button', { name: /Why this charge/ }));
    const panel = await screen.findByTestId('why-this-charge');
    expect(panel).toHaveTextContent(/Why Kenny pays J\$/);
    expect(panel).toHaveTextContent('What the car cost to run');
    expect(panel).toHaveTextContent('J$24,500.00 fuel bought ÷ 1,503 km on the odometer = J$16.30 per km');
    expect(panel).toHaveTextContent('Adds up to 1,503 km, the same as the odometer.');
    expect(panel).toHaveTextContent('The company pays all of it');
    expect(panel).toHaveTextContent('Preview — not charged');
    expect(panel).not.toHaveTextContent('View rule doc');
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('why-this-charge')).toBeNull();
  });

  it('a week locked the old way: saved totals and the engine it was worked out with', () => {
    render(<FuelWhoPaysSection weeks={[weekFor({})]} review={null} chainReview={null} stopToStopFor={() => null} />);
    expect(screen.getByTestId('who-pays-chip')).toHaveTextContent('Priced the old way');
    expect(screen.getByTestId('who-pays-old-way')).toHaveTextContent('Worked out with the old pricing (fuel-chain-v2.2)');
    expect(screen.queryByRole('button', { name: /Why this charge/ })).toBeNull();
  });

  it('one tab per platform, each with the same breakdown as All, adding up to All (owner 23 Nov)', () => {
    const plain = weekFor({ fuelV3: v3 });
    const tripsCost = plain.cars[0].rows.find((r) => r.purpose === 'uber_trips')!;
    const pickupsCost = plain.cars[0].rows.find((r) => r.purpose === 'to_pickups')!;
    render(
      <FuelWhoPaysSection
        weeks={[
          weekFor({
            fuelV3: v3,
            kmSources: [
              { category: 'online', km: 1320, byPlatform: { InDrive: 300, Uber: 1000, Roam: 20 } },
              { category: 'reposition', km: 150, byPlatform: { Uber: 120, InDrive: 30 } },
            ],
          }),
        ]}
        review={null}
        chainReview={null}
        stopToStopFor={() => null}
      />,
    );
    // Tabs: All, then Uber, InDrive, Roam.
    const tabs = screen.getAllByRole('tab').map((t) => t.childNodes[0]?.textContent);
    expect(tabs).toEqual(['All', 'Uber', 'InDrive', 'Roam']);
    // All = the original table: one "Trips (all platforms)" row plus the rest (owner 23 Nov).
    expect(screen.getByTestId('who-pays-row-uber_trips')).toHaveTextContent('Trips (all platforms)');
    expect(screen.getByTestId('who-pays-row-to_pickups')).toBeInTheDocument();
    // The three platform tabs add up to the trips row, to the cent.
    const money = (s: string) => Number(s.replace(/[^0-9.]/g, ''));
    const driverOf = (p: string, purpose: string) => {
      const row = screen.queryByTestId(`who-pays-platform-row-${p}-${purpose}`);
      const t = row ? within(row).queryByText(/^Driver pays/) : null;
      return t ? money(t.textContent || '') : 0;
    };
    const trips: number[] = [];
    const pickups: number[] = [];
    for (const p of ['Uber', 'InDrive', 'Roam']) {
      fireEvent.click(screen.getByTestId(`who-pays-platform-tab-${p}`));
      trips.push(driverOf(p, 'uber_trips'));
      pickups.push(driverOf(p, 'to_pickups'));
    }
    const c = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100);
    expect(c(trips)).toBe(Math.round(tripsCost.driver * 100));
    expect(c(pickups)).toBe(Math.round(pickupsCost.driver * 100));
    // Roam has no pickups: 0, shown as "nothing to split".
    expect(screen.getByTestId('who-pays-platform-row-Roam-to_pickups')).toHaveTextContent('0 km · nothing to split');
    // A platform tab has the full breakdown, its own trips label, and no "All" rows.
    fireEvent.click(screen.getByTestId('who-pays-platform-tab-InDrive'));
    const indrive = screen.getByTestId('who-pays-platform-InDrive');
    expect(indrive).toHaveTextContent('InDrive trips');
    expect(indrive).toHaveTextContent('To pickups');
    expect(screen.queryByTestId('who-pays-row-to_pickups')).toBeNull();
  });

  it('no saved split: one "Trips (all platforms)" row, not "Uber trips"', () => {
    render(<FuelWhoPaysSection weeks={[weekFor({ fuelV3: v3 })]} review={null} chainReview={null} stopToStopFor={() => null} />);
    expect(screen.getByTestId('who-pays-row-uber_trips')).toHaveTextContent('Trips (all platforms)');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('no reports: "No fuel this week"', () => {
    render(<FuelWhoPaysSection weeks={[]} review={null} chainReview={null} stopToStopFor={() => null} />);
    expect(screen.getByTestId('who-pays-empty')).toHaveTextContent('No fuel this week.');
  });
});
