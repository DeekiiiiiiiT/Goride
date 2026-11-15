// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FuelDeskSlides, FuelStillOpenList, firstOpenPartIndex, openParts, type FuelSlidePart } from './FuelDeskSlides';
import { FuelDisputesEmpty } from './FuelSlideParts';

const part = (id: FuelSlidePart['id'], title: string, tone: FuelSlidePart['status']['tone'], text = tone): FuelSlidePart => ({
  id,
  title,
  short: title.split(' ')[0],
  description: `${title} description`,
  status: { text, tone },
  testId: `recon-fuel-section-${id}`,
  content: <p>{title} content</p>,
});

// Week of 5 Oct 2026 as on screen: one fill blocks, distance not reviewed.
const week5Oct = (): FuelSlidePart[] => [
  part('checks', 'Fuel checks', 'fix', '1 to fix'),
  part('disputes', 'Disputes and adjustments', 'done', 'Nothing open'),
  part('policy', 'Fuel policy', 'info', 'Check'),
  part('distance', 'Distance and who pays', 'review', 'Review'),
  {
    ...part('finalize', 'Finalize fuel', 'locked', 'Not ready'),
    content: ({ goTo }) => (
      <FuelStillOpenList
        items={openParts([
          { id: 'checks', title: 'Fuel checks', status: { text: '1 to fix', tone: 'fix' } },
          { id: 'distance', title: 'Distance and who pays', status: { text: 'Review', tone: 'review' } },
          { id: 'finalize', title: 'Finalize fuel', status: { text: 'Not ready', tone: 'locked' } },
        ])}
        onGo={goTo}
      />
    ),
  },
];

describe('Fuel step one part at a time (Stitch fuel step redesign)', () => {
  it('opens on the first part that needs something, else on Finalize', () => {
    expect(firstOpenPartIndex(week5Oct())).toBe(0);
    expect(firstOpenPartIndex([part('checks', 'a', 'done'), part('disputes', 'b', 'review'), part('finalize', 'c', 'locked')])).toBe(1);
    expect(firstOpenPartIndex([part('checks', 'a', 'done'), part('finalize', 'c', 'done')])).toBe(1);
  });

  it('shows one card at a time; Next and Back move between parts', () => {
    render(<FuelDeskSlides parts={week5Oct()} />);
    expect(screen.getByTestId('recon-fuel-section-checks')).toBeTruthy();
    expect(screen.queryByTestId('recon-fuel-section-disputes')).toBeNull();
    expect(screen.getByText('Part 1 of 5')).toBeTruthy();
    expect(screen.getByTestId('recon-fuel-next').textContent).toContain('Next: Disputes and adjustments');
    fireEvent.click(screen.getByTestId('recon-fuel-next'));
    expect(screen.getByTestId('recon-fuel-section-disputes')).toBeTruthy();
    expect(screen.queryByTestId('recon-fuel-section-checks')).toBeNull();
    expect(screen.getByText('Part 2 of 5')).toBeTruthy();
    fireEvent.click(screen.getByTestId('recon-fuel-back'));
    expect(screen.getByTestId('recon-fuel-section-checks')).toBeTruthy();
  });

  it('a progress pill jumps to its part; the last part has no Next', () => {
    render(<FuelDeskSlides parts={week5Oct()} />);
    fireEvent.click(screen.getByTestId('recon-fuel-part-finalize'));
    expect(screen.getByTestId('recon-fuel-section-finalize')).toBeTruthy();
    expect(screen.queryByTestId('recon-fuel-next')).toBeNull();
    expect(screen.getByText('Part 5 of 5')).toBeTruthy();
  });

  it('Finalize lists what is still open and "Go to" jumps there', () => {
    render(<FuelDeskSlides parts={week5Oct()} />);
    fireEvent.click(screen.getByTestId('recon-fuel-part-finalize'));
    const open = screen.getByTestId('recon-fuel-still-open');
    expect(open.textContent).toContain('Still open (2)');
    fireEvent.click(screen.getByText('Go to Distance and who pays'));
    expect(screen.getByTestId('recon-fuel-section-distance')).toBeTruthy();
  });

  it('arrow keys move when no text box has focus', () => {
    render(<FuelDeskSlides parts={week5Oct()} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('recon-fuel-section-disputes')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('recon-fuel-section-checks')).toBeTruthy();
  });

  it('Part 2 with nothing open shows the calm empty state with Add adjustment', () => {
    let added = 0;
    render(<FuelDisputesEmpty periodLocked={false} onAddAdjustment={() => (added += 1)} />);
    expect(screen.getByText('No driver disputes this week.')).toBeTruthy();
    fireEvent.click(screen.getByText('Add adjustment'));
    expect(added).toBe(1);
  });
});
