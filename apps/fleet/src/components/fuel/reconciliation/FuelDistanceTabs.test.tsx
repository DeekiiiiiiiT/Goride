/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FuelDistanceTabs } from './FuelDistanceTabs';

describe('FuelDistanceTabs (owner 23 Nov: Distance and who pays in tabs)', () => {
  it('opens on Who pays; each tab shows only its part; Mark reviewed jumps to Odometer checks', () => {
    render(
      <FuelDistanceTabs
        whoPaysSub="Driver pays J$3,573.99"
        checksSub="To fix"
        checksNeedAttention
        whoPays={(openChecks) => (
          <button type="button" onClick={openChecks}>
            Mark reviewed
          </button>
        )}
        checks={<p>fill windows here</p>}
        more={<p>leftover split here</p>}
      />,
    );
    expect(screen.getByTestId('fuel-distance-tab-who').textContent).toContain('Driver pays J$3,573.99');
    expect(screen.getByTestId('fuel-distance-tab-checks').textContent).toContain('To fix');
    expect(screen.queryByText('fill windows here')).toBeNull();

    fireEvent.click(screen.getByText('Mark reviewed'));
    expect(screen.getByText('fill windows here')).toBeTruthy();
    expect(screen.queryByText('Mark reviewed')).toBeNull();

    fireEvent.click(screen.getByTestId('fuel-distance-tab-more'));
    expect(screen.getByText('leftover split here')).toBeTruthy();
    expect(screen.queryByText('fill windows here')).toBeNull();
  });
});
