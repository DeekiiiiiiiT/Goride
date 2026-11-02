import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type RuleRow = Record<string, unknown>;

function humanAlertType(alertType: string): string {
  return alertType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function useGapSnoozeSettingsForm(onClose?: () => void) {
  const submit = useGapSubmit();
  const shell = useInventoryShell();
  const load = useGapLoad(async () => {
    const data = await inventoryApi.alertRules();
    const rules =
      (data as { rules?: RuleRow[] }).rules ??
      (data as { items?: RuleRow[] }).items ??
      [];
    return { rules };
  }, []);

  const [rules, setRules] = useState<RuleRow[]>([]);

  useEffect(() => {
    if (load.data?.rules) setRules(load.data.rules);
  }, [load.data?.rules]);

  const snoozeAllowedCount = useMemo(
    () => rules.filter((r) => r.can_snooze !== false).length,
    [rules],
  );
  const lockedCount = useMemo(
    () => rules.filter((r) => r.can_snooze === false).length,
    [rules],
  );

  const patchRule = (alertType: string, patch: Partial<RuleRow>) => {
    setRules((prev) =>
      prev.map((row) =>
        String(row.alert_type) === alertType ? { ...row, ...patch } : row,
      ),
    );
  };

  const canSave = rules.length > 0;

  const save = () =>
    submit.run(async () => {
      if (!canSave) throw new Error('No alert rules loaded');
      await inventoryApi.updateAlertRules(rules);
      await shell.refresh();
      onClose?.();
    });

  return {
    load,
    submit,
    rules,
    setRules,
    patchRule,
    humanAlertType,
    ruleCount: rules.length,
    snoozeAllowedCount,
    lockedCount,
    canSave,
    save,
  };
}
