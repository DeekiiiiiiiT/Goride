/**
 * Step 6 "Activity vs trips" — per-day hours from the Uber app activity timeline
 * (docs/week-recon-activity-timeline-audit.md UI3). Read only; never stops Close.
 */
import React from 'react';
import type { ReconWeekTimeline, ReconTimelineDay } from '../../../services/reconApi';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-27" → "Tue 27 Oct" (a calendar date, no time zone involved). */
export function timelineDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAY_NAMES[dow]} ${d} ${MONTHS[m - 1]}`;
}

export function hoursCell(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '—';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins === 60) return `${whole + 1}h`;
  if (whole === 0) return `${mins}m`;
  return mins ? `${whole}h ${String(mins).padStart(2, '0')}m` : `${whole}h`;
}

function worked(d: ReconTimelineDay): boolean {
  return d.onlineHours > 0 || d.tripsCompleted > 0 || d.tripsInUberFile > 0 || d.roamOnlineHours > 0;
}

export function ReconActivityTimelineCard({
  timeline,
  roamNames,
}: {
  timeline: Extract<ReconWeekTimeline, { status: 'ok' }>;
  roamNames: Map<string, string>;
}) {
  return (
    <div className="space-y-4" data-testid="recon-activity-timeline">
      {timeline.drivers.map((drv) => {
        const fileUploaded = drv.week.tripsInUberFile > 0;
        const tripsDiffer = fileUploaded && drv.days.some((d) => d.tripsCompleted !== d.tripsInUberFile);
        const showRoam = drv.week.roamOnlineHours > 0;
        return (
          <div key={drv.driverId} className="rounded-xl bg-[#f8f9ff] p-4" data-testid="recon-activity-timeline-driver">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-[#0b1c30]">{roamNames.get(drv.driverId) || drv.name}</p>
              <p className="text-sm tabular-nums text-[#47464c]">
                {hoursCell(drv.week.onlineHours)} online · {hoursCell(drv.week.onTripHours)} on trips ·{' '}
                {drv.week.tripsCompleted} trips · {drv.week.driverCancels} driver cancels
              </p>
            </div>
            {!fileUploaded ? (
              <p className="mt-2 text-xs text-[#47464c]" data-testid="recon-activity-timeline-no-trip-file">
                Uber trip file not uploaded for this week, so trips can&apos;t be compared yet.
              </p>
            ) : tripsDiffer ? (
              <p className="mt-2 text-xs font-semibold text-[#7c5800]" data-testid="recon-activity-timeline-trips-differ">
                Trip counts differ from Uber&apos;s trip file on the days marked below.
              </p>
            ) : (
              <p className="mt-2 text-xs text-[#047857]" data-testid="recon-activity-timeline-trips-match">
                Trips match Uber&apos;s trip file every day.
              </p>
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-[12px] text-[#47464c]">
                    <th className="py-1.5 pr-3 font-medium">Day</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Online</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Waiting</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Driving to pickup</th>
                    <th className="py-1.5 pr-3 text-right font-medium">On trip</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Trips</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Driver cancels</th>
                    {showRoam ? <th className="py-1.5 text-right font-medium">Roam online</th> : null}
                  </tr>
                </thead>
                <tbody className="tabular-nums text-[#0b1c30]">
                  {drv.days.map((d) => {
                    const differ = fileUploaded && d.tripsCompleted !== d.tripsInUberFile;
                    return (
                      <tr
                        key={d.day}
                        className={worked(d) ? 'border-t border-[#e5eeff]' : 'border-t border-[#e5eeff] text-[#94a3b8]'}
                        data-testid={`recon-activity-timeline-day-${d.day}`}
                      >
                        <td className="py-1.5 pr-3">{timelineDayLabel(d.day)}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold">{hoursCell(d.onlineHours)}</td>
                        <td className="py-1.5 pr-3 text-right">{hoursCell(d.waitingHours)}</td>
                        <td className="py-1.5 pr-3 text-right">{hoursCell(d.enrouteHours)}</td>
                        <td className="py-1.5 pr-3 text-right">{hoursCell(d.onTripHours)}</td>
                        <td
                          className={differ ? 'py-1.5 pr-3 text-right font-semibold text-[#7c5800]' : 'py-1.5 pr-3 text-right'}
                          data-testid={differ ? 'recon-activity-timeline-trips-cell-differ' : undefined}
                        >
                          {fileUploaded && differ ? `${d.tripsCompleted} (file ${d.tripsInUberFile})` : d.tripsCompleted || '—'}
                        </td>
                        <td className="py-1.5 pr-3 text-right">{d.driverCancels || '—'}</td>
                        {showRoam ? <td className="py-1.5 text-right">{hoursCell(d.roamOnlineHours)}</td> : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
