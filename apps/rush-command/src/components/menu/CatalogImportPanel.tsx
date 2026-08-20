import { useState } from 'react';
import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { importMerchantCatalog } from '../../lib/partner-api';

type CatalogImportPanelProps = {
  merchantId: string;
  onImported?: () => void;
};

function parseCsv(text: string): Array<Record<string, unknown>> {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    const row: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      row[header] = cols[i] ?? '';
    });
    return {
      name: row.name ?? row.item ?? '',
      price: Number(row.price ?? 0),
      sku: row.sku ?? undefined,
      upc: row.upc ?? undefined,
      unit: row.unit ?? undefined,
      stock_qty: row.stock_qty ? Number(row.stock_qty) : undefined,
      category: row.category ?? undefined,
    };
  });
}

export default function CatalogImportPanel({ merchantId, onImported }: CatalogImportPanelProps) {
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false);

  const handleImport = async () => {
    const items = parseCsv(csvText);
    if (!items.length) {
      toast.error('Paste CSV with header row: name,price,sku,upc,unit,stock_qty,category');
      return;
    }
    setBusy(true);
    try {
      await importMerchantCatalog(merchantId, items);
      setCsvText('');
      toast.success(`Imported ${items.length} catalog items`);
      onImported?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
      <div className="flex items-center gap-2 mb-inset-sm">
        <MaterialIcon name="upload_file" className="text-primary-container" />
        <h3 className="text-label-md font-semibold text-on-surface">Catalog CSV import</h3>
      </div>
      <p className="text-body-sm text-on-surface-variant mb-inset-sm">
        Required for grocery go-live (50+ items). Template: name, price, sku, upc, unit, stock_qty, category
      </p>
      <textarea
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        rows={5}
        placeholder={'name,price,sku,upc,unit,stock_qty,category\nMilk 1L,450,MLK-1,012345678901,each,24,Dairy'}
        className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm text-on-surface font-mono"
      />
      <button
        type="button"
        disabled={busy || !csvText.trim()}
        onClick={() => void handleImport()}
        className="mt-inset-sm h-10 px-4 rounded-lg bg-primary-container text-on-primary text-label-md font-semibold disabled:opacity-50"
      >
        {busy ? 'Importing…' : 'Import catalog'}
      </button>
    </section>
  );
}
