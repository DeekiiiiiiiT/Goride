/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FuelDeskFinalizeBar } from './FuelDeskSection';

describe('FuelDeskFinalizeBar', () => {
  it('is off and gives the reason while blocked', () => {
    render(<FuelDeskFinalizeBar blockedReason="Check the review box above before Finalize." finalizing={false} locked={false} onFinalize={() => {}} />);
    expect((screen.getByTestId('recon-finalize-fuel') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('recon-fuel-seal').textContent).toMatch(/Check the review box/);
  });
  it('finalizes when ready', () => {
    const onFinalize = vi.fn();
    render(<FuelDeskFinalizeBar blockedReason={null} finalizing={false} locked={false} onFinalize={onFinalize} />);
    fireEvent.click(screen.getByTestId('recon-finalize-fuel'));
    expect(onFinalize).toHaveBeenCalledTimes(1);
  });
  it('shows Locked with no button once locked', () => {
    render(<FuelDeskFinalizeBar blockedReason={null} finalizing={false} locked onFinalize={() => {}} />);
    expect(screen.queryByTestId('recon-finalize-fuel')).toBeNull();
    expect(screen.getByTestId('recon-fuel-seal').textContent).toMatch(/Locked/);
  });
});
