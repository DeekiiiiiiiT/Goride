/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FuelLogKpiRow,
  transactionKpisToTiles,
} from './FuelLogKpiRow';
import type { TransactionKpis } from '../../../utils/fuelLogKpiMetrics';
import { replaceServerTransactionKpis } from '../../../hooks/useFuelLogSummary';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

const baseKpis: TransactionKpis = {
  totalFills: 4,
  totalSpend: 200,
  cashSpend: 50,
  gasCardSpend: 150,
  totalVolume: 20,
  totalKm: 100,
  imbalancedCount: 2,
  sourcePortal: 2,
  sourceAdmin: 1,
  sourceAnchors: 1,
  populationNote: 'client',
};

describe('FuelLogKpiRow', () => {
  it('imbalanced tile click applies filter callback', async () => {
    const user = userEvent.setup();
    const onTileClick = vi.fn();
    render(
      <FuelLogKpiRow
        tiles={transactionKpisToTiles(baseKpis, { integrityActive: false })}
        onTileClick={onTileClick}
      />,
    );
    await user.click(screen.getByText('Imbalanced').closest('[role="button"]')!);
    expect(onTileClick).toHaveBeenCalledWith('imbalanced');
  });

  it('spend tile shows cash and gas card when they add up to the total', () => {
    render(<FuelLogKpiRow tiles={transactionKpisToTiles(baseKpis)} />);
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getByText('Gas Card')).toBeTruthy();
    expect(screen.getByText(formatFuelMoney(50, 0))).toBeTruthy();
    expect(screen.getByText(formatFuelMoney(150, 0))).toBeTruthy();
  });
});

describe('replaceServerTransactionKpis', () => {
  it('replaces the whole fills tile set from one source', () => {
    const next = replaceServerTransactionKpis(baseKpis, {
      totalFills: 9,
      totalSpend: 500,
      totalVolume: 40,
      totalKm: 250,
      totalCycles: 3,
      totalDistance: 250,
      totalFuel: 40,
      sourcePortal: 5,
      sourceAdmin: 3,
      sourceAnchors: 1,
    });
    expect(next.totalFills).toBe(9);
    expect(next.sourcePortal).toBe(5);
    expect(next.sourceAdmin).toBe(3);
    expect(next.sourceAnchors).toBe(1);
    expect(next.totalKm).toBe(250);
    expect(next.imbalancedCount).toBe(2); // client integrity retained
    expect(next.populationNote).toContain('Server log-summary');
  });
});
