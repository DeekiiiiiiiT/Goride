import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { asPagedItems, numField, strField } from '../../inventoryData';
import { downloadBlob } from '../../inventoryDownload';
import { formatJmd } from '../../inventoryFormat';
import { buildKitTemplateLineRow } from '../../inventoryViewRows';
import { useGapLoad } from '../../gap/useGapLoad';
import { useInScreenBase, type Row } from './useInShared';
import type { InventoryTabId } from '../../InventoryTabs';
import type { KitTemplateLineRow, KitTemplateVersionRow } from '../../inventoryTypes';

export type KitTemplateLine = {
  key: string;
  lineType: 'item';
  itemId: string;
  name: string;
  qtyRequired: string;
  required: boolean;
  blocksRoadClearance: boolean;
  installPosition: string;
  variantNote: string;
};

export type KitTemplateEditorLineRow = KitTemplateLineRow & {
  key: string;
  required: boolean;
  installPositionLabel: string;
  installPosition: string;
};

function qtyFromRow(row: Row): string {
  const raw = row.qty_required ?? row.qty ?? row.quantity ?? 1;
  return String(raw);
}

function isItemLine(row: Row): boolean {
  const t = strField(row, 'line_type', 'item');
  return t === 'item' || t === '';
}

/**
 * Stitch → data (In7 Kit template)
 * line name → KitTemplateEditorLineRow.name | sku → KitTemplateEditorLineRow.sku | qty → KitTemplateEditorLineRow.qtyLabel
 */
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

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templateId ?? '');
  const [lines, setLines] = useState<KitTemplateLine[]>([]);
  const [linkedTollTag, setLinkedTollTag] = useState(false);
  const [linkedFuelCard, setLinkedFuelCard] = useState(false);
  const [draftVersionId, setDraftVersionId] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [newKitOpen, setNewKitOpen] = useState(false);
  const [newKitName, setNewKitName] = useState('');
  const [newKitClassification, setNewKitClassification] = useState<
    'rideshare' | 'delivery' | 'executive'
  >('rideshare');

  useEffect(() => {
    if (templateId) setSelectedTemplateId(templateId);
  }, [templateId]);

  useEffect(() => {
    const tpl = templates.find((t) => strField(t, 'id', '') === selectedTemplateId);
    const rawLines = (tpl?.lines as Row[] | undefined) ?? (tpl?.template_lines as Row[] | undefined) ?? [];
    if (!selectedTemplateId) {
      setLines([]);
      setLinkedTollTag(false);
      setLinkedFuelCard(false);
      return;
    }
    let toll = false;
    let fuel = false;
    const itemLines: KitTemplateLine[] = [];
    for (const row of rawLines) {
      const lineType = strField(row, 'line_type', 'item');
      if (lineType === 'linked_toll_tag') {
        toll = true;
        continue;
      }
      if (lineType === 'linked_fuel_card') {
        fuel = true;
        continue;
      }
      if (!isItemLine(row)) continue;
      itemLines.push({
        key: strField(row, 'id', crypto.randomUUID()),
        lineType: 'item',
        itemId: strField(row, 'item_id', ''),
        name: strField(row, 'name', strField(row, 'item_name', '—')),
        qtyRequired: qtyFromRow(row),
        required: String(row.required ?? 'true') !== 'false',
        blocksRoadClearance: String(row.blocks_road_clearance ?? '') === 'true',
        installPosition: strField(row, 'install_position', ''),
        variantNote: strField(row, 'variant_note', ''),
      });
    }
    setLines(itemLines);
    setLinkedTollTag(toll);
    setLinkedFuelCard(fuel);
    const draftId = strField(tpl ?? {}, 'draft_version_id', strField(tpl ?? {}, 'version_id', ''));
    if (draftId) setDraftVersionId(draftId);
  }, [selectedTemplateId, templates]);

  const mapLinesPayload = () => {
    const out: Record<string, unknown>[] = [];
    if (linkedTollTag) {
      out.push({ line_type: 'linked_toll_tag', qty_required: 1, required: true });
    }
    if (linkedFuelCard) {
      out.push({ line_type: 'linked_fuel_card', qty_required: 1, required: true });
    }
    for (const l of lines) {
      out.push({
        line_type: 'item',
        item_id: l.itemId,
        qty_required: Number(l.qtyRequired) || 1,
        required: l.required,
        blocks_road_clearance: l.blocksRoadClearance,
        install_position: l.installPosition || null,
        variant_note: l.variantNote || null,
      });
    }
    return out;
  };

  const persistDraft = async () => {
    if (!selectedTemplateId) throw new Error('No template selected');
    const res = (await inventoryApi.saveKitTemplateDraft(selectedTemplateId, {
      lines: mapLinesPayload(),
      change_note: 'Kit editor draft',
    })) as Record<string, unknown>;
    const vid = String(res.version_id ?? res.draft_version_id ?? '');
    if (!vid) throw new Error('Draft save did not return a version id');
    setDraftVersionId(vid);
    await load.reload();
    return vid;
  };

  const selectTemplate = (id: string) => setSelectedTemplateId(id);

  const selectTemplateByService = (service: 'rideshare' | 'delivery' | 'executive') => {
    const match = templates.find((tpl) => {
      const line = `${strField(tpl, 'service_line', '')} ${strField(tpl, 'name', '')}`.toLowerCase();
      return line.includes(service);
    });
    if (match) selectTemplate(strField(match, 'id', ''));
  };

  const openNewKitDialog = () => {
    setNewKitName('');
    setNewKitClassification('rideshare');
    setNewKitOpen(true);
  };

  const createNewKit = () =>
    submit.run(async () => {
      const name = newKitName.trim();
      if (!name) throw new Error('Enter a kit name');
      const res = (await inventoryApi.createKitTemplate({
        name,
        classification: newKitClassification,
      })) as { template?: Record<string, unknown> };
      const id = strField(res.template ?? res, 'id', '');
      if (!id) throw new Error('Kit create failed');
      setNewKitOpen(false);
      setSelectedTemplateId(id);
      setLines([]);
      setLinkedTollTag(false);
      setLinkedFuelCard(false);
      await load.reload();
    });

  const compare = () => shell.openGap('kit-compare', { itemId: selectedTemplateId ?? null });

  const exportSpec = () =>
    submit.run(async () => {
      const res = await inventoryApi.kitsSpecPdf(selectedTemplateId ?? undefined);
      if (res.kind === 'pdf') downloadBlob('kit-spec.pdf', res.blob);
    });

  const deleteLine = (lineKey: string) => setLines((prev) => prev.filter((l) => l.key !== lineKey));

  const openLinePicker = () => {
    if (!catalogItems.length) return;
    setPickerOpen(true);
  };

  const closeLinePicker = () => setPickerOpen(false);

  const pickCatalogItem = (itemId: string) => {
    const item = catalogItems.find((i) => strField(i, 'id', '') === itemId);
    if (!item) return;
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        lineType: 'item',
        itemId,
        name: strField(item, 'name', '—'),
        qtyRequired: '1',
        required: true,
        blocksRoadClearance: false,
        installPosition: '',
        variantNote: '',
      },
    ]);
    setPickerOpen(false);
  };

  const updateLineQty = (lineKey: string, qty: string) =>
    setLines((prev) => prev.map((l) => (l.key === lineKey ? { ...l, qtyRequired: qty } : l)));

  const updateLineRequired = (lineKey: string, required: boolean) =>
    setLines((prev) => prev.map((l) => (l.key === lineKey ? { ...l, required } : l)));

  const updateLineInstallPosition = (lineKey: string, installPosition: string) =>
    setLines((prev) => prev.map((l) => (l.key === lineKey ? { ...l, installPosition } : l)));

  const toggleLinkedTollTag = () => setLinkedTollTag((v) => !v);
  const toggleLinkedFuelCard = () => setLinkedFuelCard((v) => !v);

  const moveLine = (lineKey: string, direction: 'up' | 'down') =>
    setLines((prev) => {
      const index = prev.findIndex((l) => l.key === lineKey);
      if (index < 0) return prev;
      const next = direction === 'up' ? index - 1 : index + 1;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [row] = copy.splice(index, 1);
      copy.splice(next, 0, row);
      return copy;
    });

  const saveDraft = () => submit.run(async () => {
    await persistDraft();
  });

  const requestPublishModal = () =>
    submit.run(async () => {
      await persistDraft();
      setShowMoveModal(true);
    });

  const cancelMoveModal = () => setShowMoveModal(false);

  const confirmPublish = (moveVehicles: boolean) =>
    submit.run(async () => {
      const versionId = draftVersionId || (await persistDraft());
      if (!selectedTemplateId) throw new Error('No template selected');
      await inventoryApi.publishKitTemplate(selectedTemplateId, {
        version_id: versionId,
        move_vehicles: moveVehicles,
        idempotency_key: crypto.randomUUID(),
      });
      setShowMoveModal(false);
      await shell.refresh();
      await load.reload();
    });

  const selectedTemplate =
    templates.find((t) => strField(t, 'id', '') === selectedTemplateId) ?? null;
  const versionLabel = strField(selectedTemplate ?? {}, 'version', '1');
  const applyVehicleCount = Number(strField(selectedTemplate ?? {}, 'vehicle_count', '0'));

  const linkedIntegrationCount = (linkedTollTag ? 1 : 0) + (linkedFuelCard ? 1 : 0);

  const totalLandedVal = useMemo(() => {
    let sum = 0;
    for (const line of lines) {
      const item = catalogItems.find((i) => strField(i, 'id', '') === line.itemId);
      const unit = item ? numField(item, 'avg_cost_jmd', numField(item, 'unit_cost', 0)) : 0;
      sum += unit * (Number(line.qtyRequired) || 1);
    }
    return formatJmd(sum || null);
  }, [lines, catalogItems]);

  const goTab = (tab: InventoryTabId) => shell.setTab(tab);

  const lineEditorRows: KitTemplateEditorLineRow[] = useMemo(
    () =>
      lines.map((line, index) => {
        const cat = catalogItems.find((i) => strField(i, 'id', '') === line.itemId);
        const baseRow = buildKitTemplateLineRow(
          {
            id: line.key,
            name: line.name,
            sku: strField(cat ?? {}, 'sku', '—'),
            qty: line.qtyRequired,
            category: strField(cat ?? {}, 'category', '—'),
          },
          index,
        );
        const locationLabel =
          line.installPosition.trim() || line.variantNote.trim() || strField(cat ?? {}, 'category', '—');
        return {
          ...baseRow,
          key: line.key,
          required: line.required,
          installPositionLabel: locationLabel,
          installPosition: line.installPosition,
        };
      }),
    [lines, catalogItems],
  );

  const hasAnyLine = lines.length > 0 || linkedTollTag || linkedFuelCard;
  const canPublish = Boolean(selectedTemplateId) && hasAnyLine;
  const publishDisabledReason = !selectedTemplateId
    ? 'Select a kit template'
    : !hasAnyLine
      ? 'Add at least one equipment line or linked record'
      : '';
  const addLineDisabledReason = catalogItems.length ? '' : 'Load catalog items before adding lines';

  const editorAuthorLabel = strField(selectedTemplate ?? {}, 'author_name', '—');

  const versionHistoryRows: KitTemplateVersionRow[] = useMemo(() => {
    const raw = (selectedTemplate?.version_history as Record<string, unknown>[] | undefined) ?? [];
    if (raw.length) {
      return raw.map((v) => ({
        version: strField(v, 'version', '—'),
        dateLabel: strField(v, 'published_at', strField(v, 'date', '—')),
        changeSummary: strField(v, 'summary', strField(v, 'change', '—')),
        authorLabel: strField(v, 'author_name', '—'),
        syncLabel: strField(v, 'sync_label', strField(v, 'status', '—')),
      }));
    }
    if (!selectedTemplate) return [];
    return [
      {
        version: versionLabel,
        dateLabel: strField(selectedTemplate, 'updated_at', '—'),
        changeSummary: strField(selectedTemplate, 'change_summary', 'Current template'),
        authorLabel: strField(selectedTemplate, 'author_name', '—'),
        syncLabel: strField(selectedTemplate, 'sync_status', '—'),
      },
    ];
  }, [selectedTemplate, versionLabel]);

  return {
    ...base,
    shell,
    submit,
    load,
    templates,
    catalogItems,
    selectedTemplateId,
    selectedTemplate,
    selectTemplate,
    selectTemplateByService,
    lines,
    lineEditorRows,
    linkedTollTag,
    linkedFuelCard,
    linkedIntegrationCount,
    toggleLinkedTollTag,
    toggleLinkedFuelCard,
    newTemplate: openNewKitDialog,
    newKitOpen,
    setNewKitOpen,
    newKitName,
    setNewKitName,
    newKitClassification,
    setNewKitClassification,
    createNewKit,
    compare,
    exportSpec,
    requestPublishModal,
    confirmPublish,
    cancelMoveModal,
    showMoveModal,
    deleteLine,
    addLine: openLinePicker,
    pickerOpen,
    closeLinePicker,
    pickCatalogItem,
    updateLineQty,
    updateLineRequired,
    updateLineInstallPosition,
    moveLine,
    saveDraft,
    versionLabel,
    applyVehicleCount,
    totalLandedVal,
    linesCount: lines.length,
    canPublish,
    publishDisabledReason,
    addLineDisabledReason,
    editorAuthorLabel,
    versionHistoryRows,
    goTab,
    strField,
  };
}
