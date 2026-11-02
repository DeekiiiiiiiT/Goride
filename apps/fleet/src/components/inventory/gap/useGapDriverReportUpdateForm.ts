import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type ReportRow = Record<string, unknown>;

const CHIP_KINDS: Record<
  string,
  { kind: string; message: string }
> = {
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

export function useGapDriverReportUpdateForm(
  reportId: string | null | undefined,
  onClose?: () => void,
) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const data = await inventoryApi.driverReports();
    return { items: asPagedItems(data as { items?: unknown[] }) as ReportRow[] };
  }, []);

  const reports = load.data?.items ?? [];

  const report = useMemo(() => {
    if (!reportId) return reports[0] ?? null;
    return reports.find((r) => String(r.id) === reportId) ?? null;
  }, [reportId, reports]);

  const [driverMessage, setDriverMessage] = useState('');
  const [resolutionType, setResolutionType] = useState<'stock' | 'nostock'>('stock');
  const [driverLiable, setDriverLiable] = useState(false);

  useEffect(() => {
    if (!report) {
      setDriverMessage('');
      return;
    }
    const existing = report.fleet_reply ?? report.fleetReply;
    setDriverMessage(existing != null ? String(existing) : '');
    setDriverLiable(Boolean(report.driver_liability));
  }, [report]);

  const reportIdResolved = reportId ?? (report?.id ? String(report.id) : null);

  const postFleetUpdate = async (kind: string, note: string) => {
    const id = reportIdResolved;
    if (!id) throw new Error('Select a report first');
    const trimmed = note.trim();
    if (!trimmed) throw new Error('Enter a message for the driver');
    await inventoryApi.driverReportUpdate(
      id,
      { by_role: 'fleet', kind, note: trimmed },
      crypto.randomUUID(),
    );
    setDriverMessage(trimmed);
    await shell.refresh();
  };

  const canSend = Boolean(reportIdResolved) && driverMessage.trim().length > 0;

  const payrollDeductionLabel = formatJmd(
    Number(report?.payroll_deduction_jmd ?? report?.replacement_cost_jmd ?? 0) || null,
  );

  const applyChip = (chip: string) =>
    submit.run(async () => {
      const preset = CHIP_KINDS[chip];
      if (!preset) throw new Error('Unknown quick reply');
      await postFleetUpdate(preset.kind, preset.message);
      onClose?.();
    });

  const sendUpdate = () =>
    submit.run(async () => {
      await postFleetUpdate('replacement_en_route', driverMessage);
      const id = reportIdResolved;
      if (id) {
        await inventoryApi.resolveDriverReport(id, {
          mode: resolutionType === 'stock' ? 'fixed_from_stock' : 'fixed_without_stock',
          note: driverMessage.trim(),
          fleet_reply: driverMessage.trim(),
          driver_liability: driverLiable,
          payroll_deduction: driverLiable,
        });
      }
      onClose?.();
    });

  return {
    load,
    submit,
    report,
    reports,
    reportCount: reports.length,
    driverMessage,
    setDriverMessage,
    resolutionType,
    setResolutionType,
    driverLiable,
    setDriverLiable,
    canSend,
    applyChip,
    sendUpdate,
    payrollDeductionLabel,
    formatJmd,
  };
}
