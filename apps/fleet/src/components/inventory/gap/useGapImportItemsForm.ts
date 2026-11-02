import { useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type PreviewRow = Record<string, string>;

function parseCsvPreview(text: string, limit = 8): PreviewRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1, limit + 1).map((line) => {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: PreviewRow = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] ?? '';
    });
    return row;
  });
}

export function useGapImportItemsForm(onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const itemsPayload = await inventoryApi.items();
    return { catalog: asPagedItems(itemsPayload as { items?: unknown[] }) };
  }, []);

  const [filePayload, setFilePayload] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [rowCount, setRowCount] = useState(0);

  const onFile = async (file: File | null) => {
    if (!file) {
      setFilePayload(null);
      setFileName('');
      setPreviewRows([]);
      setRowCount(0);
      return;
    }
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    setFilePayload({ name: file.name, content: text });
    setFileName(file.name);
    setRowCount(Math.max(0, lines.length - 1));
    setPreviewRows(parseCsvPreview(text));
  };

  const canSubmit = Boolean(filePayload);

  const importItems = () =>
    submit.run(async () => {
      if (!filePayload) throw new Error('Choose a file first');
      await inventoryApi.importItems(filePayload);
      await shell.refresh();
      onClose?.();
    });

  const downloadSampleTemplate = () => {
    void import('../inventoryDownload').then(({ downloadText }) =>
      downloadText('inventory-import-template.csv', 'sku,name,unit_cost_jmd,category\n'),
    );
  };

  const downloadProblemRows = () => {
    void import('../inventoryDownload').then(({ downloadText }) => {
      const bad = previewRows.filter((row) =>
        Object.values(row).some((v) => v.toLowerCase().includes('error')),
      );
      const header = bad.length ? Object.keys(bad[0]).join(',') + '\n' : 'sku,error\n';
      const body = bad.map((row) => Object.values(row).join(',')).join('\n');
      downloadText('import-problems.csv', header + body);
    });
  };

  const catalog = load.data?.catalog ?? [];
  const previewSummary = useMemo(
    () => ({
      newCount: previewRows.length,
      problemCount: previewRows.filter((row) =>
        Object.values(row).some((v) => v.toLowerCase().includes('error')),
      ).length,
    }),
    [previewRows],
  );

  return {
    load,
    submit,
    fileName,
    onFile,
    importItems,
    catalog,
    previewRows,
    rowCount,
    previewSummary,
    canSubmit,
    downloadSampleTemplate,
    downloadProblemRows,
  };
}
