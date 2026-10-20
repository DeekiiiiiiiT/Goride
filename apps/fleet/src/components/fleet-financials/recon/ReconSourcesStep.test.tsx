/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReconSourceCard } from './ReconSourcesStep';

describe('ReconSourceCard', () => {
  it('renders a missing required source with action affordances', () => {
    render(
      <ReconSourceCard
        weekKey="2026-10-05"
        source={{
          id: 'toll_usage',
          label: 'Tag account usage statement',
          requirement: 'required',
          status: 'missing',
          coverage: {},
        }}
        onUpload={() => {}}
        onAttestNone={() => {}}
      />,
    );
    expect(screen.getByTestId('recon-source-toll_usage')).toBeTruthy();
    expect(screen.getByText(/Tag account usage statement/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upload statement/i })).toBeTruthy();
  });

  it('shows Remind Roam for waiting external fuel', () => {
    render(
      <ReconSourceCard
        weekKey="2026-10-05"
        source={{
          id: 'fuel_card_roam',
          label: 'Roam-issued fuel card statement',
          kind: 'external_dependency',
          requirement: 'required',
          status: 'waiting_external',
          coverage: {},
        }}
        onRemindRoam={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Remind Roam/i })).toBeTruthy();
    expect(screen.getByText(/Waiting on Roam/i)).toBeTruthy();
  });
});
