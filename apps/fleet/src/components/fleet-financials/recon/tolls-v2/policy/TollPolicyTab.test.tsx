/**
 * @vitest-environment jsdom
 *
 * UI2 — Fleet Policy → Tolls (audit C3) on public.toll_v2_toll_settings.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TollSettingsRead } from './tollPolicyLogic';
import { diffPolicy, draftFrom, missingLine, parseJmd } from './tollPolicyLogic';

const tollV2Command = vi.fn();
vi.mock('../../../../../services/api', () => ({
  api: { tollV2Command: (...args: unknown[]) => tollV2Command(...args) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const rpc = vi.fn();
vi.mock('../../../../../utils/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { TollPolicyTab } from './TollPolicyTab';

function settings(over?: Partial<TollSettingsRead>): TollSettingsRead {
  return {
    switches: { tollDisputes: true, riderPaysDriver: true, loggedTrips: false },
    disputePolicy: { lostBearer: 'fleet', expiredBearer: 'driver' },
    platforms: [
      { platform: 'uber', paybackMode: 'per_trip', paysTollsBack: true, takesDisputes: true, disputeWindowDays: 9 },
      { platform: 'indrive', paybackMode: 'rider_pays_driver', paysTollsBack: false, takesDisputes: false, disputeWindowDays: null },
    ],
    plazas: [
      {
        plazaId: 'pm',
        name: 'Portmore',
        tagPrice: { current: { amountMinor: 39000, validFrom: '2026-11-01' }, history: [{ amountMinor: 39000, validFrom: '2026-11-01' }] },
        platformRates: [
          {
            platform: 'uber',
            current: { amountMinor: 37000, validFrom: '2026-11-01' },
            history: [
              { amountMinor: 38000, validFrom: '2099-12-01' },
              { amountMinor: 37000, validFrom: '2026-11-01' },
            ],
          },
        ],
      },
      {
        plazaId: 'st',
        name: 'Spanish Town',
        tagPrice: { current: { amountMinor: 28000, validFrom: '2026-11-01' }, history: [] },
        platformRates: [],
      },
    ],
    missing: [{ kind: 'plaza_rules', plaza_id: 'mp' }],
    seeded: true,
    approvals: { soleManager: true, thresholdMinor: 500000 },
    ...over,
  };
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TollPolicyTab />
    </QueryClientProvider>,
  );
}

describe('Fleet Policy — Tolls tab (UI2)', () => {
  beforeEach(() => {
    tollV2Command.mockReset();
    tollV2Command.mockResolvedValue({});
    rpc.mockReset();
    rpc.mockResolvedValue({ data: settings(), error: null });
  });

  it('shows the switches, the missing list, prices and a Missing chip where Uber has no rate', async () => {
    wrap();
    await screen.findByTestId('toll-policy-tab');
    expect(screen.getByText('Toll disputes: On')).toBeTruthy();
    expect(screen.getByText('Hand-logged trips: Off')).toBeTruthy();
    expect(screen.getByTestId('toll-policy-missing').textContent).toMatch(/A toll plaza has no toll price rules yet/);
    const pm = screen.getByTestId('toll-policy-plaza-pm');
    expect(pm.textContent).toMatch(/J\$390\.00/);
    expect(pm.textContent).toMatch(/J\$370\.00/);
    expect(within(screen.getByTestId('toll-policy-plaza-st')).getByTestId('toll-policy-missing-chip')).toBeTruthy();
    expect(screen.getByTestId('toll-policy-change-count').textContent).toBe('No changes');
    expect((screen.getByTestId('toll-policy-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Save sends only what changed, with the reason as note and self-approval', async () => {
    wrap();
    await screen.findByTestId('toll-policy-tab');
    fireEvent.click(within(screen.getByTestId('toll-policy-lost')).getByRole('radio', { name: 'The driver' }));
    expect(screen.getByTestId('toll-policy-change-count').textContent).toBe('1 change');
    fireEvent.click(screen.getByTestId('toll-policy-save'));
    const dlg = await screen.findByTestId('toll-policy-save-dialog');
    expect(dlg.textContent).toMatch(/When a dispute is lost, who pays: The fleet → The driver/);
    fireEvent.change(within(dlg).getByTestId('toll-policy-reason'), { target: { value: 'Drivers agreed in November' } });
    fireEvent.click(within(dlg).getByTestId('toll-policy-save-confirm'));
    await waitFor(() => expect(tollV2Command).toHaveBeenCalled());
    const [intent, body] = tollV2Command.mock.calls[0]!;
    expect(intent).toBe('change_toll_settings');
    expect(body).toMatchObject({
      dispute_policy: { lost_bearer: 'driver' },
      note: 'Drivers agreed in November',
      self_approval_reason: 'Drivers agreed in November',
    });
    expect(body).not.toHaveProperty('platform_settings');
  });

  it('the Missing chip opens Add rate filled in; Add rate sends plaza_rates_add', async () => {
    wrap();
    await screen.findByTestId('toll-policy-tab');
    fireEvent.click(screen.getByTestId('toll-policy-missing-chip'));
    const dlg = await screen.findByTestId('toll-policy-add-rate-dialog');
    expect((within(dlg).getByLabelText('Plaza') as HTMLSelectElement).value).toBe('st');
    expect((within(dlg).getByLabelText('Platform') as HTMLSelectElement).value).toBe('uber');
    fireEvent.change(within(dlg).getByTestId('toll-rate-amount'), { target: { value: '260' } });
    fireEvent.change(within(dlg).getByTestId('toll-rate-from'), { target: { value: '2026-12-01' } });
    fireEvent.click(within(dlg).getByTestId('toll-rate-confirm'));
    await waitFor(() =>
      expect(tollV2Command).toHaveBeenCalledWith(
        'change_toll_settings',
        expect.objectContaining({
          plaza_rates_add: [{ plaza_id: 'st', platform: 'uber', rate_minor: 26000, effective_from: '2026-12-01' }],
        }),
      ),
    );
  });

  it('a plaza row opens its price history with Now and Starts chips', async () => {
    wrap();
    fireEvent.click(await screen.findByTestId('toll-policy-plaza-pm'));
    const panel = await screen.findByTestId('toll-policy-history');
    expect(within(panel).getAllByText('Now').length).toBeGreaterThan(0);
    expect(within(panel).getByText(/Starts 1 Dec/)).toBeTruthy();
  });
});

describe('toll policy logic', () => {
  it('diff lists platform changes in plain words and builds snake_case fields', () => {
    const saved = draftFrom(settings());
    const draft = { ...saved, platforms: { ...saved.platforms, uber: { ...saved.platforms.uber!, disputeWindowDays: 7 } } };
    const d = diffPolicy(saved, draft);
    expect(d.changes).toEqual([{ label: 'Uber: days to dispute', from: '9', to: '7' }]);
    expect(d.body).toEqual({ platform_settings: { uber: { dispute_window_days: 7 } } });
  });

  it('missing lines and J$ parsing', () => {
    expect(missingLine({ kind: 'coverage_source', platform: 'uber' }, () => '')).toMatch(/^Uber: which report/);
    expect(parseJmd('J$ 380.00')).toBe(38000);
    expect(parseJmd('1,250.5')).toBe(125050);
    expect(parseJmd('0')).toBeNull();
    expect(parseJmd('abc')).toBeNull();
  });
});
