import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type SessionRow = Record<string, unknown>;
type StockRow = Record<string, unknown>;

export type CountLineEdit = {
  key: string;
  id?: string;
  item_id: string;
  bin_id?: string | null;
  bin_code: string;
  name: string;
  sku: string;
  expected_qty: number;
  counted_qty: string;
  reason: string;
  unit_cost: number;
};

function lineKey(row: { item_id: string; bin_id?: string | null }) {
  return `${row.item_id}:${row.bin_id ?? 'none'}`;
}

function buildLinesFromStock(
  stock: StockRow[],
  locationId: string,
  existing: CountLineEdit[],
): CountLineEdit[] {
  const byKey = new Map(existing.map((l) => [l.key, l]));
  const filtered = stock.filter((s) => String(s.location_id ?? '') === locationId);
  const rows: CountLineEdit[] = [];
  for (const s of filtered) {
    const itemId = String(s.item_id ?? s.id ?? '');
    if (!itemId) continue;
    const binId = s.bin_id != null ? String(s.bin_id) : null;
    const key = lineKey({ item_id: itemId, bin_id: binId });
    const prev = byKey.get(key);
    const expected = Number(s.on_hand ?? s.qty ?? 0);
    const unit =
      s.unit_cost_jmd != null
        ? Number(s.unit_cost_jmd)
        : s.stock_value != null && expected
          ? Number(s.stock_value) / expected
          : 0;
    rows.push({
      key,
      id: prev?.id,
      item_id: itemId,
      bin_id: binId,
      bin_code: String(s.bin_code ?? s.bin ?? '—'),
      name: String(s.name ?? s.item_name ?? '—'),
      sku: String(s.sku ?? '—'),
      expected_qty: Number.isFinite(expected) ? expected : 0,
      counted_qty: prev?.counted_qty ?? String(expected),
      reason: prev?.reason ?? '',
      unit_cost: Number.isFinite(unit) ? unit : 0,
    });
  }
  if (rows.length) return rows;
  return existing;
}

