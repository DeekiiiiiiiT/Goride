/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../services/api', () => ({
  api: {
    getDriversRoster: vi.fn().mockResolvedValue({
      data: [
        { id: 'drv-kenny', name: 'Kenny Gregory Rattray', uberDriverId: '52ff47da-ef48-41b8-93d5-80a09b85ce5b' },
        { id: 'drv-other', name: 'Second Driver', uberDriverId: '11111111-2222-3333-4444-555555555555' },
      ],
    }),
    getDrivers: vi.fn().mockResolvedValue([]),
    importUberActivityTimeline: vi.fn(),
  },
}));

vi.mock('../../utils/timezoneDisplay', () => ({
  useFleetTimezone: () => 'America/Jamaica',
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { UberActivityTimelineImportPanel } from './UberActivityTimelineImportPanel';

const PASTE_LINES = [
  'October 31 2026',
  'Offline',
  '8:16 pm',
  '3m',
  '',
  'Trip completed',
  '8:12 pm',
  '32m',
  '',
  'On trip',
  '7:40 pm',
  '4m',
  '',
  'Online',
  '7:00 pm',
  '18h 25m',
];

function withDriverColumns(uuid: string): string {
  return [
    '﻿Driver UUID,Driver first name,Driver last name,Activity',
    `${uuid},KENNY GREGORY,RATTRAYCAS,${PASTE_LINES[0]}`,
    ...PASTE_LINES.slice(1).map((l) => `,,,${l}`),
  ].join('\r\n');
}

function csvFile(text: string): File {
  const f = new File([text], 'uber_activity_timeline.csv', { type: 'text/csv' });
  // jsdom File lacks text() in some versions
  if (typeof (f as File & { text?: unknown }).text !== 'function') {
    Object.defineProperty(f, 'text', { value: () => Promise.resolve(text) });
  }
  return f;
}

async function upload(text: string) {
  render(<UberActivityTimelineImportPanel />);
  await waitFor(() => expect(screen.getByText(/the driver is found from the file/i)).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Upload Uber activity timeline'), {
    target: { files: [csvFile(text)] },
  });
}

describe('Activity timeline upload — driver comes from the file only', () => {
  it('matches the driver from the Uber ID column and enables Import', async () => {
    await upload(withDriverColumns('52ff47da-ef48-41b8-93d5-80a09b85ce5b'));
    await waitFor(() => expect(screen.getByText('Kenny Gregory Rattray')).toBeTruthy());
    expect(screen.getByText(/Found from the Uber ID in the file/)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Import activity' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('a file without the ID columns says what to add and keeps Import off', async () => {
    await upload(PASTE_LINES.join('\r\n'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/no driver Uber ID/));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Import activity' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('an Uber ID no driver has says to save it on the Profile', async () => {
    await upload(withDriverColumns('99999999-0000-0000-0000-000000000000'));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/No driver has Uber ID 99999999/),
    );
    expect(
      (screen.getByRole('button', { name: 'Import activity' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
