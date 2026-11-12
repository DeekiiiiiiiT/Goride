/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReconStepBoundary } from './ReconStepBoundary';

vi.mock('@sentry/react', () => ({ withScope: () => {}, captureReactException: () => {} }));

let fuelBroken = true;
function FuelPanel() {
  if (fuelBroken) throw new Error('fleet-fuel 503');
  return <p>Fuel checks</p>;
}

describe('ReconStepBoundary (WRA-33)', () => {
  it('a failing fuel step shows only "Fuel service unavailable" and the rest of the page stays', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <nav>Step list</nav>
        <ReconStepBoundary step="fuel"><FuelPanel /></ReconStepBoundary>
        <footer>Continue to Trips & earnings</footer>
      </div>,
    );
    const box = screen.getByTestId('recon-step-unavailable');
    expect(box.textContent).toMatch(/Fuel service unavailable/);
    expect(screen.getByText('Step list')).toBeTruthy();
    expect(screen.getByText('Continue to Trips & earnings')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('Retry loads the step again', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fuelBroken = true;
    render(<ReconStepBoundary step="fuel"><FuelPanel /></ReconStepBoundary>);
    fuelBroken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByTestId('recon-step-unavailable')).toBeNull();
    expect(screen.getByText('Fuel checks')).toBeTruthy();
  });

  it('a working step renders as normal', () => {
    fuelBroken = false;
    render(<ReconStepBoundary step="fuel"><FuelPanel /></ReconStepBoundary>);
    expect(screen.getByText('Fuel checks')).toBeTruthy();
  });
});
