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

  it('shows Upload on uber_bundle and indrive_trips cards', () => {
    const { rerender } = render(
      <ReconSourceCard
        weekKey="2026-10-05"
        source={{
          id: 'uber_bundle',
          label: 'Uber week bundle',
          requirement: 'required',
          status: 'missing',
          coverage: {},
        }}
        onUpload={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeTruthy();

    rerender(
      <ReconSourceCard
        weekKey="2026-10-05"
        source={{
          id: 'indrive_trips',
          label: 'InDrive trips',
          requirement: 'required',
          status: 'missing',
          coverage: {},
        }}
        onUpload={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeTruthy();
  });

  it('shows Remind Roam for waiting external fuel without fleet upload', () => {
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
        onUpload={() => {}}
        canUploadExternalSources={false}
      />,
    );
    expect(screen.getByRole('button', { name: /Remind Roam/i })).toBeTruthy();
    expect(screen.getByText(/Waiting on Roam/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Upload/i })).toBeNull();
  });

  it('shows Upload on Roam fuel only when recon.external_sources', () => {
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
        onUpload={() => {}}
        canUploadExternalSources
      />,
    );
    expect(screen.getByRole('button', { name: /Remind Roam/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upload statement/i })).toBeTruthy();
  });
});
