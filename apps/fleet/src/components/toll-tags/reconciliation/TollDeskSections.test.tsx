/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TollDeskSections, fmtTollMoney } from './TollDeskSections';

const money = { spend: 4620, paidBack: 2100, charged: 900, fleetCost: 1620 };
const section = (id: string, todo: number) => ({
  id, title: id, description: 'd', itemCount: 1, itemNoun: 'toll', todo, total: 10, content: <p>{`body-${id}`}</p>,
});

describe('TollDeskSections', () => {
  it('formats J$ with a real minus sign', () => {
    expect(fmtTollMoney(1620)).toBe('J$1,620.00');
    expect(fmtTollMoney(-210)).toBe('−J$210.00');
  });

  it('Seal tolls is off and says why while items need a decision', () => {
    const onSeal = vi.fn();
    render(
      <TollDeskSections money={money} sections={[section('deadhead', 2)]} driverCharges={[]} ledgerDifference={0}
        sealBlockedReason="2 items still need a decision." sealing={false} busy={false} onSeal={onSeal} onRefresh={() => {}} />,
    );
    const btn = screen.getByTestId('recon-seal-tolls') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId('recon-toll-seal').textContent).toMatch(/2 items still need a decision/);
    expect(screen.getByText('2 to decide')).toBeTruthy();
  });

  it('Seal tolls runs when ready, and the driver card goes to the right column', () => {
    const onSeal = vi.fn();
    const target = document.createElement('div');
    document.body.appendChild(target);
    render(
      <TollDeskSections money={money} sections={[section('reimbursed', 0)]} driverCharges={[{ name: 'Phillip Bailey', amount: 270 }]}
        ledgerDifference={0} sealBlockedReason={null} sealing={false} busy={false} onSeal={onSeal} onRefresh={() => {}} summaryTarget={target} />,
    );
    fireEvent.click(screen.getByTestId('recon-seal-tolls'));
    expect(onSeal).toHaveBeenCalledTimes(1);
    expect(target.textContent).toMatch(/Phillip Bailey/);
    expect(target.textContent).toMatch(/Balanced and ready to seal/);
  });
});
