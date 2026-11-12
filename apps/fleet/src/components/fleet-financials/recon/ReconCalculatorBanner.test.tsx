/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReconCalculatorBanner } from './ReconCalculatorBanner';

const base = { paused: false, pausedSince: null, pendingUnits: 0, lastComputedAt: null } as never;

describe('ReconCalculatorBanner', () => {
  it('paused shows red and says Close is off', () => {
    render(<ReconCalculatorBanner calculator={{ ...(base as object), paused: true, pausedSince: '2026-10-27T00:00:00Z' } as never} />);
    const el = screen.getByTestId('recon-calculator-banner');
    expect(el.dataset.state).toBe('paused');
    expect(el.textContent).toMatch(/paused since 27 Oct 2026/);
    expect(el.textContent).toMatch(/Close week stays off/);
  });
  it('waiting changes shows updating', () => {
    render(<ReconCalculatorBanner calculator={{ ...(base as object), pendingUnits: 3 } as never} />);
    expect(screen.getByTestId('recon-calculator-banner').dataset.state).toBe('updating');
  });
  it('otherwise fresh', () => {
    render(<ReconCalculatorBanner calculator={base} />);
    expect(screen.getByTestId('recon-calculator-banner').dataset.state).toBe('fresh');
  });
});
