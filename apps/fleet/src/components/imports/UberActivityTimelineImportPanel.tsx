/**
 * Optional Uber app activity timeline import — paste or upload, pick driver, commit
 * into fleet.driver_activity_events for the Activity tab.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Loader2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { useFleetTimezone } from '../../utils/timezoneDisplay';
import {
  canCommitUberActivityTimeline,
  extractUberTimelineDriverIdentity,
  looksLikeOfficialUberDriverActivityCsv,
  parseUberActivityTimelineFromTable,
  parseUberActivityTimelineMatrix,
  parseUberActivityTimelineText,
  pickUberActivityTimelineSheetName,
  splitUberTimelineCsvWithDriverColumns,
  structuredRowsToImportText,
  uberTimelinePasteFromDriverColumns,
  UBER_ACTIVITY_PREFERRED_SHEET,
  type UberTimelineFileDriverIdentity,
  type UberTimelineParseResult,
} from '../../utils/uberActivityTimelineParse';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { pathForDriverDetail } from '../../navigation/pageRegistry';

type DriverOption = {
  id: string;
  name: string;
  uberDriverId?: string;
  status?: string;
};

function formatHours(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0h';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const NO_ID_IN_FILE =
  'This file has no driver Uber ID. Add the Driver UUID, Driver first name and Driver last name columns at the front, then upload it again.';

function noDriverForIdentity(identity: UberTimelineFileDriverIdentity): string {
  return identity.uberUuid
    ? `No driver has Uber ID ${identity.uberUuid}${identity.displayName ? ` (${identity.displayName})` : ''}. Save it on the driver's Profile, then upload again.`
    : `No driver matches “${identity.displayName}”. Add the Driver UUID column to the file, then upload again.`;
}

export function UberActivityTimelineImportPanel() {
  const fleetTimezone = useFleetTimezone() || 'America/Jamaica';
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [driverId, setDriverId] = useState('');
  const [driverFromFile, setDriverFromFile] = useState(false);
  const [fileIdentity, setFileIdentity] = useState<UberTimelineFileDriverIdentity | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [assumeChronological, setAssumeChronological] = useState(false);
  const [parseResult, setParseResult] = useState<UberTimelineParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<{
    inserted: number;
    replaced: number;
    driverId: string;
    driverName: string;
  } | null>(null);

  const resolveDriverFromIdentity = useCallback(
    (identity: UberTimelineFileDriverIdentity, roster: DriverOption[]): DriverOption | null => {
      const uuid = (identity.uberUuid || '').toLowerCase();
      if (uuid) {
        const byUuid = roster.find(
          (d) => String(d.uberDriverId || '').trim().toLowerCase() === uuid,
        );
        if (byUuid) return byUuid;
      }
      const name = (identity.displayName || '').trim().toLowerCase();
      if (name) {
        const byName = roster.filter((d) => String(d.name || '').trim().toLowerCase() === name);
        if (byName.length === 1) return byName[0];
      }
      return null;
    },
    [],
  );

  const applyFileDriverMatch = useCallback(
    (
      headers: string[],
      rows: Record<string, string>[],
      roster: DriverOption[],
    ): { driver: DriverOption | null; identity: UberTimelineFileDriverIdentity } => {
      const identity = extractUberTimelineDriverIdentity(headers, rows);
      setFileIdentity(identity);
      setDriverId('');
      setDriverFromFile(false);
      if (!identity.uberUuid && !identity.displayName) {
        setMatchError(NO_ID_IN_FILE);
        return { driver: null, identity };
      }
      // Roster still loading: the effect below matches once it arrives.
      if (!roster.length) {
        setMatchError(null);
        return { driver: null, identity };
      }
      const matched = resolveDriverFromIdentity(identity, roster);
      if (matched) {
        setDriverId(matched.id);
        setDriverFromFile(true);
        setMatchError(null);
        return { driver: matched, identity };
      }
      setMatchError(noDriverForIdentity(identity));
      return { driver: null, identity };
    },
    [resolveDriverFromIdentity],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDriversLoading(true);
      try {
        const res = await api.getDriversRoster();
        const rows = (res?.data || []) as DriverOption[];
        if (!cancelled) setDrivers(rows);
      } catch {
        try {
          const fallback = await api.getDrivers();
          const rows = (Array.isArray(fallback) ? fallback : fallback?.data || []) as DriverOption[];
          if (!cancelled) setDrivers(rows);
        } catch (e) {
          console.error(e);
          toast.error('Could not load drivers for activity import');
        }
      } finally {
        if (!cancelled) setDriversLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === driverId) || null,
    [drivers, driverId],
  );

  // Re-parse when driver changes so source_event_ids use the real driver id
  useEffect(() => {
    if (pasteText.trim() && driverId) {
      setParseResult(
        parseUberActivityTimelineText(pasteText, {
          timeZone: fleetTimezone,
          driverId,
          assumeChronological,
        }),
      );
    }
  }, [assumeChronological, driverId, fleetTimezone, pasteText]);

  // If CSV was read before roster finished loading, match once drivers arrive
  useEffect(() => {
    if (driversLoading || !drivers.length || !fileIdentity || driverId) return;
    if (!fileIdentity.uberUuid && !fileIdentity.displayName) return;
    const matched = resolveDriverFromIdentity(fileIdentity, drivers);
    if (matched) {
      setDriverId(matched.id);
      setDriverFromFile(true);
      setMatchError(null);
      toast.success(`Matched driver ${matched.name} from the file's Uber ID`);
    } else {
      setMatchError(noDriverForIdentity(fileIdentity));
    }
  }, [driverId, drivers, driversLoading, fileIdentity, resolveDriverFromIdentity]);

  /** Every new file starts clean: no driver until the file names one. */
  const resetForNewFile = () => {
    setDriverId('');
    setDriverFromFile(false);
    setFileIdentity(null);
    setMatchError(null);
    setParseResult(null);
    setPasteText('');
    setLastImport(null);
  };

  const onUploadFile = async (file: File | null) => {
    if (!file) return;
    resetForNewFile();
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.txt') || lower.endsWith('.csv')) {
        const text = await file.text();
        // CSV may be official weekly report
        const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
        const headers = firstLine.split(',').map((h) => h.replace(/^"|"$/g, '').trim());
        if (looksLikeOfficialUberDriverActivityCsv(headers)) {
          toast.error(
            'That file is Uber’s weekly Driver Activity report (hours totals). Use Overview Time Metrics import for it — this box needs the app timeline paste/Excel.',
          );
          return;
        }
        // Uber app paste with Driver UUID / name columns added in front
        const withDriver = splitUberTimelineCsvWithDriverColumns(text);
        if (withDriver) {
          const { driver } = applyFileDriverMatch(withDriver.headers, withDriver.rows, drivers);
          const result = parseUberActivityTimelineText(withDriver.pasteText, {
            timeZone: fleetTimezone,
            driverId: driver?.id || 'preview',
            assumeChronological: false,
          });
          setAssumeChronological(false);
          setPasteText(withDriver.pasteText);
          setParseResult(result);
          if (driver) toast.success(`Matched driver ${driver.name} from the file's Uber ID`);
          if (!canCommitUberActivityTimeline(result)) {
            toast.warning('Could not find timeline events in that file.');
          }
          return;
        }
        if (headers.some((h) => /date|event|time/i.test(h)) && text.includes(',')) {
          // Structured timeline CSV (Date | Time | Activity | Duration [+ Driver UUID])
          const lines = text.split(/\r?\n/).filter((l) => l.trim());
          const hdrs = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());
          const rows = lines.slice(1).map((line) => {
            const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
            const row: Record<string, string> = {};
            hdrs.forEach((h, i) => {
              row[h] = cols[i] || '';
            });
            return row;
          });
          const { driver } = applyFileDriverMatch(hdrs, rows, drivers);
          const resolvedId = driver?.id || 'preview';
          const result = parseUberActivityTimelineFromTable(hdrs, rows, {
            timeZone: fleetTimezone,
            driverId: resolvedId,
            assumeChronological: true,
          });
          // Rebuild paste text for server (raw CSV is not the paste format)
          const dateKey = hdrs.find((h) => /^date$/i.test(h)) || 'Date';
          const timeKey = hdrs.find((h) => /^time$/i.test(h)) || 'Time';
          const eventKey =
            hdrs.find((h) => /activity|event/i.test(h)) || 'Activity / Event';
          const durKey =
            hdrs.find((h) => /duration/i.test(h)) || 'Duration / Status';
          const importText = structuredRowsToImportText(
            rows.map((r) => ({
              date: r[dateKey] || '',
              time: r[timeKey] || '',
              event: r[eventKey] || '',
              duration: r[durKey] || '',
            })),
          );
          setAssumeChronological(true);
          setPasteText(importText);
          setParseResult(result);
          if (driver) {
            toast.success(`Matched driver ${driver.name} from the file's Uber ID`);
          }
          return;
        }
        // Plain Uber paste with no driver columns: the file can't say whose it is.
        setMatchError(NO_ID_IN_FILE);
        return;
      }

      if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        const preferred =
          pickUberActivityTimelineSheetName(wb.SheetNames) || wb.SheetNames[0];
        if (!preferred) {
          toast.error('No sheets found in workbook');
          return;
        }
        if (preferred !== wb.SheetNames[0] || /chronological/i.test(preferred)) {
          toast.success(`Using sheet “${preferred}”`);
        }
        const sheet = wb.Sheets[preferred];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
        // Prefer Chronological matrix parse (Date | Time | Activity | Duration)
        if (/chronological/i.test(preferred) || preferred === UBER_ACTIVITY_PREFERRED_SHEET) {
          // Driver comes from the sheet's own Driver UUID / name columns.
          const hdrRowIdx = matrix.findIndex((r) =>
            (r || []).some((c) => /driver uuid|first name|^date$/i.test(String(c ?? '').trim())),
          );
          let matched: DriverOption | null = null;
          if (hdrRowIdx >= 0) {
            const hdrs = (matrix[hdrRowIdx] || []).map((c) => String(c ?? '').trim());
            const rows = matrix.slice(hdrRowIdx + 1).map((r) => {
              const row: Record<string, string> = {};
              hdrs.forEach((h, i) => {
                if (h) row[h] = String((r || [])[i] ?? '');
              });
              return row;
            });
            matched = applyFileDriverMatch(hdrs, rows, drivers).driver;
          } else {
            setMatchError(NO_ID_IN_FILE);
          }
          const result = parseUberActivityTimelineMatrix(matrix, {
            timeZone: fleetTimezone,
            driverId: matched?.id || 'preview',
            assumeChronological: true,
          });
          if (matched) toast.success(`Matched driver ${matched.name} from the file's Uber ID`);
          // Rebuild import text from structured rows for server
          const headerIdx = matrix.findIndex((r) =>
            String((r || [])[0] ?? '').toLowerCase() === 'date',
          );
          const structured = (matrix.slice(headerIdx >= 0 ? headerIdx + 1 : 3) as unknown[][]).map(
            (r) => ({
              date: String(r?.[0] ?? ''),
              time: String(r?.[1] ?? ''),
              event: String(r?.[2] ?? ''),
              duration: String(r?.[3] ?? ''),
            }),
          );
          const importText = structuredRowsToImportText(structured);
          setAssumeChronological(true);
          setPasteText(importText);
          setParseResult(result);
          if (!canCommitUberActivityTimeline(result)) {
            toast.warning('Could not find timeline events in that sheet.');
          }
          return;
        }

        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, string>[];
        const headers = json.length > 0 ? Object.keys(json[0]) : [];
        if (looksLikeOfficialUberDriverActivityCsv(headers)) {
          toast.error(
            'That Excel is Uber’s weekly Driver Activity report. Drop it in the main Uber upload for Overview Time Metrics — not here.',
          );
          return;
        }
        const stringRows = json.map((r) => {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) out[k] = String(v ?? '');
          return out;
        });
        const { driver } = applyFileDriverMatch(headers, stringRows, drivers);
        const resolvedId = driver?.id || 'preview';
        const result = parseUberActivityTimelineFromTable(headers, stringRows, {
          timeZone: fleetTimezone,
          driverId: resolvedId,
          assumeChronological: true,
        });
        const driverPaste = uberTimelinePasteFromDriverColumns(headers, stringRows);
        const flat = matrix
          .flat()
          .map((c) => String(c ?? '').trim())
          .filter(Boolean)
          .join('\n');
        setAssumeChronological(driverPaste == null);
        setPasteText(driverPaste ?? (flat || JSON.stringify(json)));
        setParseResult(result);
        if (driver) toast.success(`Matched driver ${driver.name} from the file's Uber ID`);
        if (!canCommitUberActivityTimeline(result)) {
          toast.warning('Could not find timeline events in that file.');
        }
        return;
      }

      toast.error('Use .txt, .csv, or .xlsx');
    } catch (e) {
      console.error(e);
      toast.error('Failed to read activity file');
    }
  };

  const onImport = async () => {
    if (!driverId) {
      toast.error(matchError || NO_ID_IN_FILE);
      return;
    }
    if (!pasteText.trim()) {
      toast.error('Upload a timeline first');
      return;
    }
    const preview =
      parseResult ||
      parseUberActivityTimelineText(pasteText, {
        timeZone: fleetTimezone,
        driverId,
        assumeChronological,
      });
    if (!canCommitUberActivityTimeline(preview)) {
      toast.error('No valid events to import');
      return;
    }
    setImporting(true);
    try {
      const res = await api.importUberActivityTimeline(driverId, {
        text: pasteText,
        timeZone: fleetTimezone,
        assumeChronological,
        uberDriverUuid: fileIdentity?.uberUuid || undefined,
      });
      setLastImport({
        inserted: res.inserted,
        replaced: res.replaced,
        driverId,
        driverName: selectedDriver?.name || driverId,
      });
      toast.success(
        `Imported ${res.summary.eventCount} activity events for ${selectedDriver?.name || 'driver'} (${res.summary.days} days)`,
      );
    } catch (e: any) {
      toast.error(e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const preview = parseResult;

  return (
    <Card className="border-indigo-200 bg-indigo-50/40" data-testid="uber-activity-timeline-panel">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
            <Activity className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">Activity timeline (optional)</CardTitle>
            <CardDescription className="mt-1">
              Upload the <strong>Uber Activity Timeline</strong> with the driver&apos;s Driver UUID,
              first name and last name columns in front. The driver is found from their Uber ID —
              the same way every other Uber upload is matched.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2" data-testid="uber-activity-driver">
          <Label>Driver</Label>
          {driverFromFile && selectedDriver ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
              <p className="font-medium">{selectedDriver.name}</p>
              {selectedDriver.uberDriverId && (
                <p className="text-xs font-mono text-emerald-800 mt-0.5">
                  Uber UUID: {selectedDriver.uberDriverId}
                </p>
              )}
              <p className="text-xs text-emerald-700 mt-1">Found from the Uber ID in the file.</p>
            </div>
          ) : matchError ? (
            <p
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {matchError}
            </p>
          ) : fileIdentity && driversLoading ? (
            <p className="text-sm text-slate-600">Finding the driver…</p>
          ) : (
            <p className="text-sm text-slate-600">Upload a timeline — the driver is found from the file.</p>
          )}
        </div>

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 bg-white cursor-pointer hover:bg-slate-50">
          <Upload className="h-6 w-6 text-slate-400" />
          <span className="text-sm text-slate-600">Upload timeline (.csv or .xlsx)</span>
          <input
            type="file"
            accept=".txt,.csv,.xls,.xlsx"
            className="hidden"
            aria-label="Upload Uber activity timeline"
            onChange={(e) => {
              const picked = e.target.files?.[0] || null;
              e.target.value = '';
              void onUploadFile(picked);
            }}
          />
        </label>

        {preview && (
          <div className="rounded-lg border bg-white p-3 space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{preview.stats.days} day(s)</Badge>
              <Badge variant="outline">{preview.stats.eventCount} events</Badge>
              <Badge variant="outline">
                Online labels ~{formatHours(preview.stats.onlineDurationSecondsFromLabels)}
              </Badge>
              <Badge variant="outline">{preview.stats.offersAccepted} offers</Badge>
              <Badge variant="outline">{preview.stats.tripsCompleted} completed</Badge>
              <Badge variant="outline">
                {preview.stats.driverCancels + preview.stats.riderCancels} cancels
              </Badge>
            </div>
            {preview.dateRange && (
              <p className="text-xs text-slate-500">
                Range: {new Date(preview.dateRange.from).toLocaleString()} →{' '}
                {new Date(preview.dateRange.to).toLocaleString()}
              </p>
            )}
            {preview.warnings.length > 0 && (
              <p className="text-xs text-amber-700">
                {preview.warnings.length} warning(s): {preview.warnings.slice(0, 3).join(' · ')}
                {preview.warnings.length > 3 ? '…' : ''}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={onImport}
            disabled={
              importing ||
              !driverId ||
              !driverFromFile ||
              !pasteText.trim() ||
              (preview != null && !canCommitUberActivityTimeline(preview))
            }
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…
              </>
            ) : (
              'Import activity'
            )}
          </Button>
          {lastImport && (
            <Button
              type="button"
              variant="link"
              className="px-0"
              onClick={() => {
                window.location.assign(pathForDriverDetail(lastImport.driverId, 'activity'));
              }}
            >
              Open {lastImport.driverName} → Activity
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
