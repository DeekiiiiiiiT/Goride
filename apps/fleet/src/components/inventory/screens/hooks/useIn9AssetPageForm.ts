import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { buildAssetRow } from '../../inventoryViewRows';
import { useGapLoad } from '../../gap/useGapLoad';
import { useInScreenBase } from './useInShared';

export type AssetLogFilter = 'all' | 'incident' | 'custody';

/**
 * Stitch → data (In9 Asset page)
 * header name → AssetRow.name | serial field → AssetRow.serial | book value → valueLabel
 */
export function useIn9AssetPageForm() {
  const base = useInScreenBase();
  const { shell, submit, finishSuccess } = base;
  const assetId = shell.selectedAssetId ?? '';

  const load = useGapLoad(async () => {
    if (!assetId) return { events: [] as Record<string, unknown>[], documents: [] as Record<string, unknown>[] };
    const [events, documents] = await Promise.all([
      inventoryApi.assetEvents(assetId),
      inventoryApi.assetDocuments(assetId),
    ]);
    return {
      events: (events as { events?: Record<string, unknown>[] }).events ?? [],
      documents: (documents as { documents?: Record<string, unknown>[] }).documents ?? [],
    };
  }, [assetId]);

  const resolvedAsset =
    shell.assets.find((a) => strField(a, 'id', '') === assetId) ?? null;

  const assetRow = useMemo(
    () => (resolvedAsset ? buildAssetRow(resolvedAsset, formatJmd) : null),
    [resolvedAsset],
  );

  const [serial, setSerial] = useState('');
  const [docName, setDocName] = useState('');
  const [logFilter, setLogFilter] = useState<AssetLogFilter>('all');
  const [incidentNote, setIncidentNote] = useState('');

  useEffect(() => {
    if (!resolvedAsset) {
      setSerial('');
      return;
    }
    setSerial(strField(resolvedAsset, 'serial_number', strField(resolvedAsset, 'serial_no', '')));
  }, [resolvedAsset]);

  const valueLabel = formatJmd(
    resolvedAsset ? Number(strField(resolvedAsset, 'purchase_cost', '0')) || null : null,
  );

  const nextInspectionDueRaw = resolvedAsset
    ? strField(resolvedAsset, 'next_inspection_due', '')
    : '';
  const nextInspectionDueLabel = nextInspectionDueRaw
    ? nextInspectionDueRaw.slice(0, 10)
    : '—';

  const [inspectionDueDate, setInspectionDueDate] = useState('');
  const [inspectionNote, setInspectionNote] = useState('');

  useEffect(() => {
    setInspectionDueDate(nextInspectionDueRaw ? nextInspectionDueRaw.slice(0, 10) : '');
  }, [nextInspectionDueRaw]);

  const allEvents = load.data?.events ?? [];

  const totalRepairCostJmd = useMemo(() => {
    let sum = 0;
    for (const e of allEvents) {
      const t = strField(e, 'type', strField(e, 'event_type', '')).toLowerCase();
      if (t !== 'repair') continue;
      const cost = Number(e.cost_jmd ?? 0);
      if (Number.isFinite(cost)) sum += cost;
    }
    return sum;
  }, [allEvents]);

  const totalRepairCostLabel = formatJmd(totalRepairCostJmd > 0 ? totalRepairCostJmd : null);

  const saveNextInspection = () =>
    submit.run(async () => {
      if (!assetId) throw new Error('No asset');
      const note = inspectionNote.trim();
      if (!note) throw new Error('Add a note explaining the check date change');
      await inventoryApi.assetNextInspection(assetId, {
        next_inspection_due: inspectionDueDate.trim() || null,
        note,
      });
      setInspectionNote('');
      await shell.refresh();
      await load.reload();
    });

  const filteredEvents = useMemo(() => {
    if (logFilter === 'all') return allEvents;
    return allEvents.filter((e) => {
      const t = strField(e, 'type', strField(e, 'event_type', '')).toLowerCase();
      if (logFilter === 'incident') return t.includes('incident');
      return t.includes('custody') || t.includes('transfer') || t.includes('move');
    });
  }, [allEvents, logFilter]);

  const eventRows = useMemo(
    () =>
      filteredEvents.map((e) => ({
        id: strField(e, 'id', strField(e, 'reference', '')),
        label: strField(e, 'title', strField(e, 'body', strField(e, 'type', 'Event'))),
        actor: strField(e, 'actor_name', strField(e, 'created_by', '—')),
        when: strField(e, 'created_at', strField(e, 'occurred_at', '—')),
        type: strField(e, 'type', strField(e, 'event_type', '')),
        body: strField(e, 'body', strField(e, 'note', strField(e, 'description', ''))),
        poRefLabel: strField(e, 'po_number', strField(e, 'po_ref', '')),
        skuLabel: strField(e, 'sku', strField(e, 'item_sku', '')),
      })),
    [filteredEvents],
  );

  const linkedPoRef = strField(
    resolvedAsset ?? {},
    'po_number',
    strField(resolvedAsset ?? {}, 'linked_po_ref', '—'),
  );
  const assetSkuLabel = assetRow?.serial ?? assetRow?.category ?? '—';

  const hasAsset = Boolean(resolvedAsset && assetId);
  const saveSerialDisabledReason =
    !hasAsset ? 'No asset selected' : !serial.trim() ? 'Enter a serial number' : '';

  const logCounts = useMemo(
    () => ({
      all: allEvents.length,
      incident: allEvents.filter((e) =>
        strField(e, 'type', strField(e, 'event_type', '')).toLowerCase().includes('incident'),
      ).length,
      custody: allEvents.filter((e) => {
        const t = strField(e, 'type', strField(e, 'event_type', '')).toLowerCase();
        return t.includes('custody') || t.includes('transfer') || t.includes('move');
      }).length,
    }),
    [allEvents],
  );

  const openMoveDialog = () => {
    if (!assetId) return;
    shell.openModal('asset-move');
  };

  const openRepairDialog = () => {
    if (!assetId) return;
    shell.openModal('asset-repair');
  };

  const openConditionDialog = () => {
    if (!assetId) return;
    shell.openModal('asset-condition');
  };

  const retire = () =>
    submit.run(async () => {
      if (!assetId) throw new Error('No asset');
      await inventoryApi.assetRetire(assetId, {});
      await finishSuccess();
    });

  const saveSerial = () =>
    submit.run(async () => {
      if (!assetId || !serial.trim()) throw new Error('Serial required');
      await inventoryApi.assetSerial(assetId, serial.trim());
      await shell.refresh();
    });

  const uploadDocument = () =>
    submit.run(async () => {
      if (!assetId || !docName.trim()) throw new Error('Document name required');
      await inventoryApi.assetAddDocument(assetId, {
        name: docName.trim(),
        url: null,
      });
      setDocName('');
      await load.reload();
    });

  const addIncidentNote = () =>
    submit.run(async () => {
      if (!assetId || !incidentNote.trim()) throw new Error('Note required');
      await inventoryApi.assetAddEvent(assetId, {
        type: 'incident',
        body: incidentNote.trim(),
      });
      setIncidentNote('');
      await load.reload();
    });

  const copySerial = async () => {
    if (!serial.trim()) return;
    await navigator.clipboard.writeText(serial.trim());
    toast.success('Copied');
  };

  const docUrl = (doc: Record<string, unknown>) =>
    strField(doc, 'signed_url', strField(doc, 'url', ''));

  const openDocument = (doc: Record<string, unknown>) => {
    const url = docUrl(doc);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const downloadDocument = (doc: Record<string, unknown>) => {
    const url = docUrl(doc);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = strField(doc, 'name', 'document');
    a.rel = 'noopener noreferrer';
    a.click();
  };

  /** In-app confirm for Retire (no browser pop-ups). */
  const [confirmRetire, setConfirmRetire] = useState(false);
  const retireConfirmed = () => setConfirmRetire(true);

  return {
    ...base,
    load,
    submit,
    shell,
    assetId,
    asset: resolvedAsset,
    assetRow,
    hasAsset,
    eventRows,
    linkedPoRef,
    assetSkuLabel,
    events: filteredEvents,
    allEvents,
    documents: load.data?.documents ?? [],
    serial,
    setSerial,
    docName,
    setDocName,
    incidentNote,
    setIncidentNote,
    logFilter,
    setLogFilter,
    logCounts,
    valueLabel,
    nextInspectionDueLabel,
    inspectionDueDate,
    setInspectionDueDate,
    inspectionNote,
    setInspectionNote,
    saveNextInspection,
    totalRepairCostJmd,
    totalRepairCostLabel,
    formatJmd,
    openMoveDialog,
    openRepairDialog,
    openConditionDialog,
    retire,
    saveSerial,
    saveSerialDisabledReason,
    uploadDocument,
    addIncidentNote,
    copySerial,
    openDocument,
    downloadDocument,
    retireConfirmed,
    confirmRetire,
    setConfirmRetire,
    closeAssetPage: () => shell.closeModal(),
    strField,
  };
}
