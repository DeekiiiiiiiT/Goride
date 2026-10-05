/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../services/api', () => ({
  api: {
    getTollLowBalance: vi.fn().mockRejectedValue(new Error('404')),
    getTollTags: vi.fn().mockRejectedValue(new Error('404')),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { TollLowBalanceQueue } from './TollLowBalanceQueue';
import { TagInventory } from '../../pages/TagInventory';

describe('toll load failure', () => {
  it('shows the low-balance error panel and not the all-clear sentence', async () => {
    render(<TollLowBalanceQueue />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Could not load toll tags')).toBeTruthy();
    expect(screen.queryByText(/Every active tag is above its alert threshold/)).toBeNull();
  });

  it('shows the inventory error panel and not the empty-state copy', async () => {
    render(<TagInventory />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.queryByText('No tags found')).toBeNull();
    expect(screen.queryByText(/Get started by adding your first toll tag/)).toBeNull();
  });
});
