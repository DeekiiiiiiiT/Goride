import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import { useSuites } from '@/app/hooks/useFreight';
import { useDestinationWarehouses } from '@/app/hooks/useWarehouseCourierLinks';
import {
  DestinationFreightForwarderField,
  resolveIntendedFacilityId,
} from '@/app/freight/os/DestinationFreightForwarderField';
import {
  parsePreAlertCsv,
  PRE_ALERT_CSV_TEMPLATE,
  type PreAlertCsvRow,
} from '@/app/freight/preAlertCsvImport';

type SuiteLike = { id?: unknown; suite_code?: unknown };

function groupRows(rows: PreAlertCsvRow[]) {
  const map = new Map<string, PreAlertCsvRow[]>();
  for (const row of rows) {
    const key = row.orderNumber
      ? `${row.suiteCode}::${row.orderNumber}`
      : `${row.suiteCode}::track:${row.tracking}`;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.values()];
}

/** Bulk pre-alert import: template → preview → create retail orders. */
export function PreAlertCsvImportPanel({
  onSuccess,
  onBack,
}: {
  onSuccess?: () => void;
  onBack?: () => void;
}) {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  const suites = useSuites();
  const destinationsQ = useDestinationWarehouses();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreAlertCsvRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [intendedFacilityId, setIntendedFacilityId] = useState('');
  const [resultMsg, setResultMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const warehouses = useMemo(
    () => destinationsQ.data?.warehouses ?? [],
    [destinationsQ.data?.warehouses],
  );

  useEffect(() => {
    if (!intendedFacilityId && warehouses.length === 1) {
      setIntendedFacilityId(String(warehouses[0].id));
    }
  }, [warehouses, intendedFacilityId]);

  const suiteByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of (suites.data?.suites ?? []) as SuiteLike[]) {
      const code = String(s.suite_code || '')
        .trim()
        .toUpperCase();
      if (code && s.id) map.set(code, String(s.id));
    }
    return map;
  }, [suites.data?.suites]);

  function downloadTemplate() {
    const blob = new Blob([PRE_ALERT_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roam-prealert-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File | null) {
    setResultMsg(null);
    setPreview([]);
    setParseErrors([]);
    setFileName(file?.name ?? null);
    if (!file) return;
    const text = await file.text();
    const parsed = parsePreAlertCsv(text);
    setParseErrors(parsed.errors);
    setPreview(parsed.rows);
    if (!parsed.rows.length && !parsed.errors.length) {
      setParseErrors(['No valid package rows found in this file.']);
    }
  }

  const importing = useMutation({
    mutationFn: async () => {
      if (!preview.length) throw new Error('No rows to import.');
      if (!intendedFacilityId) throw new Error('Pick a freight forwarder for this batch.');
      const facilityId = resolveIntendedFacilityId(intendedFacilityId);
      const groups = groupRows(preview);
      let created = 0;
      const missing: string[] = [];
      for (const group of groups) {
        const suiteId = suiteByCode.get(group[0].suiteCode);
        if (!suiteId) {
          missing.push(group[0].suiteCode);
          continue;
        }
        const retailer = group.find((r) => r.retailer)?.retailer ?? null;
        const orderNumber = group.find((r) => r.orderNumber)?.orderNumber ?? null;
        const lines = group.map((r, i) => {
          const minor =
            r.declaredValueUsd != null ? Math.round(r.declaredValueUsd * 100) : null;
          return {
            description: r.description || r.tracking,
            quantity: 1,
            unitValueUsdMinor: minor,
            lineTotalUsdMinor: minor,
            sortOrder: i,
          };
        });
        const orderTotal = lines.reduce((s, l) => s + (l.lineTotalUsdMinor ?? 0), 0);
        await freightService.createRetailOrder(
          {
            suiteId,
            retailer,
            externalOrderNumber: orderNumber,
            orderTotalUsdMinor: orderTotal > 0 ? orderTotal : null,
            intendedFacilityId: facilityId,
            lines,
            packages: group.map((r, i) => ({
              courierTrackingNumber: r.tracking,
              description: r.description,
              weightLbs: r.weightLbs,
              lengthIn: r.lengthIn,
              widthIn: r.widthIn,
              heightIn: r.heightIn,
              declaredValueUsdMinor:
                r.declaredValueUsd != null ? Math.round(r.declaredValueUsd * 100) : null,
              intendedFacilityId: facilityId,
              lineIndexes: [i],
            })),
          },
          organizationId,
        );
        created += group.length;
      }
      if (missing.length) {
        throw new Error(
          `Created ${created} package(s). Unknown suite(s): ${[...new Set(missing)].join(', ')}`,
        );
      }
      return created;
    },
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['freight', 'pre-alerts'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'pipeline-command'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'pipeline-dashboard'] });
      setPreview([]);
      setParseErrors([]);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = '';
      if (onSuccess) onSuccess();
      else setResultMsg({ tone: 'ok', text: `Imported ${created} package(s).` });
    },
    onError: (err) => {
      setResultMsg({ tone: 'err', text: (err as Error).message || 'Import failed.' });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Download the template, fill tracking and suite, then upload.
        </p>
        <button
          type="button"
          onClick={downloadTemplate}
          className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800"
        >
          Download template
        </button>
      </div>

      <DestinationFreightForwarderField
        value={intendedFacilityId}
        onChange={setIntendedFacilityId}
        warehouses={warehouses}
        required
      />

      <label
        className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-amber-400"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void onFile(f);
        }}
      >
        <span className="text-sm font-semibold text-slate-800">
          {fileName ? fileName : 'Tap or drop a CSV'}
        </span>
        <span className="mt-1 text-xs text-slate-500">.csv</span>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            void onFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
      </label>

      {parseErrors.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-700">
          {parseErrors.slice(0, 8).map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}

      {preview.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Suite</th>
                <th className="px-3 py-2">Tracking</th>
                <th className="px-3 py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 20).map((r) => (
                <tr key={`${r.line}-${r.tracking}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{r.suiteCode}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.tracking}</td>
                  <td className="px-3 py-2">
                    {r.declaredValueUsd != null ? `$${r.declaredValueUsd.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length > 20 ? (
            <p className="px-3 py-2 text-xs text-slate-500">Showing 20 of {preview.length} rows.</p>
          ) : null}
        </div>
      ) : null}

      {resultMsg ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            resultMsg.tone === 'ok'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {resultMsg.text}
        </p>
      ) : null}

      <div className="sticky bottom-0 flex flex-wrap gap-2 bg-white py-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          disabled={!preview.length || importing.isPending}
          onClick={() => importing.mutate()}
          className="min-h-11 flex-1 rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {importing.isPending ? 'Importing…' : `Import ${preview.length || ''} package(s)`}
        </button>
      </div>
    </div>
  );
}
