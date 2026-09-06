/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriverServiceQualityTab } from './DriverServiceQualityTab';
import { orderedPlatformKeys } from './DriverServiceQualityTab';

vi.mock('../../../services/api', () => ({
  api: {
    getDriverCompliance: vi.fn().mockResolvedValue({ documents: [] }),
    getDriverNotes: vi.fn().mockResolvedValue({ notes: [] }),
    getDriverAudit: vi.fn().mockResolvedValue({ data: [] }),
    addDriverNote: vi.fn(),
    verifyDriverDocument: vi.fn(),
    appendDriverAudit: vi.fn(),
  },
}));

describe('orderedPlatformKeys', () => {
  it('prefers Uber then InDrive, then other keys sorted', () => {
    expect(
      orderedPlatformKeys({
        Roam: { trips: 1, completed: 1 },
        InDrive: { trips: 2, completed: 2 },
        Uber: { trips: 3, completed: 3 },
        Bolt: { trips: 1, completed: 0 },
      }),
    ).toEqual(['Uber', 'InDrive', 'Bolt', 'Roam']);
  });
});

describe('DriverServiceQualityTab empty state', () => {
  it('shows empty cancelled-trips copy', () => {
    render(
      <DriverServiceQualityTab
        metrics={{
          currentRating: 0,
          completionRate: 100,
          periodCancelledTrips: 0,
          acceptanceRate: null,
          totalTrips: 0,
          cancellationRate: 0,
          platformStats: {},
        }}
        cancelledTripsInPeriod={[]}
        serverTripsLoaded
      />,
    );
    expect(screen.getByTestId('service-quality-empty')).toBeTruthy();
    expect(screen.getByText(/No cancelled trips in this period/i)).toBeTruthy();
  });
});

describe('DriverProfileTab empty states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty documents and notes', async () => {
    const { DriverProfileTab } = await import('./DriverProfileTab');
    render(
      <DriverProfileTab
        driverId="d1"
        driverName="Test Driver"
        documents={[]}
        selectedDocument={null}
        setSelectedDocument={() => undefined}
        canEditDrivers={false}
      />,
    );
    expect(await screen.findByTestId('profile-docs-empty')).toBeTruthy();
    expect(screen.getByText(/No documents on file/i)).toBeTruthy();
  });
});