export function useGapCountSessionForm(onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [sessions, stock, locationsPayload] = await Promise.all([
      inventoryApi.countSessions(),
      inventoryApi.stock(),
      inventoryApi.locationsBins(),
    ]);
    return {
      sessions: asPagedItems(sessions as { items?: unknown[] }) as SessionRow[],
      stock: asPagedItems(stock as { items?: unknown[] }) as StockRow[],
      locations: (locationsPayload as { locations?: Record<string, unknown>[] }).locations ?? [],
    };
  }, []);

  const [locationId, setLocationId] = useState('');
  const [note, setNote] = useState('');
  const [scanQuery, setScanQuery] = useState('');
  const [showParams, setShowParams] = useState(false);
  const [binScope, setBinScope] = useState<'all' | 'specific'>('all');
  const [countLines, setCountLines] = useState<CountLineEdit[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linesBootstrapped = useRef(false);

  const activeSession = useMemo(() => {
    const open = (load.data?.sessions ?? []).find(
      (s) => String(s.status ?? '').toLowerCase() === 'open',
    );
    return open ?? load.data?.sessions[0] ?? null;
  }, [load.data?.sessions]);

  const sessionLocationId = activeSession?.location_id
    ? String(activeSession.location_id)
    : locationId;

  useEffect(() => {
    if (locationId || !load.data?.locations.length) return;
    const def = load.data.locations.find((l) => l.is_default) ?? load.data.locations[0];
    setLocationId(String(def.id));
  }, [load.data?.locations, locationId]);

  useEffect(() => {
    if (!load.data?.stock.length || !sessionLocationId) return;
    const sessionLines = Array.isArray(activeSession?.lines)
      ? (activeSession.lines as Record<string, unknown>[])
      : [];
    const fromSession: CountLineEdit[] = sessionLines.map((row) => {
      const itemId = String(row.item_id ?? '');
      const binId = row.bin_id != null ? String(row.bin_id) : null;
      return {
        key: lineKey({ item_id: itemId, bin_id: binId }),
        id: row.id != null ? String(row.id) : undefined,
        item_id: itemId,
        bin_id: binId,
        bin_code: String(row.bin_code ?? '—'),
        name: String(row.name ?? '—'),
        sku: String(row.sku ?? '—'),
        expected_qty: Number(row.expected_qty ?? 0),
        counted_qty:
          row.counted_qty != null ? String(row.counted_qty) : String(row.expected_qty ?? ''),
        reason: String(row.reason ?? ''),
        unit_cost: Number(row.unit_cost ?? 0),
      };
    });
    setCountLines((prev) =>
      buildLinesFromStock(load.data!.stock, sessionLocationId, fromSession.length ? fromSession : prev),
    );
    linesBootstrapped.current = true;
  }, [load.data?.stock, sessionLocationId, activeSession?.lines]);

  const locationLabel = useMemo(() => {
    const loc = load.data?.locations.find((l) => String(l.id) === locationId);
    return loc ? String(loc.name ?? loc.code ?? '—') : '—';
  }, [load.data?.locations, locationId]);

  const filteredLines = useMemo(() => {
    const q = scanQuery.trim().toLowerCase();
    if (!q) return countLines;
    return countLines.filter(
      (l) =>
        l.sku.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        l.bin_code.toLowerCase().includes(q),
    );
  }, [countLines, scanQuery]);

  const progressPct = useMemo(() => {
    if (!countLines.length) return 0;
    const done = countLines.filter((l) => l.counted_qty.trim() !== '').length;
    return Math.round((done / countLines.length) * 100);
  }, [countLines]);

  const pendingLineCount = useMemo(
    () => countLines.filter((l) => l.counted_qty.trim() === '').length,
    [countLines],
  );

  const persistLines = useCallback(async () => {
    const sessionId = activeSession?.id ? String(activeSession.id) : null;
    if (!sessionId || !countLines.length) return;
    const payload = countLines.map((l) => ({
      id: l.id,
      item_id: l.item_id,
      bin_id: l.bin_id,
      expected_qty: l.expected_qty,
      counted_qty: l.counted_qty.trim() === '' ? null : Number(l.counted_qty),
      reason: l.reason.trim() || null,
    }));
    await inventoryApi.saveCountLines(sessionId, payload);
  }, [activeSession?.id, countLines]);

  useEffect(() => {
    if (!activeSession?.id || !linesBootstrapped.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persistLines().catch(() => {});
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [countLines, activeSession?.id, persistLines]);

  const setLineCountedQty = (key: string, value: string) => {
    setCountLines((prev) => prev.map((l) => (l.key === key ? { ...l, counted_qty: value } : l)));
  };

  const setLineReason = (key: string, value: string) => {
    setCountLines((prev) => prev.map((l) => (l.key === key ? { ...l, reason: value } : l)));
  };

  const lineDiff = (line: CountLineEdit) => {
    const counted = Number(line.counted_qty);
    if (!Number.isFinite(counted)) return null;
    return counted - line.expected_qty;
  };

  const lineImpactLabel = (line: CountLineEdit) => {
    const diff = lineDiff(line);
    if (diff == null) return '—';
    return formatJmd(diff * line.unit_cost);
  };

  const netVarianceJmd = useMemo(() => {
    let sum = 0;
    for (const line of countLines) {
      const diff = lineDiff(line);
      if (diff == null || diff === 0) continue;
      sum += diff * line.unit_cost;
    }
    return sum;
  }, [countLines]);

  const netVarianceLabel = formatJmd(netVarianceJmd);
  const discrepancyCount = useMemo(
    () => countLines.filter((l) => { const d = lineDiff(l); return d != null && d !== 0; }).length,
    [countLines],
  );
  const depotToleranceLabel = formatJmd(2500);

  const saveAndExit = () =>
    submit.run(async () => {
      await persistLines();
      await shell.refresh();
      onClose?.();
    });

  const canStartCount = locationId.trim().length > 0;
  const canSubmitCount = Boolean(activeSession?.id) && countLines.some((l) => l.counted_qty.trim());

  const startCount = () =>
    submit.run(async () => {
      if (!canStartCount) throw new Error('Choose a location');
      await inventoryApi.startCountSession({
        location_id: locationId,
        note: note.trim() || null,
      });
      await load.reload();
      await shell.refresh();
      onClose?.();
    });

  const countSubmit = () =>
    submit.run(async () => {
      const sessionId = activeSession?.id ? String(activeSession.id) : null;
      if (!sessionId) throw new Error('No open count session');
      await persistLines();
      await inventoryApi.countSubmit(sessionId);
      await shell.refresh();
      onClose?.();
    });

  const saveCountLinesNow = () =>
    submit.run(async () => {
      await persistLines();
      await shell.refresh();
    });

  return {
    load,
    submit,
    locationId,
    setLocationId,
    note,
    setNote,
    scanQuery,
    setScanQuery,
    locations: load.data?.locations ?? [],
    locationLabel,
    activeSession,
    sessionCount: load.data?.sessions.length ?? 0,
    stockCount: load.data?.stock.length ?? 0,
    countLines,
    filteredLines,
    progressPct,
    pendingLineCount,
    setLineCountedQty,
    setLineReason,
    lineDiff,
    canStartCount,
    canSubmitCount,
    startCount,
    countSubmit,
    saveCountLinesNow,
    saveAndExit,
    showParams,
    setShowParams,
    binScope,
    setBinScope,
    lineImpactLabel,
    netVarianceLabel,
    discrepancyCount,
    depotToleranceLabel,
    formatJmd,
  };
}
