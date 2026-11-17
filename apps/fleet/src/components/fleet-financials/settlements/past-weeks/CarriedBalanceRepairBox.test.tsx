/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CarriedBalanceRepairBox, type CarriedBalancePreview } from './CarriedBalanceRepairBox';

const DRIVER_ID = 'kenny-id';
const DRIVER_NAME = 'Kenny Gregory Rattray';

const kennyPreview = (): CarriedBalancePreview => ({
  lines: [
    {
      sourceWeek: '2026-02-02',
      amount: -10_640.43,
      sentence: 'Week of 2026-02-02: the rest of his balance, he owes $10640.43.',
    },
    {
      sourceWeek: '2026-02-09',
      amount: -17_961.09,
      sentence: 'Week of 2026-02-09: the rest of his balance, he owes $17961.09.',
    },
    {
      sourceWeek: '2026-02-23',
      amount: -14_690.46,
      sentence: 'Week of 2026-02-23: the rest of his balance, he owes $14690.46.',
    },
    {
      sourceWeek: '2026-03-02',
      amount: -12_029.67,
      sentence: 'Week of 2026-03-02: the rest of his balance, he owes $12029.67.',
    },
  ],
  drift: Array.from({ length: 8 }, (_, i) => ({ week: `2026-0${i + 2}-01` })),
  currentLandingSettlement: 53_697.75,
  expectedLandingSettlement: -1_623.9,
  reason: '',
});

const carriedMock = vi.fn();

vi.mock('../../../../services/settlementCommandsApi', () => ({
  SettlementCommandApiError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  settlementCommandsApi: {
    carriedBalanceCorrections: (...args: unknown[]) => carriedMock(...args),
    pastWeeksStatus: vi.fn(async () => ({
      partialWriteOff: true,
      driverId: DRIVER_ID,
      applicable: false,
      complete: true,
    })),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PastWeeksBanner } from './PastWeeksBanner';

afterEach(() => {
  cleanup();
  carriedMock.mockReset();
});

describe('CarriedBalanceRepairBox (Kenny preview)', () => {
  it('shows owes copy and four lines', () => {
    render(
      <CarriedBalanceRepairBox
        driverName={DRIVER_NAME}
        preview={kennyPreview()}
        busy={false}
        applyError={null}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByText(/Some old weeks were moved to the week of 19 Oct/)).toBeTruthy();
    expect(screen.getByText(/Closed weeks put back to their signed amount: 8/)).toBeTruthy();
    expect(screen.getByText(/Kenny Gregory Rattray owes J\$1,623.90/)).toBeTruthy();
    expect(screen.getByText(/Fleet owes J\$53,697.75/)).toBeTruthy();
  });

  it('calls confirm on button', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <CarriedBalanceRepairBox
        driverName={DRIVER_NAME}
        preview={kennyPreview()}
        busy={false}
        applyError={null}
        onApply={onApply}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Move the rest onto 19 Oct/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('hides when preview has no lines or drift', () => {
    const { container } = render(
      <CarriedBalanceRepairBox
        driverName={DRIVER_NAME}
        preview={{ lines: [], drift: [] }}
        busy={false}
        applyError={null}
        onApply={vi.fn()}
      />,
    );
    expect(container.textContent).toBe('');
  });
});

describe('PastWeeksBanner carried apply flow', () => {
  function Harness() {
    const [preview, setPreview] = useState<CarriedBalancePreview>(kennyPreview());
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const onApply = async () => {
      setBusy(true);
      setErr(null);
      await carriedMock({ confirm: true, driverId: DRIVER_ID });
      setPreview({ lines: [], drift: [] });
      setBusy(false);
    };

    return (
      <CarriedBalanceRepairBox
        driverName={DRIVER_NAME}
        preview={preview}
        busy={busy}
        applyError={err}
        onApply={() => void onApply()}
      />
    );
  }

  it('confirm then hides box when preview empties', async () => {
    carriedMock.mockResolvedValue({ expectedLandingSettlement: -1_623.9 });
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole('button', { name: /Move the rest onto 19 Oct/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Move the rest onto 19 Oct/ }));
    await waitFor(() => {
      expect(carriedMock).toHaveBeenCalledWith({ confirm: true, driverId: DRIVER_ID });
    });
    await waitFor(() => {
      expect(screen.queryByText(/Some old weeks were moved/)).toBeNull();
    });
  });

  it('loads preview from API on the banner when driver is set', async () => {
    carriedMock.mockResolvedValue(kennyPreview());
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PastWeeksBanner
          hubTab="cash"
          driverNameFor={() => DRIVER_NAME}
          onOpenCloseWeek={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Kenny Gregory Rattray owes J\$1,623.90/)).toBeTruthy();
    expect(carriedMock).toHaveBeenCalledWith({ confirm: false, driverId: DRIVER_ID });
  });
});