/**
 * Self-serve JAA fuel statement parse + persist (shared by Data Center and recon wizard).
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  DEFAULT_FIELDS,
  detectFileType,
  mergeAndProcessData,
  type FileData,
  type ParsedRow,
} from './csvHelpers';
import {
  isJaaStatementDetails,
  jaaFuelLinesToParsedRows,
  parseJaaStatementDetailsMatrix,
} from './jaaStatementDetailsParser';
import { fetchFleetTimezone } from '../services/api';
import { api } from '../services/api';
import { fuelService } from '../services/fuelService';
import { collectJaaStatementReceiptNumbers } from './jaaFuelStatementMatcher';
import { trailingDaysWindow, FUEL_ALERTS_TRAILING_DAYS } from './fuelWeekPeriod';
import type { FuelCard, FuelEntry, JaaProgram } from '../types/fuel';
import { supabase } from './supabase/client';
import { registerFuelCardWithRecon, type FuelReconSourceId } from './registerFuelCardWithRecon';

export function selfServeCompanyCodesFromPrograms(programs: JaaProgram[]): Set<string> {
  return new Set(
    programs
      .filter((p) => p.mode === 'self_serve')
      .map((p) => String(p.companyCode || '').replace(/\D/g, ''))
      .filter(Boolean),
  );
}

export async function parseFuelStatementFile(file: File): Promise<FileData> {
  const lower = file.name.toLowerCase();
  const isExcel = lower.endsWith('.xls') || lower.endsWith('.xlsx');

  if (isExcel) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

    if (isJaaStatementDetails(sheetName, matrix) || /statementdetails/i.test(file.name)) {
      const jaa = parseJaaStatementDetailsMatrix(matrix);
      const rows = jaaFuelLinesToParsedRows(jaa.fuelLines) as ParsedRow[];
      const headers = rows.length > 0 ? Object.keys(rows[0]) : ['Date', 'Liters', 'Amount', 'Vehicle Plate'];
      return {
        id: crypto.randomUUID(),
        name: file.name,
        rows,
        headers,
        type: 'fuel_statement',
      };
    }

    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as ParsedRow[];
    const headers = json.length > 0 ? Object.keys(json[0]) : [];
    const type = detectFileType(headers, file.name);
    return {
      id: crypto.randomUUID(),
      name: file.name,
      rows: json,
      headers,
      type,
    };
  }

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.meta.fields) {
          reject(new Error('Could not read CSV headers'));
          return;
        }
        const type = detectFileType(results.meta.fields, file.name);
        resolve({
          id: crypto.randomUUID(),
          name: file.name,
          rows: results.data as ParsedRow[],
          headers: results.meta.fields,
          type,
        });
      },
      error: (err) => reject(err),
    });
  });
}

export async function buildFuelEntriesFromFiles(
  files: FileData[],
  fuelCards: FuelCard[],
  jaaImportOptions?: { allowedCompanyCodes: Set<string>; requireCardMatch: true },
): Promise<FuelEntry[]> {
  const fleetTimezone = await fetchFleetTimezone();
  const merged = mergeAndProcessData(
    files.filter((f) => f.type === 'fuel_statement'),
    DEFAULT_FIELDS,
    undefined,
    fuelCards,
    fleetTimezone,
    jaaImportOptions,
  );
  return merged.fuelEntries || [];
}

export function fuelDateBounds(entries: FuelEntry[]): { min: string | null; max: string | null } {
  const dates = entries
    .map((e) => String(e.date || '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (dates.length === 0) return { min: null, max: null };
  return { min: dates[0], max: dates[dates.length - 1] };
}

export async function prepareFuelEntriesForSave(entries: FuelEntry[]): Promise<FuelEntry[]> {
  let entriesToSave = [...entries];
  try {
    const existingAll = await fuelService.getFuelEntries({
      ...trailingDaysWindow(FUEL_ALERTS_TRAILING_DAYS),
      limit: 1500,
    });
    const existingReceipts = collectJaaStatementReceiptNumbers(existingAll);
    entriesToSave = entriesToSave.filter((entry) => {
      const r = String((entry.metadata as { jaaReceiptNumber?: string })?.jaaReceiptNumber || '').toUpperCase();
      if (!r) return true;
      if (existingReceipts.has(r)) return false;
      existingReceipts.add(r);
      return true;
    });

    entriesToSave = entriesToSave.map((entry) => {
      if ((entry.metadata as { importSource?: string })?.importSource === 'jaa_raw') {
        return { ...entry, driverId: undefined };
      }
      if (entry.vehicleId) return entry;
      return entry;
    });

    const vehicles = await api.getVehicles().catch(() => []);
    const normalizePlate = (p: string) => p.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    entriesToSave = entriesToSave.map((entry) => {
      if ((entry.metadata as { importSource?: string })?.importSource === 'jaa_raw') return entry;
      if (entry.vehicleId) return entry;
      const plate = String((entry.metadata as { jaaVehiclePlate?: string })?.jaaVehiclePlate || '').trim();
      if (!plate) return entry;
      const match = (vehicles as Array<{ id: string; plateNumber?: string; licensePlate?: string }>).find((v) => {
        const vp = normalizePlate(String(v.plateNumber || v.licensePlate || ''));
        return vp && (vp === normalizePlate(plate) || vp.endsWith(normalizePlate(plate)) || normalizePlate(plate).endsWith(vp));
      });
      if (!match) return entry;
      return { ...entry, vehicleId: match.id };
    });
  } catch {
    /* best-effort normalize */
  }
  return entriesToSave;
}

export async function commitFuelStatementImport(opts: {
  entries: FuelEntry[];
  fileName: string;
  sourceId: FuelReconSourceId;
  reconImportId?: string;
  weekKey?: string;
  organizationId?: string | null;
}): Promise<{ batchId: string; savedCount: number }> {
  const prepared = await prepareFuelEntriesForSave(opts.entries);
  if (prepared.length === 0) {
    throw new Error('No new fuel rows to import (duplicates or empty file).');
  }

  const batchId = crypto.randomUUID();
  const bounds = fuelDateBounds(prepared);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uploadedBy = session?.user?.email?.trim() || session?.user?.id || undefined;

  await api.createBatch({
    id: batchId,
    fileName: opts.fileName,
    uploadDate: new Date().toISOString(),
    status: 'processing',
    type: opts.sourceId,
    sourceId: opts.sourceId,
    recordCount: prepared.length,
    processedBy: uploadedBy || 'Admin',
    dataPeriodStart: bounds.min,
    dataPeriodEnd: bounds.max,
    periodStart: bounds.min,
    periodEnd: bounds.max,
    uploadedBy,
  });

  const withBatch = prepared.map((e) => ({ ...e, batchId }));
  await Promise.all(withBatch.map((entry) => fuelService.createFuelEntry(entry)));

  await api.patchImportBatch(batchId, {
    status: 'completed',
    recordCount: withBatch.length,
    rowsCommitted: withBatch.length,
  });

  const importId = opts.reconImportId || crypto.randomUUID();
  await registerFuelCardWithRecon({
    importId,
    batchId,
    sourceId: opts.sourceId,
    organizationId: opts.organizationId,
    dataPeriodStart: bounds.min,
    dataPeriodEnd: bounds.max,
    rowsCommitted: withBatch.length,
    weekKeys: opts.weekKey ? [opts.weekKey.slice(0, 10)] : undefined,
  });

  return { batchId, savedCount: withBatch.length };
}
