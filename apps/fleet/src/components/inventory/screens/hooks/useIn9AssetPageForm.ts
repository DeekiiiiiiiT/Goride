import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { useGapLoad } from '../../gap/useGapLoad';
import { useInScreenBase } from './useInShared';

export type AssetLogFilter = 'all' | 'incident' | 'custody';

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

  const [serial, setSerial] = useState('');
  const [docName, setDocName] = useState('');
  const [logFilter, setLogFilter] = useState<AssetLogFilter>('all');
  const [incidentNote, setIncidentNote] = useState('');

  useEffect(() => {
    if (!resolvedAsset) return;
    setSerial(strField(resolvedAsset, 'serial_number', strField(resolvedAsset, 'serial_no', '')));
  }, [resolvedAsset]);

  const valueLabel = formatJmd(
    resolvedAsset ? Number(strField(resolvedAsset, 'book_value_jmd', '0')) : null,
  );

  const allEvents = load.data?.events ?? [];

  const filteredEvents = useMemo(() => {
    if (logFilter === 'all') return allEvents;
    return allEvents.filter((e) => {
      const t = strField(e, 'type', strField(e, 'event_type', '')).toLowerCase();
      if (logFilter === 'incident') return t.includes('incident');
      return t.includes('custody') || t.includes('transfer') || t.includes('move');
    });
  }, [allEvents, logFilter]);

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

  const moveAsset = () =>
    submit.run(async () => {
      if (!assetId) throw new Error('No asset');
      await inventoryApi.assetMove(assetId, { note: 'Moved from asset page' });
      await shell.refresh();
    });

  const sendRepair = () =>
    submit.run(async () => {
      if (!assetId) throw new Error('No asset');
      await inventoryApi.assetRepair(assetId, {});
      await shell.refresh();
    });

  const markFaulty = () =>
    submit.run(async () => {
      if (!assetId) throw new Error('No asset');
      await inventoryApi.assetFaulty(assetId, {});
      await shell.refresh();
    });

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

  const confirmAction = (message: string, run: () => void) => {
    if (window.confirm(message)) run();
  };

  const moveAssetConfirmed = () =>
    confirmAction('Move this asset to a new location?', () => void moveAsset());

  const sendRepairConfirmed = () =>
    confirmAction('Send this asset to repair?', () => void sendRepair());

  const markFaultyConfirmed = () =>
    confirmAction('Mark this asset as faulty?', () => void markFaulty());

  const retireConfirmed = () =>
    confirmAction('Retire this asset permanently?', () => void retire());

  return {
    ...base,
    load,
    submit,
    shell,
    assetId,
    asset: resolvedAsset,
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
    formatJmd,
    moveAsset,
    sendRepair,
    markFaulty,
    retire,
    saveSerial,
    uploadDocument,
    addIncidentNote,
    copySerial,
    openDocument,
    downloadDocument,
    moveAssetConfirmed,
    sendRepairConfirmed,
    markFaultyConfirmed,
    retireConfirmed,
    closeAssetPage: () => shell.closeModal(),
    strField,
  };
}
