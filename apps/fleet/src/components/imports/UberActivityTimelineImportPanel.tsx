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
  looksLikeUberActivityTimeline,
  parseUberActivityTimelineFromTable,
  parseUberActivityTimelineMatrix,
  parseUberActivityTimelineText,
  pickUberActivityTimelineSheetName,
  structuredRowsToImportText,
  UBER_ACTIVITY_PREFERRED_SHEET,
  type UberTimelineFileDriverIdentity,
  type UberTimelineParseResult,
} from '../../utils/uberActivityTimelineParse';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';
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

export function UberActivityTimelineImportPanel() {
  const fleetTimezone = useFleetTimezone() || 'America/Jamaica';
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [driverId, setDriverId] = useState('');
  const [driverQuery, setDriverQuery] = useState('');
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
      if (!identity.uberUuid && !identity.displayName) {
        setDriverFromFile(false);
        setMatchError(null);
        return { driver: null, identity };
      }
      const matched = resolveDriverFromIdentity(identity, roster);
      if (matched) {
        setDriverId(matched.id);
        setDriverFromFile(true);
        setMatchError(null);
        setDriverQuery(matched.name);
        return { driver: matched, identity };
      }
      setDriverFromFile(false);
      setMatchError(
        identity.uberUuid
          ? `No fleet driver matches Uber UUID ${identity.uberUuid}. Pick the driver below.`
          : `Found “${identity.displayName}” in the file but couldn’t match a fleet driver. Pick the driver below.`,
      );
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

  const filteredDrivers = useMemo(() => {
    const q = driverQuery.trim().toLowerCase();
    if (!q) return drivers.slice(0, 80);
    return drivers
      .filter((d) => {
        const name = String(d.name || '').toLowerCase();
        const uber = String(d.uberDriverId || '').toLowerCase();
        const id = String(d.id || '').toLowerCase();
        return name.includes(q) || uber.includes(q) || id.includes(q);
      })
      .slice(0, 80);
  }, [drivers, driverQuery]);

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === driverId) || null,
    [drivers, driverId],
  );

  const runParse = useCallback(
    (text: string, chronological = assumeChronological) => {
      if (!text.trim()) {
        setParseResult(null);
        return;
      }
      if (!looksLikeUberActivityTimeline(text) && !text.includes('Online') && !text.includes('Offline')) {
        toast.warning('This does not look like an Uber app activity timeline. Check the paste.');
      }
      const result = parseUberActivityTimelineText(text, {
        timeZone: fleetTimezone,
        driverId: driverId || 'preview',
        assumeChronological: chronological,
      });
      setParseResult(result);
    },
    [assumeChronological, driverId, fleetTimezone],
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
      setDriverQuery(matched.name);
      toast.success(`Matched driver ${matched.name} from CSV Uber UUID`);
    } else if (fileIdentity.uberUuid) {
      setMatchError(
        `No fleet driver matches Uber UUID ${fileIdentity.uberUuid}. Pick the driver below.`,
      );
    }
  }, [driverId, drivers, driversLoading, fileIdentity, resolveDriverFromIdentity]);

  const onPasteBlur = () => {
    setAssumeChronological(false);
    setDriverFromFile(false);
    setFileIdentity(null);
    setMatchError(null);
    runParse(pasteText, false);
  };

  const onUploadFile = async (file: File | null) => {
    if (!file) return;
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
          const resolvedId = driver?.id || driverId || 'preview';
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
            toast.success(`Matched driver ${driver.name} from CSV Uber UUID`);
          }
          return;
        }
        setDriverFromFile(false);
        setFileIdentity(null);
        setMatchError(null);
        setAssumeChronological(false);
        setPasteText(text);
        runParse(text, false);
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
          const result = parseUberActivityTimelineMatrix(matrix, {
            timeZone: fleetTimezone,
            driverId: driverId || 'preview',
            assumeChronological: true,
          });
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
        const resolvedId = driver?.id || driverId || 'preview';
        const result = parseUberActivityTimelineFromTable(headers, stringRows, {
          timeZone: fleetTimezone,
          driverId: resolvedId,
          assumeChronological: true,
        });
        const flat = matrix
          .flat()
          .map((c) => String(c ?? '').trim())
          .filter(Boolean)
          .join('\n');
        setAssumeChronological(true);
        setPasteText(flat || JSON.stringify(json));
        setParseResult(result);
        if (driver) toast.success(`Matched driver ${driver.name} from file`);
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
      toast.error('Select a driver first');
      return;
    }
    if (!pasteText.trim()) {
      toast.error('Paste or upload a timeline first');
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
              Upload an <strong>Uber Activity Timeline</strong> CSV/Excel (Date, Time, Activity,
              Duration). If Driver UUID is in the file, the driver is matched automatically — only
              pick manually when it is missing. Paste still works for the raw Uber app log.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="uber-activity-driver">Driver</Label>
          {driverFromFile && selectedDriver ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
              <p className="font-medium">{selectedDriver.name}</p>
              {selectedDriver.uberDriverId && (
                <p className="text-xs font-mono text-emerald-800 mt-0.5">
                  Uber UUID: {selectedDriver.uberDriverId}
                </p>
              )}
              <p className="text-xs text-emerald-700 mt-1">Matched from file — no need to pick manually.</p>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  setDriverFromFile(false);
                  setMatchError(null);
                }}
              >
                Change driver
              </Button>
            </div>
          ) : (
            <>
              {matchError && (
                <p className="text-xs text-amber-700" role="status">
                  {matchError}
                </p>
              )}
              {fileIdentity?.uberUuid && !driverId && (
                <p className="text-xs text-slate-600">
                  File UUID: <span className="font-mono">{fileIdentity.uberUuid}</span>
                  {fileIdentity.displayName ? ` · ${fileIdentity.displayName}` : ''}
                </p>
              )}
              <Input
                id="uber-activity-driver-search"
                placeholder="Search name or Uber UUID…"
                value={driverQuery}
                onChange={(e) => setDriverQuery(e.target.value)}
                disabled={driversLoading}
              />
              <Select
                value={driverId || undefined}
                onValueChange={(id) => {
                  setDriverId(id);
                  setDriverFromFile(false);
                }}
                disabled={driversLoading}
              >
                <SelectTrigger aria-label="Select driver for activity import">
                  <SelectValue placeholder={driversLoading ? 'Loading drivers…' : 'Select driver'} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {filteredDrivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.uberDriverId ? ` · ${d.uberDriverId.slice(0, 8)}…` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDriver?.uberDriverId && (
                <p className="text-xs text-slate-600">
                  Uber UUID: <span className="font-mono">{selectedDriver.uberDriverId}</span>
                </p>
              )}
            </>
          )}
        </div>

        <Tabs defaultValue="paste">
          <TabsList>
            <TabsTrigger value="paste">Paste</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>
          <TabsContent value="paste" className="space-y-2">
            <Textarea
              aria-label="Uber activity timeline paste"
              placeholder={'October 18 2026\n\nOffline\n10:57 AM\n42m\n\nOnline\n10:15 AM\n37m\n…'}
              className="min-h-[180px] font-mono text-xs bg-white"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              onBlur={onPasteBlur}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => runParse(pasteText)}>
              Preview
            </Button>
          </TabsContent>
          <TabsContent value="upload" className="space-y-2">
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 bg-white cursor-pointer hover:bg-slate-50">
              <Upload className="h-6 w-6 text-slate-400" />
              <span className="text-sm text-slate-600">.txt / .csv / .xlsx timeline</span>
              <input
                type="file"
                accept=".txt,.csv,.xls,.xlsx"
                className="hidden"
                onChange={(e) => onUploadFile(e.target.files?.[0] || null)}
              />
            </label>
          </TabsContent>
        </Tabs>

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
