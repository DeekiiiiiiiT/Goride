import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { AlertCircle, AlertTriangle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { FuelEntry, FuelEntryCorrection } from '../../types/fuel';
import { FinancialTransaction } from '../../types/data';
import { Vehicle } from '../../types/vehicle';
import { api } from '../../services/api';
import { fuelService } from '../../services/fuelService';
import { useFuelCycles } from '../../hooks/useFuelCycles';
import { useFuelAnchors } from '../../hooks/useFuelAnchors';
import { useFuelLogQuery } from '../../hooks/useFuelLogQuery';
import { useFuelLogSummary, mergeServerTransactionKpis } from '../../hooks/useFuelLogSummary';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { downloadBlob, jsonToCsv } from '../../utils/csv-helper';
import { usePermissions } from '../../hooks/usePermissions';
import { isEntryInInclusiveYmdRange, toEntryYmd } from '../../utils/fuelWeekPeriod';
import { resolveFuelEntrySource } from '../../utils/fuelEntrySource';
import { isJaaStatementLedgerRow } from '../../utils/jaaFuelStatementMatcher';
import { resolveGasCardLedgerIntegrity } from '../../utils/fuelLedgerIntegrity';
import {
  buildCycleKpis,
  buildTransactionKpis,
  sumOdometerDeltasBetweenFills,
} from '../../utils/fuelLogKpiMetrics';
import { resolvePeriodDistance, buildTrustedPeriodTotals } from '../../utils/fuelPeriodTotals';
import { partitionCyclesForPeriod } from '../../utils/fuelCycleTrust';
import { useFleetTimezone, fleetTzDateKey } from '../../utils/timezoneDisplay';
import { Skeleton } from '../ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { usePlatformConfig } from '../auth/PlatformConfigContext';
import { FuelEntryDetailSheet } from './logs/FuelEntryDetailSheet';
import { FuelLogKpiRow, transactionKpisToTiles, cycleKpisToTiles } from './logs/FuelLogKpiRow';
import { FuelLogToolbar } from './logs/FuelLogToolbar';
import { FuelTransactionsTable, resolvePaymentLabel } from './logs/FuelTransactionsTable';
import { FuelCyclesPanel } from './logs/FuelCyclesPanel';
import { fuelEntrySortMs } from './logs/fuelLogDisplay';
import type { FuelExceptionAssignment } from './logs/FuelExceptionQueue';

const EXCEPTION_ASSIGNMENTS_KEY = 'fuel_exception_assignments';
const PAGE_SIZE = 50;

function loadExceptionAssignments(): Record<string, FuelExceptionAssignment> {
  try {
    const raw = localStorage.getItem(EXCEPTION_ASSIGNMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, FuelExceptionAssignment>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

interface FuelLogTableProps {
  entries: FuelEntry[];
  transactions: FinancialTransaction[];
  vehicles: Vehicle[];
  onEdit: (entry: FuelEntry) => void;
  onDelete: (id: string) => void;
  getVehicleName: (id?: string) => string;
  getDriverName: (id?: string) => string;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  dataTruncated?: boolean;
  transactionsTruncated?: boolean;
  isLoading?: boolean;
  loadError?: string | null;
  onRefresh?: () => void | Promise<void>;
}

export function FuelLogTable({
  entries,
  transactions,
  vehicles,
  onEdit,
  onDelete,
  getVehicleName,
  getDriverName,
  dateRange,
  onDateRangeChange,
  dataTruncated = false,
  transactionsTruncated = false,
  isLoading = false,
  loadError = null,
  onRefresh,
}: FuelLogTableProps) {
  const { can } = usePermissions();
  const fleetTz = useFleetTimezone();
  const { defaultCurrency } = usePlatformConfig();
  const { query, setQuery } = useFuelLogQuery();
  const [searchTerm, setSearchTerm] = useState(query.search || '');
  const [filterType, setFilterType] = useState<string>(query.type || 'all');
  const [filterVehicle, setFilterVehicle] = useState<string>(query.vehicleId || 'all');
  const [filterDriver, setFilterDriver] = useState<string>(query.driverId || 'all');
  const [filterAnchor, setFilterAnchor] = useState<string>(query.anchor || 'all');
  const [filterStatus, setFilterStatus] = useState<string>(query.status || 'all');
  const [filterSource, setFilterSource] = useState<string>(query.source || 'all');
  const [filterIntegrity, setFilterIntegrity] = useState<string>(query.integrity || 'all');
  const [filterCycleId, setFilterCycleId] = useState<string | null>(query.cycleId || null);
  const [activeView, setActiveView] = useState<'transactions' | 'cycles'>(query.view);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [confirmFleetRecalc, setConfirmFleetRecalc] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<FuelEntry | null>(null);
  const [corrections, setCorrections] = useState<FuelEntryCorrection[]>([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [correctionsError, setCorrectionsError] = useState<string | null>(null);
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null);
  const [focusExceptions, setFocusExceptions] = useState(false);
  const exceptionQueueRef = useRef<HTMLDivElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'date' | 'amount' | 'liters' | 'odometer'>(
    query.sortField || 'date',
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(query.sortDir || 'desc');
  const [page, setPage] = useState(0);
  const [exceptionAssignments, setExceptionAssignments] = useState<
    Record<string, FuelExceptionAssignment>
  >(loadExceptionAssignments);

  useEffect(() => {
    let timer: number | undefined;
    try {
      const raw = sessionStorage.getItem('fuel_logs_focus_entry');
      if (!raw) return;
      sessionStorage.removeItem('fuel_logs_focus_entry');
      if (raw.startsWith('{')) {
        const parsed = JSON.parse(raw) as { date?: string; vehicleId?: string };
        const match = entries.find((e) => {
          const dateOk =
            !parsed.date || String(e.date || '').startsWith(String(parsed.date).slice(0, 10));
          const vehOk = !parsed.vehicleId || e.vehicleId === parsed.vehicleId;
          return dateOk && vehOk;
        });
        if (match?.id) setFocusEntryId(match.id);
      } else {
        setFocusEntryId(raw);
      }
      timer = window.setTimeout(() => setFocusEntryId(null), 8000);
    } catch {
      /* ignore */
    }
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [entries]);

  useEffect(() => {
    if (!viewingEntry?.id) {
      setCorrections([]);
      setCorrectionsError(null);
      setCorrectionsLoading(false);
      return;
    }
    let cancelled = false;
    setCorrectionsLoading(true);
    setCorrectionsError(null);
    fuelService
      .getFuelEntryCorrections(viewingEntry.id)
      .then((rows) => {
        if (!cancelled) setCorrections(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setCorrections([]);
          setCorrectionsError(String(err?.message || err));
        }
      })
      .finally(() => {
        if (!cancelled) setCorrectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewingEntry?.id]);

  const uniqueVehicles = useMemo(() => {
    const ids = Array.from(new Set(entries.map((e) => e.vehicleId).filter(Boolean))) as string[];
    return ids
      .map((id) => ({ id, name: getVehicleName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, getVehicleName]);

  const uniqueDrivers = useMemo(() => {
    const ids = Array.from(new Set(entries.map((e) => e.driverId).filter(Boolean))) as string[];
    return ids
      .map((id) => ({ id, name: getDriverName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, getDriverName]);

  const resolveVehicleFilterId = (raw: string): string => {
    if (!raw || raw === 'all') return 'all';
    if (entries.some((e) => e.vehicleId === raw) || vehicles.some((v) => v.id === raw)) return raw;
    const byName = uniqueVehicles.find((v) => v.name.toLowerCase() === raw.toLowerCase());
    if (byName) return byName.id;
    const byPlate = vehicles.find((v) => {
      const plate = String(
        (v as { licensePlate?: string; plate?: string }).licensePlate ||
          (v as { plate?: string }).plate ||
          '',
      ).toLowerCase();
      return plate === raw.toLowerCase() || plate.replace(/\s+/g, '') === raw.toLowerCase();
    });
    if (byPlate) return byPlate.id;
    return raw;
  };

  useEffect(() => {
    setActiveView(query.view);
    setSearchTerm(query.search || '');
    setFilterVehicle(resolveVehicleFilterId(query.vehicleId || 'all'));
    setFilterIntegrity(query.integrity || 'all');
    setFilterDriver(query.driverId || 'all');
    setFilterSource(query.source || 'all');
    setFilterType(query.type || 'all');
    setFilterAnchor(query.anchor || 'all');
    setFilterStatus(query.status || 'all');
    setFilterCycleId(query.cycleId || null);
    if (query.sortField) setSortField(query.sortField);
    if (query.sortDir) setSortDir(query.sortDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, entries, vehicles, uniqueVehicles]);

  const periodStart = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined;
  const periodEnd = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined;

  const allCycles = useFuelCycles(entries, vehicles, {
    weekStart: periodStart,
    weekEnd: periodEnd,
    enabled: activeView === 'cycles',
  });

  const { validAnchorIds, getLinkedTransaction } = useFuelAnchors(entries, transactions);

  const activeFilterCount = [
    filterType !== 'all',
    filterVehicle !== 'all',
    filterDriver !== 'all',
    filterAnchor !== 'all',
    filterStatus !== 'all',
    filterSource !== 'all',
    filterIntegrity !== 'all',
    !!filterCycleId,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilterType('all');
    setFilterVehicle('all');
    setFilterDriver('all');
    setFilterAnchor('all');
    setFilterStatus('all');
    setFilterSource('all');
    setFilterIntegrity('all');
    setFilterCycleId(null);
    setQuery({
      type: undefined,
      vehicleId: undefined,
      driverId: undefined,
      anchor: undefined,
      status: undefined,
      source: undefined,
      integrity: undefined,
      cycleId: undefined,
    });
    setPage(0);
  };

  const toggleSort = (field: 'date' | 'amount' | 'liters' | 'odometer') => {
    const nextDir = sortField === field ? (sortDir === 'desc' ? 'asc' : 'desc') : 'desc';
    setSortField(field);
    setSortDir(nextDir);
    setQuery({ sortField: field, sortDir: nextDir });
  };

  const isManualEntry = (entry: FuelEntry) => {
    if (validAnchorIds.has(entry.id)) return false;
    const tx = getLinkedTransaction(entry);
    const isManualType = entry.type === 'Manual_Entry' || entry.type === 'Fuel_Manual_Entry';
    const hasManualPortalType =
      entry.metadata?.portal_type === 'Manual_Entry' || tx?.metadata?.portal_type === 'Manual_Entry';
    const hasManualSource =
      entry.metadata?.source?.toLowerCase().includes('manual') ||
      entry.metadata?.source?.toLowerCase().includes('fuel log') ||
      (entry as FuelEntry & { source?: string }).source?.toLowerCase().includes('manual') ||
      (entry as FuelEntry & { source?: string }).source?.toLowerCase().includes('fuel log') ||
      tx?.metadata?.source?.toLowerCase().includes('manual') ||
      tx?.metadata?.source?.toLowerCase().includes('fuel log');
    return isManualType || hasManualPortalType || !!hasManualSource;
  };

  const txBySourceId = useMemo(() => {
    const map = new Map<string, FinancialTransaction[]>();
    for (const t of transactions) {
      const sid = t.metadata?.sourceId || t.id;
      if (!sid) continue;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid)!.push(t);
      if (t.id && t.id !== sid) {
        if (!map.has(t.id)) map.set(t.id, []);
        map.get(t.id)!.push(t);
      }
    }
    return map;
  }, [transactions]);

  const ledgerIntegrity = useMemo(() => {
    const integrityMap = new Map<
      string,
      'Complete' | 'Partial' | 'Orphaned' | 'Pending' | 'N/A' | 'Unknown'
    >();
    entries.forEach((entry) => {
      if (isJaaStatementLedgerRow(entry)) {
        integrityMap.set(entry.id, 'N/A');
        return;
      }
      const gasCardIntegrity = resolveGasCardLedgerIntegrity(entry);
      if (gasCardIntegrity) {
        integrityMap.set(entry.id, gasCardIntegrity);
        return;
      }
      if (!isManualEntry(entry)) {
        integrityMap.set(entry.id, 'N/A');
        return;
      }
      if (entry.reconciliationStatus === 'Pending') {
        integrityMap.set(entry.id, 'Pending');
        return;
      }
      const related = [
        ...(txBySourceId.get(entry.id) || []),
        ...(entry.transactionId ? txBySourceId.get(entry.transactionId) || [] : []),
      ];
      const hasDebit = related.some((t) => t.amount < 0);
      const hasCredit = related.some((t) => t.amount > 0);
      if (hasDebit && hasCredit) integrityMap.set(entry.id, 'Complete');
      else if (hasDebit) integrityMap.set(entry.id, 'Pending');
      else if (hasCredit) integrityMap.set(entry.id, 'Partial');
      else if (transactionsTruncated && related.length === 0) integrityMap.set(entry.id, 'Unknown');
      else integrityMap.set(entry.id, 'Orphaned');
    });
    return integrityMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, txBySourceId, validAnchorIds, transactionsTruncated]);

  const filteredEntries = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return entries
      .filter((entry) => {
        if (isJaaStatementLedgerRow(entry)) return false;
        if (filterCycleId) {
          const cid = entry.metadata?.cycleId ? String(entry.metadata.cycleId) : '';
          if (cid !== filterCycleId) return false;
        }
        if (filterType !== 'all') {
          if (filterType === 'Fuel_Manual_Entry') {
            if (!isManualEntry(entry)) return false;
          } else if (entry.type !== filterType) return false;
        }
        if (filterVehicle !== 'all' && entry.vehicleId !== filterVehicle) return false;
        if (filterDriver !== 'all' && entry.driverId !== filterDriver) return false;
        if (filterAnchor === 'valid' && !validAnchorIds.has(entry.id)) return false;
        if (filterAnchor === 'invalid') {
          const isClose =
            entry.metadata?.isCapacityClose === true || entry.metadata?.isSoftAnchor === true;
          if (!isClose || validAnchorIds.has(entry.id)) return false;
        }
        if (filterSource !== 'all') {
          if (resolveFuelEntrySource(entry) !== filterSource) return false;
        }
        if (filterStatus !== 'all') {
          const status = entry.reconciliationStatus || 'Pending';
          if (status !== filterStatus) return false;
        }
        if (filterIntegrity === 'imbalanced') {
          const st = ledgerIntegrity.get(entry.id);
          if (st !== 'Partial' && st !== 'Orphaned') return false;
        } else if (filterIntegrity !== 'all') {
          if (ledgerIntegrity.get(entry.id) !== filterIntegrity) return false;
        }
        if (dateRange?.from || dateRange?.to) {
          const startYmd = dateRange.from ? toEntryYmd(dateRange.from) : '0000-01-01';
          const endYmd = dateRange.to
            ? toEntryYmd(dateRange.to)
            : dateRange.from
              ? toEntryYmd(dateRange.from)
              : '9999-12-31';
          if (!isEntryInInclusiveYmdRange(entry.date, startYmd, endYmd)) return false;
        }
        if (term) {
          const hay = [
            getVehicleName(entry.vehicleId),
            getDriverName(entry.driverId),
            entry.location || '',
            entry.vendor || '',
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === 'date') diff = fuelEntrySortMs(b) - fuelEntrySortMs(a);
        else if (sortField === 'amount') diff = (Number(b.amount) || 0) - (Number(a.amount) || 0);
        else if (sortField === 'liters') diff = (Number(b.liters) || 0) - (Number(a.liters) || 0);
        else if (sortField === 'odometer') {
          const ao = a.odometer != null ? Number(a.odometer) : 0;
          const bo = b.odometer != null ? Number(b.odometer) : 0;
          diff = bo - ao;
        }
        if (sortDir === 'asc') diff = -diff;
        if (diff !== 0) return diff;
        const aoTie = a.odometer != null ? Number(a.odometer) : 0;
        const boTie = b.odometer != null ? Number(b.odometer) : 0;
        return boTie - aoTie;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    entries,
    filterType,
    filterVehicle,
    filterDriver,
    filterAnchor,
    filterSource,
    filterStatus,
    filterIntegrity,
    filterCycleId,
    dateRange,
    searchTerm,
    validAnchorIds,
    ledgerIntegrity,
    getVehicleName,
    getDriverName,
    sortField,
    sortDir,
  ]);

  const pagedEntries = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, page]);

  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [
    searchTerm,
    filterType,
    filterVehicle,
    filterDriver,
    filterAnchor,
    filterStatus,
    filterSource,
    filterIntegrity,
    filterCycleId,
    dateRange,
    activeView,
  ]);

  const prevOdometerMap = useMemo(() => {
    const map = new Map<string, { prevOdo: number | null; prevDate: string | null }>();
    const byVehicle: Record<string, FuelEntry[]> = {};
    for (const e of entries) {
      if (isJaaStatementLedgerRow(e)) continue;
      const vid = e.vehicleId || 'unknown';
      if (!byVehicle[vid]) byVehicle[vid] = [];
      byVehicle[vid].push(e);
    }
    const validOdo = (e: FuelEntry): number | null => {
      const n = Number(e.odometer);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    for (const vid of Object.keys(byVehicle)) {
      byVehicle[vid].sort((a, b) => {
        const dc = fuelEntrySortMs(a) - fuelEntrySortMs(b);
        if (dc !== 0) return dc;
        return (
          (a.odometer != null ? Number(a.odometer) : 0) - (b.odometer != null ? Number(b.odometer) : 0)
        );
      });
      for (let i = 0; i < byVehicle[vid].length; i++) {
        const entry = byVehicle[vid][i];
        let prevOdo: number | null = null;
        let prevDate: string | null = null;
        for (let j = i - 1; j >= 0; j--) {
          const o = validOdo(byVehicle[vid][j]);
          if (o != null) {
            prevOdo = o;
            prevDate = byVehicle[vid][j].date ?? null;
            break;
          }
        }
        map.set(entry.id, { prevOdo, prevDate });
      }
    }
    return map;
  }, [entries]);

  const filteredCycles = useMemo(() => {
    const startYmd = dateRange?.from ? toEntryYmd(dateRange.from) : null;
    const endYmd = dateRange?.to
      ? toEntryYmd(dateRange.to)
      : dateRange?.from
        ? toEntryYmd(dateRange.from)
        : null;
    const term = searchTerm.trim().toLowerCase();
    return allCycles.filter((c) => {
      if (filterVehicle !== 'all' && c.vehicleId !== filterVehicle) return false;
      if (filterStatus === 'Flagged' && c.status !== 'Anomaly' && c.signalTier !== 'exception')
        return false;
      if (filterStatus === 'Verified' && c.status !== 'Complete') return false;
      if (filterStatus === 'Pending' && c.status !== 'Active') return false;
      if (startYmd || endYmd) {
        const cStart = String(c.startDate || '').split('T')[0];
        const cEnd = String(c.endDate || '').split('T')[0];
        if (endYmd && cStart && cStart > endYmd) return false;
        if (startYmd && cEnd && cEnd < startYmd) return false;
      }
      if (!term) return true;
      return getVehicleName(c.vehicleId).toLowerCase().includes(term);
    });
  }, [allCycles, filterVehicle, filterStatus, dateRange, searchTerm, getVehicleName]);

  const periodBounds = useMemo(
    () => ({ start: periodStart || null, end: periodEnd || null }),
    [periodStart, periodEnd],
  );

  const isPeriodOpen = useMemo(() => {
    if (!periodEnd) return false;
    const today = fleetTzDateKey(new Date(), fleetTz || 'America/Jamaica');
    return periodEnd >= today;
  }, [periodEnd, fleetTz]);

  const periodFillToFillKm = useMemo(
    () => sumOdometerDeltasBetweenFills(filteredEntries),
    [filteredEntries],
  );

  const { trustedCycles, exceptionCycles } = useMemo(() => {
    const { trusted, exceptions } = partitionCyclesForPeriod(filteredCycles, periodBounds, {
      periodFillToFillKm,
      isPeriodOpen,
    });
    return { trustedCycles: trusted, exceptionCycles: exceptions };
  }, [filteredCycles, periodBounds, periodFillToFillKm, isPeriodOpen]);

  const trustedPeriodTotals = useMemo(
    () =>
      buildTrustedPeriodTotals({
        trusted: trustedCycles,
        entries,
        period: periodBounds,
        provisional: isPeriodOpen,
      }),
    [trustedCycles, entries, periodBounds, isPeriodOpen],
  );

  // Extra filters beyond period/vehicle → keep client KPIs (KPI≡list)
  const hasExtraTxnFilters =
    !!searchTerm.trim() ||
    filterType !== 'all' ||
    filterDriver !== 'all' ||
    filterAnchor !== 'all' ||
    filterStatus !== 'all' ||
    filterSource !== 'all' ||
    filterIntegrity !== 'all' ||
    !!filterCycleId;

  const { summary: serverSummary } = useFuelLogSummary({
    startDate: periodStart,
    endDate: periodEnd,
    vehicleId: filterVehicle,
    enabled: activeView === 'transactions' && !hasExtraTxnFilters,
  });

  const clientTransactionKpis = useMemo(() => {
    const integrityById = new Map<string, string>();
    for (const [id, status] of ledgerIntegrity.entries()) integrityById.set(id, status);
    return buildTransactionKpis(filteredEntries, {
      validAnchorIds,
      integrityById,
    });
  }, [filteredEntries, validAnchorIds, ledgerIntegrity]);

  const transactionKpis = useMemo(() => {
    if (hasExtraTxnFilters || !serverSummary) return clientTransactionKpis;
    return mergeServerTransactionKpis(clientTransactionKpis, serverSummary);
  }, [hasExtraTxnFilters, serverSummary, clientTransactionKpis]);

  const cycleKpis = useMemo(
    () =>
      buildCycleKpis({
        trusted: trustedCycles,
        exceptions: exceptionCycles,
        clippedTotals: {
          distanceKm: trustedPeriodTotals.distanceKm,
          fuelL: trustedPeriodTotals.fuelL,
          spend: trustedPeriodTotals.spend,
        },
      }),
    [trustedCycles, exceptionCycles, trustedPeriodTotals],
  );

  const periodDistance = useMemo(
    () =>
      resolvePeriodDistance(trustedCycles, filteredEntries, {
        start: periodStart,
        end: periodEnd,
      }),
    [trustedCycles, filteredEntries, periodStart, periodEnd],
  );

  const runRecalculate = async () => {
    setIsRecalculating(true);
    try {
      const scopeId = filterVehicle !== 'all' ? filterVehicle : undefined;
      const result = await api.recalculateAllIntegrity(
        scopeId ? { vehicleId: scopeId } : undefined,
      );
      toast.success(scopeId ? 'Vehicle recalculation complete' : 'Fleet recalculation complete', {
        description: `Re-scored ${result?.entriesModified ?? 0} entries / ${result?.modified ?? 0} transactions.`,
      });
      await onRefresh?.();
    } catch (err) {
      console.error('[Recalculate] failed:', err);
      toast.error('Failed to recalculate cycles', { description: String(err) });
    } finally {
      setIsRecalculating(false);
      setConfirmFleetRecalc(false);
    }
  };

  const handleRecalculateClick = () => {
    if (filterVehicle === 'all') {
      setConfirmFleetRecalc(true);
      return;
    }
    void runRecalculate();
  };

  const exportRows = (rows: FuelEntry[]) => {
    const mapped = rows.map((e) => ({
      date: e.date,
      time: e.time || '',
      vehicle: getVehicleName(e.vehicleId),
      driver: getDriverName(e.driverId),
      station: e.location || e.vendor || '',
      liters: e.liters ?? '',
      amount: e.amount ?? '',
      currency: defaultCurrency || 'JMD',
      odometer: e.odometer ?? '',
      entrySource: resolveFuelEntrySource(e),
      paymentSource: String(e.paymentSource || e.metadata?.paymentSource || ''),
      cycleId: String(e.metadata?.cycleId || ''),
      auditScore: e.metadata?.auditConfidenceScore ?? '',
      locked: e.isLocked || e.status === 'Finalized' ? 'yes' : 'no',
      notes: e.notes || '',
    }));
    type Row = (typeof mapped)[number];
    const cols: { key: keyof Row; label: string }[] = [
      { key: 'date', label: 'Date' },
      { key: 'time', label: 'Time' },
      { key: 'vehicle', label: 'Vehicle' },
      { key: 'driver', label: 'Driver' },
      { key: 'station', label: 'Station' },
      { key: 'liters', label: 'Liters' },
      { key: 'amount', label: 'Amount' },
      { key: 'currency', label: 'Currency' },
      { key: 'odometer', label: 'Odometer' },
      { key: 'entrySource', label: 'Entry Source' },
      { key: 'paymentSource', label: 'Payment' },
      { key: 'cycleId', label: 'Cycle Id' },
      { key: 'auditScore', label: 'Audit Score' },
      { key: 'locked', label: 'Locked' },
      { key: 'notes', label: 'Notes' },
    ];
    const bom = '\uFEFF';
    const csv = bom + jsonToCsv(mapped, cols);
    const name = `fuel_logs_${new Date().toISOString().split('T')[0]}.csv`;
    downloadBlob(csv, name);
    toast.success('Exporting fuel logs...');
  };

  const exportCycles = () => {
    const mapped = [...trustedCycles, ...exceptionCycles].map((c) => ({
      vehicle: getVehicleName(c.vehicleId),
      start: String(c.startDate || '').split('T')[0],
      end: String(c.endDate || '').split('T')[0],
      distance: c.distance ?? '',
      liters: c.totalLiters ?? '',
      cost: c.totalCost ?? '',
      currency: defaultCurrency || 'JMD',
      efficiency: c.efficiency ?? '',
      status: c.status || '',
      cycleId: c.id,
    }));
    type Row = (typeof mapped)[number];
    const cols: { key: keyof Row; label: string }[] = [
      { key: 'vehicle', label: 'Vehicle' },
      { key: 'start', label: 'Start' },
      { key: 'end', label: 'End' },
      { key: 'distance', label: 'Distance (km)' },
      { key: 'liters', label: 'Liters' },
      { key: 'cost', label: 'Cost' },
      { key: 'currency', label: 'Currency' },
      { key: 'efficiency', label: 'Efficiency (km/L)' },
      { key: 'status', label: 'Status' },
      { key: 'cycleId', label: 'Cycle Id' },
    ];
    const bom = '\uFEFF';
    const csv = bom + jsonToCsv(mapped, cols);
    const name = `fuel_cycles_${new Date().toISOString().split('T')[0]}.csv`;
    downloadBlob(csv, name);
    toast.success('Exporting fuel cycles...');
  };

  const handleExport = () => {
    if (activeView === 'cycles') {
      exportCycles();
      return;
    }
    if (selectedIds.size > 0) {
      exportRows(filteredEntries.filter((e) => selectedIds.has(e.id)));
      return;
    }
    exportRows(filteredEntries);
  };

  const applyCycleFilter = (cycleId: string, vehicleId?: string, switchToTransactions = true) => {
    setFilterCycleId(cycleId);
    if (vehicleId) setFilterVehicle(vehicleId);
    if (switchToTransactions) setActiveView('transactions');
    setQuery({
      cycleId,
      vehicleId: vehicleId || undefined,
      view: switchToTransactions ? 'transactions' : activeView,
    });
    toast.info('Filtered to Full Tank cycle', {
      description: cycleId.length > 8 ? `${cycleId.slice(0, 8)}…` : cycleId,
    });
  };

  const handleAssignException = (cycleId: string, note: string) => {
    const next: Record<string, FuelExceptionAssignment> = {
      ...exceptionAssignments,
      [cycleId]: { note, at: new Date().toISOString() },
    };
    setExceptionAssignments(next);
    try {
      localStorage.setItem(EXCEPTION_ASSIGNMENTS_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
    toast.success('Exception assigned', { description: note });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const e of pagedEntries) {
        if (checked) next.add(e.id);
        else next.delete(e.id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-bold text-rose-700">Couldn’t load fuel logs</p>
            <p className="text-[11px] text-rose-600 mt-0.5">{loadError}</p>
          </div>
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs border-rose-200 text-rose-700 hover:bg-rose-100"
              onClick={() => void onRefresh()}
            >
              <RotateCcw className="h-3 w-3" /> Retry
            </Button>
          )}
        </div>
      )}

      {(dataTruncated || transactionsTruncated) && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-700">Showing a partial dataset</p>
            <p className="text-[11px] text-amber-600 mt-0.5">
              {dataTruncated && transactionsTruncated
                ? 'Too many fuel logs and expense transactions to load at once. Narrow the date range or filters for complete totals.'
                : transactionsTruncated
                  ? 'Too many expense transactions to load at once. Narrow the date range or filters for complete totals.'
                  : 'Too many fuel logs to load at once. Narrow the date range or filters for complete totals.'}
            </p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-9 w-full rounded-md" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      )}

      <FuelLogToolbar
        activeView={activeView}
        onViewChange={(view) => {
          setActiveView(view);
          setQuery({ view });
          if (view !== 'cycles') setFocusExceptions(false);
        }}
        searchTerm={searchTerm}
        onSearchChange={(v) => {
          setSearchTerm(v);
          setQuery({ search: v || undefined });
        }}
        canExport={can('fuel.export')}
        selectedCount={selectedIds.size}
        onExport={handleExport}
        activeFilterCount={activeFilterCount}
        filterVehicle={filterVehicle}
        filterDriver={filterDriver}
        filterType={filterType}
        filterAnchor={filterAnchor}
        filterStatus={filterStatus}
        filterIntegrity={filterIntegrity}
        filterSource={filterSource}
        filterCycleId={filterCycleId}
        uniqueVehicles={uniqueVehicles}
        uniqueDrivers={uniqueDrivers}
        onFilterVehicle={(v) => {
          setFilterVehicle(v);
          setQuery({ vehicleId: v === 'all' ? undefined : v });
        }}
        onFilterDriver={(v) => {
          setFilterDriver(v);
          setQuery({ driverId: v === 'all' ? undefined : v });
        }}
        onFilterType={(v) => {
          setFilterType(v);
          setQuery({ type: v === 'all' ? undefined : v });
        }}
        onFilterAnchor={(v) => {
          setFilterAnchor(v);
          setQuery({ anchor: v === 'all' ? undefined : v });
        }}
        onFilterStatus={(v) => {
          setFilterStatus(v);
          setQuery({ status: v === 'all' ? undefined : v });
        }}
        onFilterIntegrity={(v) => {
          setFilterIntegrity(v);
          setQuery({ integrity: v === 'all' ? undefined : v });
        }}
        onFilterSource={(v) => {
          setFilterSource(v);
          setQuery({ source: v === 'all' ? undefined : v });
        }}
        onClearCycleFilter={() => {
          setFilterCycleId(null);
          setQuery({ cycleId: undefined });
        }}
        onClearFilters={clearFilters}
        periodStart={periodStart}
        periodEnd={periodEnd}
        onDateRangeChange={onDateRangeChange}
        showRecalculate={activeView === 'cycles' && can('data.backfill')}
        isRecalculating={isRecalculating}
        onRecalculate={handleRecalculateClick}
      />

      {activeView === 'cycles' && isPeriodOpen && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Week in progress. Totals update as driver fills and gas-card CSV arrive. Exception history
          is excluded from period totals.
        </div>
      )}

      <div className="mb-2">
        <FuelLogKpiRow
          tiles={
            activeView === 'transactions'
              ? transactionKpisToTiles(transactionKpis, {
                  distanceKm: periodDistance.primaryKm,
                  distanceHint:
                    periodDistance.carriedInKm > 0
                      ? `${periodDistance.carriedInKm.toLocaleString()} km before this period excluded`
                      : periodDistance.primaryLabel,
                  integrityActive: filterIntegrity === 'imbalanced',
                  sourceHint: `${transactionKpis.sourcePortal} portal · ${transactionKpis.sourceAdmin} admin · ${transactionKpis.sourceAnchors} anchors`,
                })
              : cycleKpisToTiles(cycleKpis, {
                  distanceKm: trustedPeriodTotals.distanceKm,
                  exceptionsActive: focusExceptions,
                })
          }
          onTileClick={(tileId) => {
            if (tileId === 'imbalanced') {
              const next = filterIntegrity === 'imbalanced' ? 'all' : 'imbalanced';
              setFilterIntegrity(next);
              setQuery({ integrity: next === 'all' ? undefined : next });
              return;
            }
            if (tileId === 'exceptions') {
              setFocusExceptions(true);
              requestAnimationFrame(() => {
                exceptionQueueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              });
            }
          }}
        />
      </div>

      <div className="rounded-md border bg-white overflow-x-auto">
        {activeView === 'transactions' ? (
          <FuelTransactionsTable
            pagedEntries={pagedEntries}
            filteredCount={filteredEntries.length}
            vehicles={vehicles}
            page={page}
            pageCount={pageCount}
            pageSize={PAGE_SIZE}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectPage={toggleSelectPage}
            sortField={sortField}
            sortDir={sortDir}
            onToggleSort={toggleSort}
            prevOdometerMap={prevOdometerMap}
            focusEntryId={focusEntryId}
            getVehicleName={getVehicleName}
            getDriverName={getDriverName}
            canEdit={can('fuel.edit_entry')}
            canDelete={can('fuel.delete_entry')}
            onView={setViewingEntry}
            onEdit={onEdit}
            onDelete={onDelete}
            onCycleClick={(cycleId, vehicleId) => applyCycleFilter(cycleId, vehicleId, true)}
            onPageChange={setPage}
          />
        ) : (
          <FuelCyclesPanel
            trustedCycles={trustedCycles}
            exceptionCycles={exceptionCycles}
            vehicles={vehicles}
            periodBounds={periodBounds}
            isPeriodOpen={isPeriodOpen}
            getVehicleName={getVehicleName}
            canEdit={can('fuel.edit_entry')}
            onEdit={onEdit}
            onViewFills={(cycleId, vehicleId) => applyCycleFilter(cycleId, vehicleId, true)}
            onAssignException={handleAssignException}
            exceptionAssignments={exceptionAssignments}
            exceptionQueueRef={exceptionQueueRef}
          />
        )}
      </div>

      <FuelEntryDetailSheet
        open={!!viewingEntry}
        onOpenChange={(open) => {
          if (!open) setViewingEntry(null);
        }}
        entry={viewingEntry}
        vehicleLabel={viewingEntry ? getVehicleName(viewingEntry.vehicleId) : undefined}
        driverLabel={viewingEntry ? getDriverName(viewingEntry.driverId) : undefined}
        stationLabel={
          viewingEntry
            ? viewingEntry.location ||
              viewingEntry.vendor ||
              viewingEntry.stationAddress ||
              viewingEntry.metadata?.stationName
            : undefined
        }
        paymentLabel={viewingEntry ? resolvePaymentLabel(viewingEntry) : undefined}
        corrections={corrections}
        correctionsLoading={correctionsLoading}
        correctionsError={correctionsError}
        canEdit={can('fuel.edit_entry')}
        onEdit={(entry) => {
          setViewingEntry(null);
          onEdit(entry);
        }}
      />

      <AlertDialog
        open={confirmFleetRecalc}
        onOpenChange={(open) => {
          if (!open) setConfirmFleetRecalc(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalculate the entire fleet?</AlertDialogTitle>
            <AlertDialogDescription>
              This re-scores capacity cycles and ledger integrity for every vehicle. It can take a
              while and will refresh the logs when done. Filter to a single vehicle first to scope
              the run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRecalculating}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isRecalculating} onClick={() => void runRecalculate()}>
              {isRecalculating ? 'Recalculating…' : 'Recalculate fleet'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
