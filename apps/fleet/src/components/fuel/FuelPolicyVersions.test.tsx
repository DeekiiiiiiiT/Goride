/**
 * @vitest-environment jsdom
 * Part J screens 15, 16 — Rules tab rows and versions; Add a version refused on a locked week.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FuelRule, FuelScenario } from '../../types/fuel';
import { splitRows } from '../../utils/fuelPolicyRulesModel';
import { AddFuelVersionDialog, HowRoamSortsKm, PolicySplitRows, PolicyVersionsSection } from './FuelPolicyVersions';

const rule = (p: Partial<FuelRule> = {}): FuelRule => ({
  id: 'r', category: 'Fuel', coverageType: 'Percentage', coverageValue: 80, rideShareCoverage: 80, deadheadCoverage: 50,
  companyUsageCoverage: 100, personalCoverage: 0, commuteCoverage: 100,
  leftoverSplit: { mode: 'percentage', driverPercent: 50, appliesTo: ['variance', 'unattributedKm', 'noOdometerFills'] }, ...p,
});
const policy = {
  id: 'p1', name: 'Standard Fleet Rule', isDefault: true, rules: [rule()],
  versions: [{ id: 'v1-uuid', effectiveFrom: '2026-08-03', rules: [rule()], driverIds: ['kenny'], createdAt: '2026-08-01T00:00:00Z' }],
} as FuelScenario;
const frozen = ['2026-11-02', '2026-11-09', '2026-11-16'];
const weeks = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];

describe('Fleet Policy Rules (Part J screens 15, 16)', () => {
  it('screen 15: six kinds with company / driver, no invented descriptions', () => {
    render(<PolicySplitRows rows={splitRows(rule())} />);
    const rows = screen.getByTestId('policy-split-rows');
    expect(within(rows).getByTestId('policy-split-rideShare').textContent).toContain('Uber trips 80%');
    expect(within(rows).getByTestId('policy-split-rideShare').textContent).toContain('80% / 20%');
    expect(within(rows).getByTestId('policy-split-leftover').textContent).toContain('Km nobody can explain 50%');
    for (const w of ['Commercial active passenger', 'telematics', 'IRS', 'Base Model', 'Split Matrix', 'Policy Protocol']) {
      expect(document.body.textContent).not.toContain(w);
    }
  });

  it('screen 15: a version card with chip, applies-from, locked weeks, days active, version id and Edit version', () => {
    const onEdit = vi.fn();
    render(
      <PolicyVersionsSection scenario={policy} frozenMondays={frozen} thisMonday="2026-11-16" todayYmd="2026-11-16" onAdd={() => {}} onEdit={onEdit} />,
    );
    const card = screen.getByTestId('policy-version-card');
    expect(card.textContent).toContain('Version 1');
    expect(card.textContent).toContain('Current');
    expect(card.textContent).toContain('Closed weeks keep this split');
    expect(card.textContent).toContain('Applies from the week of 3 Aug 2026');
    expect(card.textContent).toContain('Uber trips: company pays 80%');
    expect(card.textContent).toContain('Weeks locked under this version: 3');
    expect(card.textContent).toContain('Active for 105 days');
    expect(card.textContent).toContain('Version id v1-uuid');
    fireEvent.click(within(card).getByRole('button', { name: /Edit version/ }));
    expect(onEdit).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Add a version/ })).toBeTruthy();
  });

  it('screen 16: a locked week is refused with the first open week; an open week saves', async () => {
    const onSave = vi.fn(async () => {});
    render(
      <AddFuelVersionDialog
        open
        onOpenChange={() => {}}
        scenario={policy}
        allScenarios={[policy]}
        frozenMondays={frozen}
        thisMonday="2026-11-23"
        weekOptions={weeks}
        onSave={onSave}
      />,
    );
    const dlg = await screen.findByTestId('add-fuel-version');
    expect(dlg.textContent).toContain('Add a version of Standard Fleet Rule');
    fireEvent.change(within(dlg).getByLabelText('Uber trips — company pays'), { target: { value: '75' } });
    expect(dlg.textContent).toContain('The driver pays the rest: 25%');
    fireEvent.change(within(dlg).getByLabelText('Applies from'), { target: { value: '2026-11-09' } });
    expect(within(dlg).getByTestId('add-fuel-version-error').textContent).toContain(
      'That week is already locked. Choose the week of 23 Nov 2026 or later.',
    );
    const add = within(dlg).getByRole('button', { name: /Add version/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(dlg.textContent).toContain('Nothing already locked changes.');
    fireEvent.change(within(dlg).getByLabelText('Applies from'), { target: { value: '2026-11-23' } });
    expect(within(dlg).queryByTestId('add-fuel-version-error')).toBeNull();
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = (onSave.mock.calls[0] as unknown as [FuelScenario])[0];
    expect(saved.versions?.[1].rules[0].rideShareCoverage).toBe(75);
    for (const w of ['operational split parameter', 'epoch', 'Base Fleet Variable', 'Audit Lock Conflict', 'Direct driver account billing']) {
      expect(dlg.textContent).not.toContain(w);
    }
  });

  it('How Roam sorts the km — read only', () => {
    render(<HowRoamSortsKm policy={{ deadhead_gap_max_minutes: 20, personal_gap_min_minutes: 60, prefer_odo_gaps: true }} />);
    const box = screen.getByTestId('how-roam-sorts-km');
    expect(box.textContent).toContain('a wait of up to 20 minutes between trips counts as driving to a pickup');
    expect(within(box).queryByRole('button')).toBeNull();
  });
});
