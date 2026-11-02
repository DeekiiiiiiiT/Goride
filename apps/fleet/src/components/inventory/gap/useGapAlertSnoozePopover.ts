import { useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapSubmit } from './useGapSubmit';

export type SnoozeDurationKey = '1d' | '3d' | '7d' | 'custom';

function daysForDuration(key: SnoozeDurationKey, customUntil: string): number | null {
  if (key === '1d') return 1;
  if (key === '3d') return 3;
  if (key === '7d') return 7;
  if (key === 'custom' && customUntil.trim()) return null;
  return 3;
}

export function useGapAlertSnoozePopover(alertId: string | null | undefined, onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const [duration, setDuration] = useState<SnoozeDurationKey>('3d');
  const [customUntil, setCustomUntil] = useState('');
  const [reason, setReason] = useState('');
  const [assignee, setAssignee] = useState('');

  const durationLabel = useMemo(() => {
    if (duration === '1d') return '1 day';
    if (duration === '3d') return '3 days';
    if (duration === '7d') return '1 week';
    return 'Custom date';
  }, [duration]);

  const canSnooze = Boolean(alertId) && reason.trim().length > 0;

  const snooze = () =>
    submit.run(async () => {
      if (!alertId) throw new Error('No alert selected');
      const note = reason.trim();
      if (!note) throw new Error('Provide an audit reason');
      const days = daysForDuration(duration, customUntil);
      const body: { days?: number; until?: string; reason?: string; assignee?: string } = {
        reason: note,
      };
      if (assignee.trim()) body.assignee = assignee.trim();
      if (duration === 'custom' && customUntil.trim()) {
        body.until = customUntil.trim();
      } else if (days != null) {
        body.days = days;
      } else {
        body.days = 3;
      }
      await inventoryApi.alertSnooze(alertId, body);
      await shell.refresh();
      onClose?.();
    });

  return {
    submit,
    duration,
    setDuration,
    customUntil,
    setCustomUntil,
    reason,
    setReason,
    assignee,
    setAssignee,
    durationLabel,
    canSnooze,
    snooze,
  };
}
