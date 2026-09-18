/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { toFuelQualityRow, type EnrichedVehicleSnap } from './buildFuelWizardRows';
import { plainIssue, type FuelQualityRow } from './FuelDataQualityStep';
import { FuelVehicleEvidenceSheet } from './FuelPendingLogsSheet';
import type { FuelFlagDeskRow } from '../../../utils/fuelFillFlagClassify';
import type { FuelEntry } from '../../../types/fuel';

function snap(partial: Partial<EnrichedVehicleSnap> = {}): EnrichedVehicleSnap {
  return {
    vehicleId: 'v1',
    plate: '5179KZ',
    totalSpend: 30_300,
    companyShare: 0,
    driverShare: 0,
    misc: 0,
    pendingCount: 7,
    hasOpenDispute: false,
    isFinalized: false,
    healthStatus: 'Red',
    driverSpend: 0,
    netPay: 0,
    odometerIncomplete: false,
    ...partial,
  };
}

describe('toFuelQualityRow subtitle', () => {
  it('does not include pending log(s) when health is Red and pendingCount > 0', () => {
    const row = toFuelQualityRow(snap(), [], []);
    expect(row.subtitle).toBe('Red');
    expect(row.subtitle).not.toMatch(/pending/i);
    expect(row.pendingCount).toBe(7);
  });

  it('keeps odometer incomplete in subtitle without pending', () => {
    const row = toFuelQualityRow(
      snap({ healthStatus: 'Amber', odometerIncomplete: true, pendingCount: 3 }),
      [],
      [],
    );
    expect(row.subtitle).toMatch(/Amber/);
    expect(row.subtitle).toMatch(/Incomplete odometer/i);
    expect(row.subtitle).not.toMatch(/pending/i);
  });
});

describe('plainIssue', () => {
  const base: FuelQualityRow = {
    id: 'v1',
    plate: '5179KZ',
    driverName: 'Kenny',
    healthStatus: 'Red',
    pendingCount: 7,
    totalSpend: 30_300,
    companyShare: 0,
    driverShare: 0,
    cashFromEarnings: 0,
    netPay: 0,
    misc: 0,
    subtitle: 'Red',
  };

  it('uses open flagged fill count instead of pending', () => {
    expect(plainIssue(base, 4)).toBe('Red · 4 flagged fills need review');
    expect(plainIssue(base, 1)).toBe('Red · 1 flagged fill needs review');
  });

  it('falls back to health subtitle when no open flags', () => {
    expect(plainIssue(base, 0)).toBe('Red');
  });
});

describe('FuelVehicleEvidenceSheet', () => {
  it('does not render Pending fills section', () => {
    const entry = {
      id: 'e1',
      vehicleId: 'v1',
      date: '2026-09-11',
      amount: 1500,
      type: 'Card',
    } as FuelEntry;
    const flaggedRows: FuelFlagDeskRow[] = [
      {
        entryId: 'e1',
        entry,
        dateYmd: '2026-09-11',
        plate: '5179KZ',
        driverName: 'Kenny',
        categories: ['Integrity'],
        reasons: [
          {
            code: 'integrity_warning',
            label: 'Approaching Capacity',
            category: 'Integrity',
            severity: 'warning',
            resolved: false,
          },
        ],
        isFlagged: true,
        primarySeverity: 'warning',
        hasOpenCritical: false,
        cleared: false,
        status: 'open',
      },
    ];

    render(
      <FuelVehicleEvidenceSheet
        open
        onOpenChange={() => undefined}
        plate="5179KZ"
        driverName="Kenny"
        flaggedRows={flaggedRows}
      />,
    );

    expect(screen.getByText(/Flagged fills/i)).toBeTruthy();
    expect(screen.queryByText(/^Pending fills$/i)).toBeNull();
    expect(screen.queryByText(/will post on Finalize/i)).toBeNull();
  });
});
