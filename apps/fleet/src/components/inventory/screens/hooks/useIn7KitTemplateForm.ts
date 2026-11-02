import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { asPagedItems, numField, strField } from '../../inventoryData';
import { downloadBlob } from '../../inventoryDownload';
import { formatJmd } from '../../inventoryFormat';
import { useGapLoad } from '../../gap/useGapLoad';
import { useInScreenBase, type Row } from './useInShared';
import type { InventoryTabId } from '../../InventoryTabs';

export type KitTemplateLine = {
  key: string;
  itemId: string;
  name: string;
  qty: string;
  required: boolean;
  blocksRoadClearance: boolean;
};

export function useIn7KitTemplateForm(templateId?: string | null) {
  const base = useInScreenBase();
  const { shell, submit } = base;

  const load = useGapLoad(async () => {
    const res = await inventoryApi.kitsTemplates();
    const templates = asPagedItems(res as { items?: unknown[] });
    const items = asPagedItems(await inventoryApi.items());
    return { templates, items };
  }, []);

  const templates = load.data?.templates ?? [];
  const catalogItems = load.data?.items ?? [];

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templateId ?? strField(templates[0] ?? {}, 'id', ''),
  );
  const [lines, setLines] = useState<KitTemplateLine[]>([]);

  useEffect(() => {
    if (!templates.length) return;
    const id = templateId ?? strField(templates[0], 'id', '');
    setSelectedTemplateId(id);
  }, [templateId, templates]);

  useEffect(() => {
    const tpl = templates.find((t) => strField(t, 'id', '') === selectedTemplateId);
    const rawLines = (tpl?.lines as Row[] | undefined) ?? (tpl?.template_lines as Row[] | undefined) ?? [];
    if (!rawLines.length && catalogItems.length) {
      setLines([
        {
          key: crypto.randomUUID(),
          itemId: strField(catalogItems[0], 'id', ''),
          name: strField(catalogItems[0], 'name', '—'),
          qty: '1',
          required: true,
          blocksRoadClearance: false,
        },
      ]);
      return;
    }
    setLines(
      rawLines.map((row) => ({
        key: strField(row, 'id', crypto.randomUUID()),
        itemId: strField(row, 'item_id', ''),
        name: strField(row, 'name', strField(row, 'item_name', '—')),
        qty: String(row.qty ?? row.quantity ?? '1'),
        required: String(row.required ?? 'true') !== 'false',
        blocksRoadClearance: String(row.blocks_road_clearance ?? '') === 'true',
      })),
    );
  }, [selectedTemplateId, templates, catalogItems]);

  const selectTemplate = (id: string) => setSelectedTemplateId(id);

  const selectTemplateByService = (service: 'rideshare' | 'delivery' | 'executive') => {
    const match = templates.find((tpl) => {
      const line = `${strField(tpl, 'service_line', '')} ${strField(tpl, 'name', '')}`.toLowerCase();
      return line.includes(service);
    });
    if (match) selectTemplate(strField(match, 'id', ''));
  };

  const newTemplate = () => shell.openModal('kit-editor');
  const compare = () => shell.openGap('kit-compare', { itemId: selectedTemplateId ?? null });

  const exportSpec = () =>
    submit.run(async () => {
      const res = await inventoryApi.kitsSpecPdf(selectedTemplateId ?? undefined);
      if (res.kind === 'pdf') downloadBlob('kit-spec.pdf', res.blob);
    });

  const publish = () =>
    submit.run(async () => {
      if (!selectedTemplateId) throw new Error('No template selected');
      await inventoryApi.publishKitTemplate(selectedTemplateId, {});
      await shell.refresh();
      await load.reload();
    });

  const deleteLine = (lineKey: string) => setLines((prev) => prev.filter((l) => l.key !== lineKey));

  const addLine = () => {
    const item = catalogItems[0];
    if (!item) return;
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        itemId: strField(item, 'id', ''),
        name: strField(item, 'name', '—'),
        qty: '1',
        required: true,
        blocksRoadClearance: false,
      },
    ]);
  };

  const saveDraft = () =>
    submit.run(async () => {
      await inventoryApi.createKitTemplate({
        name: strField(
          templates.find((t) => strField(t, 'id', '') === selectedTemplateId) ?? {},
          'name',
          'Draft kit',
        ),
        lines: lines.map((l) => ({
          item_id: l.itemId,
          qty: Number(l.qty) || 1,
          required: l.required,
          blocks_road_clearance: l.blocksRoadClearance,
        })),
      });
      await load.reload();
    });

  const selectedTemplate =
    templates.find((t) => strField(t, 'id', '') === selectedTemplateId) ?? null;
  const versionLabel = strField(selectedTemplate ?? {}, 'version', '1');
  const applyVehicleCount = Number(strField(selectedTemplate ?? {}, 'vehicle_count', '0'));

  const totalLandedVal = useMemo(() => {
    let sum = 0;
    for (const line of lines) {
      const item = catalogItems.find((i) => strField(i, 'id', '') === line.itemId);
      const unit = item ? numField(item, 'avg_cost_jmd', numField(item, 'unit_cost', 0)) : 0;
      sum += unit * (Number(line.qty) || 1);
    }
    return formatJmd(sum || null);
  }, [lines, catalogItems]);

  const goTab = (tab: InventoryTabId) => shell.setTab(tab);

  return {
    ...base,
    shell,
    submit,
    load,
    templates,
    selectedTemplateId,
    selectedTemplate,
    selectTemplate,
    selectTemplateByService,
    lines,
    newTemplate,
    compare,
    exportSpec,
    publish,
    deleteLine,
    addLine,
    saveDraft,
    versionLabel,
    applyVehicleCount,
    totalLandedVal,
    linesCount: lines.length,
    goTab,
    strField,
  };
}
