import { useEffect, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';
import { useInventoryShell } from '../InventoryShellContext';

type SettingsRow = Record<string, unknown>;
type CategoryRow = Record<string, unknown>;

function parseMoney(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function useGapInventorySettingsForm(onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [settingsPayload, categoriesPayload] = await Promise.all([
      inventoryApi.settings(),
      inventoryApi.categories(),
    ]);
    return {
      settings: (settingsPayload as { settings?: SettingsRow | null }).settings ?? null,
      categories: (categoriesPayload as { items?: CategoryRow[] }).items ?? [],
    };
  }, []);

  const settings = load.data?.settings ?? null;
  const categories = load.data?.categories ?? [];
  const categoryCount = categories.length;

  const [fleetPhone, setFleetPhone] = useState('');
  const [safetyNotice, setSafetyNotice] = useState('');
  const [approvalThreshold, setApprovalThreshold] = useState('');
  const [monthlyCap, setMonthlyCap] = useState('');
  const [scrapNote, setScrapNote] = useState('');
  const [fiscalYear, setFiscalYear] = useState('4');
  const [settingsSection, setSettingsSection] = useState<'general' | 'categories' | 'scrap'>(
    'general',
  );
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (!settings) return;
    setFleetPhone(String(settings.fleet_support_phone ?? ''));
    setSafetyNotice(String(settings.safety_notice_text ?? ''));
    setApprovalThreshold(
      settings.approval_threshold_jmd != null ? String(settings.approval_threshold_jmd) : '',
    );
    setMonthlyCap(
      settings.monthly_procurement_cap_jmd != null
        ? String(settings.monthly_procurement_cap_jmd)
        : '',
    );
    setScrapNote(String(settings.scrap_note ?? ''));
    if (settings.fiscal_year_start_month != null) {
      setFiscalYear(String(settings.fiscal_year_start_month));
    }
  }, [settings]);

  const toggleCategory = (id: string, active: boolean) =>
    submit.run(async () => {
      await inventoryApi.patchCategory(id, { archive: !active });
      await load.reload();
      await shell.refresh();
    });

  const createCategory = () =>
    submit.run(async () => {
      const name = newCategoryName.trim();
      if (!name) throw new Error('Enter a category name');
      await inventoryApi.createCategory({ name });
      setNewCategoryName('');
      await load.reload();
      await shell.refresh();
    });

  const moveCategory = (id: string, direction: 'up' | 'down') =>
    submit.run(async () => {
      const sorted = [...categories].sort(
        (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
      );
      const idx = sorted.findIndex((c) => String(c.id) === id);
      if (idx < 0) return;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      const a = sorted[idx];
      const b = sorted[swapIdx];
      const aOrder = Number(a.sort_order ?? idx);
      const bOrder = Number(b.sort_order ?? swapIdx);
      await inventoryApi.patchCategory(String(a.id), { sort_order: bOrder });
      await inventoryApi.patchCategory(String(b.id), { sort_order: aOrder });
      await load.reload();
      await shell.refresh();
    });

  const saveFiscalYear = () =>
    submit.run(async () => {
      const month = Number.parseInt(fiscalYear, 10);
      await inventoryApi.updateSettings({
        fiscal_year_start_month: Number.isFinite(month) ? month : 4,
      });
      await shell.refresh();
    });

  const saveGeneral = () =>
    submit.run(async () => {
      await inventoryApi.updateSettings({
        fleet_support_phone: fleetPhone.trim() || null,
        safety_notice_text: safetyNotice.trim() || null,
      });
      await shell.refresh();
      onClose?.();
    });

  const saveScrapNote = () =>
    submit.run(async () => {
      await inventoryApi.updateSettings({
        scrap_note: scrapNote.trim() || null,
      });
      await shell.refresh();
      onClose?.();
    });

  const canSaveGeneral = !submit.saving;
  const canSaveScrapNote = !submit.saving;

  return {
    load,
    submit,
    categories,
    fleetPhone,
    setFleetPhone,
    safetyNotice,
    setSafetyNotice,
    approvalThreshold,
    setApprovalThreshold,
    monthlyCap,
    setMonthlyCap,
    scrapNote,
    setScrapNote,
    fiscalYear,
    setFiscalYear,
    categoryCount,
    canSaveGeneral,
    canSaveScrapNote,
    toggleCategory,
    saveFiscalYear,
    saveGeneral,
    saveScrapNote,
    settingsSection,
    setSettingsSection,
    newCategoryName,
    setNewCategoryName,
    createCategory,
    moveCategory,
  };
}
