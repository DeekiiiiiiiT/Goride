/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ReconActivityTimelineCard, hoursCell, timelineDayLabel } from './ReconActivityTimelineCard';
import type { ReconTimelineDay, ReconWeekTimeline } from '../../../services/reconApi';

const DAYS = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
// Real week of 26 Oct (Kenny): timeline trips per day; Uber's trip file has the same counts.
const TRIPS = [7, 12, 4, 13, 12, 12, 0];

function day(i: number, over: Partial<ReconTimelineDay> = {}): ReconTimelineDay {
  return {
    day: DAYS[i], onlineHours: TRIPS[i] ? 9.5 : 0, enrouteHours: TRIPS[i] ? 2 : 0, onTripHours: TRIPS[i] ? 5.5 : 0,
    waitingHours: TRIPS[i] ? 2 : 0, tripsCompleted: TRIPS[i], tripsInUberFile: TRIPS[i], driverCancels: 0,
    riderCancels: 0, offersAccepted: 0, roamOnlineHours: 0, ...over,
  };
}

function timeline(days: ReconTimelineDay[]): Extract<ReconWeekTimeline, { status: 'ok' }> {
  const sum = (k: keyof Omit<ReconTimelineDay, 'day'>) => days.reduce((n, d) => n + d[k], 0);
  return {
    status: 'ok',
    drivers: [{
      driverId: 'drv-kenny', name: 'drv-kenny', days,
      week: {
        onlineHours: sum('onlineHours'), enrouteHours: sum('enrouteHours'), onTripHours: sum('onTripHours'),
        waitingHours: sum('waitingHours'), tripsCompleted: sum('tripsCompleted'), tripsInUberFile: sum('tripsInUberFile'),
        driverCancels: sum('driverCancels'), riderCancels: sum('riderCancels'), offersAccepted: sum('offersAccepted'),
        roamOnlineHours: sum('roamOnlineHours'),
      },
    }],
  };
}

const names = new Map([['drv-kenny', 'Kenny Gregory Rattray']]);

describe('ReconActivityTimelineCard', () => {
  it('formats days and hours in plain words', () => {
    expect(timelineDayLabel('2026-10-27')).toBe('Tue 27 Oct');
    expect(timelineDayLabel('2026-11-01')).toBe('Sun 1 Nov');
    expect(hoursCell(9.5)).toBe('9h 30m');
    expect(hoursCell(0.25)).toBe('15m');
    expect(hoursCell(2)).toBe('2h');
    expect(hoursCell(0)).toBe('—');
  });

  it('shows one row per day, the driver name, and says trips match', () => {
    render(<ReconActivityTimelineCard timeline={timeline(DAYS.map((_, i) => day(i)))} roamNames={names} />);
    expect(screen.getByText('Kenny Gregory Rattray')).toBeTruthy();
    expect(screen.getByTestId('recon-activity-timeline-trips-match')).toBeTruthy();
    const tue = screen.getByTestId('recon-activity-timeline-day-2026-10-27');
    expect(within(tue).getByText('Tue 27 Oct')).toBeTruthy();
    expect(within(tue).getByText('12')).toBeTruthy();
    expect(screen.queryByTestId('recon-activity-timeline-trips-cell-differ')).toBeNull();
    expect(screen.queryByText('Roam online')).toBeNull();
  });

  it('marks a day whose trips differ from the Uber trip file', () => {
    const days = DAYS.map((_, i) => day(i));
    days[2] = day(2, { tripsInUberFile: 5 });
    render(<ReconActivityTimelineCard timeline={timeline(days)} roamNames={names} />);
    expect(screen.getByTestId('recon-activity-timeline-trips-differ')).toBeTruthy();
    expect(screen.getByTestId('recon-activity-timeline-trips-cell-differ').textContent).toBe('4 (file 5)');
  });

  it('with no Uber trip file it says so instead of marking every day', () => {
    render(
      <ReconActivityTimelineCard
        timeline={timeline(DAYS.map((_, i) => day(i, { tripsInUberFile: 0 })))}
        roamNames={names}
      />,
    );
    expect(screen.getByTestId('recon-activity-timeline-no-trip-file')).toBeTruthy();
    expect(screen.queryByTestId('recon-activity-timeline-trips-cell-differ')).toBeNull();
  });

  it('adds the Roam online column only when the driver was online on Roam', () => {
    const days = DAYS.map((_, i) => day(i));
    days[1] = day(1, { roamOnlineHours: 0.5 });
    render(<ReconActivityTimelineCard timeline={timeline(days)} roamNames={names} />);
    expect(screen.getByText('Roam online')).toBeTruthy();
    expect(within(screen.getByTestId('recon-activity-timeline-day-2026-10-27')).getByText('30m')).toBeTruthy();
  });
});
