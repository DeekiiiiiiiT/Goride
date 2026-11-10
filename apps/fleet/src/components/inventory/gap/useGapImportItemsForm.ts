import { useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { downloadText } from '../inventoryDownload';
import { useInventoryShell } from '../InventoryShellContext';
import { STARTER_ITEMS } from '../screens/hooks/useIn16SetupForm';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

/** The importer's real columns (the server's add-item route reads these). */
export const IMPORT_COLUMNS = ['sku', 'name', 'tracking', 'default_unit_cost'] as const;

export type ImportRow = {
  line: number;
  sku: string;
  name: string;
  tracking: 'quantity' | 'serial';
  cost: number | null;
  problem: string | null;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function slug(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}

/** Import items: the screen creates each row through POST /items (the old RPC was a stub). */
export function useGapImportItemsForm(onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const itemsPayload = await inventoryApi.items();
    return { catalog: asPagedItems(itemsPayload as { items?: unknown[] }) };
  }, []);
  const catalog = load.data?.catalog ?? [];
  const existingSkus = useMemo(() => new Set(catalog.map((i) => String(i.sku ?? '').toLowerCase())), [catalog]);
  const existingNames = useMemo(() => new Set(catalog.map((i) => String(i.name ?? '').toLowerCase())), [catalog]);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [result, setResult] = useState<{ created: number; skipped: number; failed: string[] } | null>(null);

  const check = (raw: Omit<ImportRow, 'problem'>, seen: Set<string>): ImportRow => {
    let problem: string | null = null;
    if (!raw.sku || !raw.name) problem = 'Code and name are both needed';
    else if (existingSkus.has(raw.sku.toLowerCase())) problem = 'Already exists — skipped';
    else if (seen.has(raw.sku.toLowerCase())) problem = 'Same code twice in this file';
    seen.add(raw.sku.toLowerCase());
    return { ...raw, problem };
  };

  const onFile = async (file: File | null) => {
    setResult(null);
    if (!file) {
      setFileName('');
      setRows([]);
      return;
    }
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const headers = lines.length ? splitCsvLine(lines[0]).map((h) => h.toLowerCase()) : [];
    const col = (cells: string[], ...names: string[]) => {
      for (const n of names) {
        const i = headers.indexOf(n);
        if (i >= 0) return cells[i] ?? '';
      }
      return '';
    };
    const seen = new Set<string>();
    const parsed = lines.slice(1).map((line, idx) => {
      const cells = splitCsvLine(line);
      const costRaw = col(cells, 'default_unit_cost', 'unit_cost', 'cost').replace(/,/g, '');
      const cost = costRaw === '' ? null : Number(costRaw);
      return check(
        {
          line: idx + 2,
          sku: col(cells, 'sku', 'code'),
          name: col(cells, 'name', 'item'),
          tracking: col(cells, 'tracking').toLowerCase() === 'serial' ? 'serial' : 'quantity',
          cost: cost != null && Number.isFinite(cost) && cost >= 0 ? cost : null,
        },
        seen,
      );
    });
    setFileName(file.name);
    setRows(parsed);
  };

  /** Starter list: the suggested items not already in the catalog. */
  const loadStarter = () => {
    setResult(null);
    const seen = new Set<string>();
    setFileName('Starter list');
    setRows(
      STARTER_ITEMS.filter((n) => !existingNames.has(n.toLowerCase())).map((name, i) =>
        check({ line: i + 1, sku: `KIT-${slug(name)}`, name, tracking: name === 'Dash camera' ? 'serial' : 'quantity', cost: null }, seen),
      ),
    );
  };

  const good = rows.filter((r) => !r.problem);
  const canSubmit = good.length > 0;

  const importItems = () =>
    submit.run(async () => {
      if (!canSubmit) throw new Error('Nothing new to import');
      let created = 0;
      const failed: string[] = [];
      for (const r of good) {
        try {
          await inventoryApi.createItem(
            { sku: r.sku, name: r.name, tracking: r.tracking, default_unit_cost: r.cost },
            crypto.randomUUID(),
          );
          created += 1;
        } catch (e) {
          failed.push(`${r.sku}: ${e instanceof Error ? e.message : 'failed'}`);
        }
      }
      setResult({ created, skipped: rows.length - good.length, failed });
      await load.reload();
      await shell.refresh();
      if (!failed.length && onClose) onClose();
    });

  const downloadSampleTemplate = () =>
    downloadText(
      'inventory-import-template.csv',
      `${IMPORT_COLUMNS.join(',')}\nKIT-TYRE-PUMP,Tyre pump,quantity,6500\nKIT-DASH-CAM,Dash camera,serial,45998.85\n`,
    );

  const downloadProblemRows = () =>
    downloadText(
      'import-problems.csv',
      `line,sku,name,problem\n${rows
        .filter((r) => r.problem)
        .map((r) => `${r.line},${r.sku},"${r.name}","${r.problem}"`)
        .join('\n')}\n`,
    );

  return {
    load,
    submit,
    fileName,
    onFile,
    rows,
    good,
    result,
    importItems,
    canSubmit,
    loadStarter,
    downloadSampleTemplate,
    downloadProblemRows,
  };
}
