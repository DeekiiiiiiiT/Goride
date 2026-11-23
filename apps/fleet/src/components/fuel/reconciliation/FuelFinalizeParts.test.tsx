/**
 * @vitest-environment jsdom
 * Part J screens 10, 11 — Still open rows with jumps, the refused box, the Fuel seal bar.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FuelFinalizeStillOpen, FuelSealRefusedBox } from './FuelFinalizeParts';
import { FuelDeskFinalizeBar } from './FuelDeskSection';

describe('Finalize fuel (Part J screens 10, 11)', () => {
  it('screen 10: one row per thing to fix, each with its Go to button', () => {
    const onGo = vi.fn();
    render(
      <FuelFinalizeStillOpen
        rows={[
          { key: 'a', tone: 'red', title: '2 gas-card fills waiting for the card statement', plate: '5179KZ', detail: 'Wed 18 Nov, Thu 19 Nov', part: 'checks' },
          { key: 'b', tone: 'amber', title: 'Distance and who pays not reviewed yet', part: 'distance' },
          { key: 'c', tone: 'red', title: 'The week of 9 Nov is still open.', part: null },
        ]}
        onGo={onGo}
      />,
    );
    const list = screen.getByTestId('recon-fuel-still-open');
    expect(list.textContent).toContain('3 to fix');
    const rows = within(list).getAllByTestId('recon-fuel-still-open-row');
    expect(rows[0].textContent).toContain('5179KZ');
    expect(rows[0].textContent).toContain('Wed 18 Nov, Thu 19 Nov');
    fireEvent.click(within(rows[0]).getByRole('button', { name: /Go to Fuel checks/ }));
    expect(onGo).toHaveBeenCalledWith('checks');
    fireEvent.click(within(rows[1]).getByRole('button', { name: /Go to Distance and who pays/ }));
    expect(onGo).toHaveBeenCalledWith('distance');
    expect(within(rows[2]).queryByRole('button')).toBeNull();
  });

  it('screen 10: the seal bar counts what is still open and stays off', () => {
    render(<FuelDeskFinalizeBar blockedReason="x" finalizing={false} locked={false} onFinalize={() => {}} openCount={3} />);
    expect(screen.getByTestId('recon-fuel-seal').textContent).toContain('Not ready');
    expect(screen.getByTestId('recon-fuel-seal').textContent).toContain('3 things still open');
    expect((screen.getByTestId('recon-finalize-fuel') as HTMLButtonElement).disabled).toBe(true);
  });

  it('screen 11: refused — nothing locked, the drivers named, totals, Try again', () => {
    const onTryAgain = vi.fn();
    render(
      <>
        <FuelSealRefusedBox
          title="Not locked — Kenny's fuel statement could not be written"
          driverLines={['Kenny Gregory Rattray: the fuel statement was not written']}
          totals={{ fuelBought: 24_500, driverPays: 5_648.2, companyKeeps: 18_851.8 }}
          canRetry
          retrying={false}
          onTryAgain={onTryAgain}
        />
        <FuelDeskFinalizeBar blockedReason={null} finalizing={false} locked={false} onFinalize={() => {}} refused />
      </>,
    );
    const box = screen.getByTestId('recon-fuel-refused');
    expect(box.textContent).toContain("Not locked — Kenny's fuel statement could not be written");
    expect(box.textContent).toContain('Nothing was locked and nothing was charged.');
    expect(within(box).getByTestId('recon-fuel-refused-drivers').textContent).toContain('Kenny Gregory Rattray');
    expect(box.textContent).toMatch(/Fuel bought\s*J\$24,500\.00/);
    expect(box.textContent).toMatch(/Driver pays\s*J\$5,648\.20/);
    expect(box.textContent).toMatch(/Company keeps\s*J\$18,851\.80/);
    fireEvent.click(within(box).getByRole('button', { name: /Try again/ }));
    expect(onTryAgain).toHaveBeenCalled();
    const seal = screen.getByTestId('recon-fuel-seal');
    expect(seal.textContent).toContain('Not locked');
    expect((screen.getByTestId('recon-finalize-fuel') as HTMLButtonElement).disabled).toBe(false);
    const all = document.body.textContent || '';
    for (const w of ['Seal Refused', 'Partition', 'ERR_FS', 'Ledger', 'SHA-256', 'Contract ID', 'transactions ready to commit', 'Kingston North']) {
      expect(all).not.toContain(w);
    }
  });
});
