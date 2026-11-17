import type { FileData } from './csvHelpers';
import {
  extractUberTimelineDriverIdentity,
  splitUberTimelineCsvWithDriverColumns as splitOwnerLayout,
  structuredRowsToImportText,
  type UberTimelineFileDriverIdentity,
} from './uberActivityTimelineParse';

export const TIMELINE_NO_ID_IN_FILE =
  'This file has no driver Uber ID. Add the Driver UUID, Driver first name and Driver last name columns at the front, then upload it again.';

function noDriverForIdentity(identity: UberTimelineFileDriverIdentity): string {
  return identity.uberUuid
    ? `No driver has Uber ID ${identity.uberUuid}${identity.displayName ? ` (${identity.displayName})` : ''}. Save it on the driver's Profile, then upload again.`
    : `No driver matches "${identity.displayName}". Add the Driver UUID column to the file, then upload again.`;
}

export type TimelineRosterDriver = {
  id: string;
  name: string;
  uberDriverId?: string;
};

export type TimelineWeekImportLine = {
  fileName: string;
  message: string;
  ok: boolean;
};

export type TimelineImportApi = (
  driverId: string,
  body: {
    text: string;
    timeZone: string;
    assumeChronological: boolean;
    uberDriverUuid?: string;
    fileName?: string;
  },
) => Promise<{ summary: { days: number; eventCount?: number }; inserted: number }>;

function resolveDriverFromIdentity(
  identity: UberTimelineFileDriverIdentity,
  roster: TimelineRosterDriver[],
): TimelineRosterDriver | null {
  const uuid = (identity.uberUuid || '').toLowerCase();
  if (uuid) {
    const byUuid = roster.find((d) => String(d.uberDriverId || '').trim().toLowerCase() === uuid);
    if (byUuid) return byUuid;
  }
  const name = (identity.displayName || '').trim().toLowerCase();
  if (name) {
    const byName = roster.filter((d) => String(d.name || '').trim().toLowerCase() === name);
    if (byName.length === 1) return byName[0];
  }
  return null;
}

export type TimelineFileInput = FileData & { rawText?: string };

type SplitTimeline = {
  headers: string[];
  rows: Record<string, string>[];
  pasteText: string;
  /** Date / Time sheets are oldest-first; Uber's own copy is newest-first. */
  chronological: boolean;
};

/**
 * Date | Time | Activity / Event | Duration / Status layout (with Driver UUID / name on the
 * first row) → the text the import route reads. Null when the headers are not this layout.
 */
function splitDateTimeTimelineCsv(text: string): SplitTimeline | null {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const unquote = (c: string) => c.trim().replace(/^"(.*)"$/, '$1').trim();
  const headers = lines[0].split(',').map(unquote);
  const find = (re: RegExp) => headers.find((h) => re.test(h.trim()));
  const dateKey = find(/^(date|day)$/i);
  const timeKey = find(/^time$/i);
  const eventKey = find(/activity|event/i);
  const durKey = find(/duration/i);
  if (!dateKey || !timeKey || !eventKey) return null;
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(',').map(unquote);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
  const pasteText = structuredRowsToImportText(
    rows.map((r) => ({
      date: r[dateKey] || '',
      time: r[timeKey] || '',
      event: r[eventKey] || '',
      duration: durKey ? r[durKey] || '' : '',
    })),
  );
  return { headers, rows, pasteText, chronological: true };
}

/** Import each uber_activity_timeline file; failures do not throw. */
export async function importUberTimelinesForWeek(
  files: TimelineFileInput[],
  roster: TimelineRosterDriver[],
  timeZone: string,
  importFn: TimelineImportApi,
): Promise<TimelineWeekImportLine[]> {
  const lines: TimelineWeekImportLine[] = [];
  const timelines = files.filter((f) => f.type === 'uber_activity_timeline');

  for (const file of timelines) {
    const raw = file.rawText?.trim();
    if (!raw) {
      lines.push({
        fileName: file.name,
        ok: false,
        message: `${file.name}: could not read timeline text`,
      });
      continue;
    }

    // Owner layout (Uber copy + ID columns) first, then the Date / Time layout with a Driver UUID column.
    const owner = splitOwnerLayout(raw);
    const split: SplitTimeline | null = owner
      ? { ...owner, chronological: false }
      : splitDateTimeTimelineCsv(raw);
    if (!split) {
      lines.push({
        fileName: file.name,
        ok: false,
        message: `${file.name}: ${TIMELINE_NO_ID_IN_FILE}`,
      });
      continue;
    }

    const identity = extractUberTimelineDriverIdentity(split.headers, split.rows);
    if (!identity.uberUuid && !identity.displayName) {
      lines.push({ fileName: file.name, ok: false, message: `${file.name}: ${TIMELINE_NO_ID_IN_FILE}` });
      continue;
    }

    const driver = resolveDriverFromIdentity(identity, roster);
    if (!driver) {
      lines.push({
        fileName: file.name,
        ok: false,
        message: `${file.name}: ${noDriverForIdentity(identity)}`,
      });
      continue;
    }

    try {
      const res = await importFn(driver.id, {
        text: split.pasteText,
        timeZone,
        assumeChronological: split.chronological,
        uberDriverUuid: identity.uberUuid || undefined,
        fileName: file.name,
      });
      const days = res.summary?.days ?? 0;
      lines.push({
        fileName: file.name,
        ok: true,
        message: `Imported for ${driver.name} (${days} days)`,
      });
    } catch (e) {
      lines.push({
        fileName: file.name,
        ok: false,
        message: `${file.name}: ${e instanceof Error ? e.message : 'Import failed'}`,
      });
    }
  }

  return lines;
}