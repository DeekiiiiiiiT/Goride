import { useEffect, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type ReportRow = Record<string, unknown>;

const CHIP_KINDS: Record<string, { kind: string; message: string }> = {
  replacement: {
    kind: 'replacement_en_route',
    message: 'Replacement is on the way.',
  },
  'hub-pickup': {
    kind: 'hub_collection_ready',
    message: 'Your replacement is ready to collect at the depot.',
  },
  urgent: {
    kind: 'urgent_safety_item',
    message: 'This is an urgent safety item — please resolve before your next trip.',
  },
};

/** Fleet driver-report dialog: loads one report + its real updates (IV-11, IV-14). */
export function useGapDriverReportUpdateForm(
  reportId: string | null | undefined,
  onClose?: () => void,
) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    if (!reportId) return { report: null as ReportRow | null, updates: [] as ReportRow[] };
    const data = (await inventoryApi.driverReport(reportId)) as { report?: ReportRow; updates?: ReportRow[] };
    return { report: data.report ?? null, updates: data.updates ?? [] };
  }, [reportId]);

  const report = load.data?.report ?? null;
  const updates = load.data?.updates ?? [];

  const [driverMessage, setDriverMessage] = useState('');
  const [resolutionType, setResolutionType] = useState<'stock' | 'nostock'>('stock');
  const [driverLiable, setDriverLiable] = useState(false);

  useEffect(() => {
    if (!report) {
      setDriverMessage('');
      return;
    }
    const existing = report.fleet_reply;
    setDriverMessage(existing != null ? String(existing) : '');
    setDriverLiable(Boolean(report.driver_liability));
  }, [report]);

  const postFleetUpdate = async (kind: string, note: string) => {
    if (!reportId) throw new Error('No report selected');
    const trimmed = note.trim();
    if (!trimmed) throw new Error('Enter a message for the driver');
    await inventoryApi.driverReportUpdate(reportId, { by_role: 'fleet', kind, note: trimmed }, crypto.randomUUID());
    setDriverMessage(trimmed);
    await shell.refresh();
  };

  const isFixed = String(report?.status ?? '') === 'fixed';
  const canSend = Boolean(reportId) && driverMessage.trim().length > 0 && !isFixed;

  const applyChip = (chip: string) =>
    submit.run(async () => {
      const preset = CHIP_KINDS[chip];
      if (!preset) throw new Error('Unknown quick reply');
      await postFleetUpdate(preset.kind, preset.message);
      await load.reload();
    });

  /**
   * Send + mark fixed. "Issue from stock" then opens the Issue dialog for that car and kit line,
   * so the stock really moves (the resolve call itself moves nothing).
   */
  const sendUpdate = () =>
    submit.run(async () => {
      if (!reportId || !report) throw new Error('No report selected');
      await postFleetUpdate('replacement_en_route', driverMessage);
      await inventoryApi.resolveDriverReport(reportId, {
        mode: resolutionType === 'stock' ? 'fixed_from_stock' : 'fixed_without_stock',
        note: driverMessage.trim(),
        fleet_reply: driverMessage.trim(),
        driver_liability: driverLiable,
      });
      await shell.refresh();
      const vehicleId = report.vehicle_id ? String(report.vehicle_id) : null;
      const lineId = report.kit_line_id ? String(report.kit_line_id) : null;
      if (resolutionType === 'stock' && vehicleId && lineId && report.item_id) {
        shell.openIssue({ vehicleId, kitLineIds: [lineId] });
        return;
      }
      onClose?.();
    });

  return {
    load,
    submit,
    report,
    updates,
    isFixed,
    driverMessage,
    setDriverMessage,
    resolutionType,
    setResolutionType,
    driverLiable,
    setDriverLiable,
    canSend,
    applyChip,
    sendUpdate,
  };
}
