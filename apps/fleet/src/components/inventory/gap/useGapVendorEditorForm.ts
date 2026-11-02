import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type VendorRow = Record<string, unknown>;
type StatRow = Record<string, unknown>;

function vendorCode(id: string) {
  return `VEN-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function vendorInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function useGapVendorEditorForm(vendorId: string | null | undefined, onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [vendors, stats] = await Promise.all([inventoryApi.vendors(), inventoryApi.vendorStats()]);
    return {
      vendors: asPagedItems(vendors as { items?: unknown[] }) as VendorRow[],
      stats: ((stats as { items?: StatRow[] }).items ?? []) as StatRow[],
    };
  }, []);

  const statsByVendor = useMemo(() => {
    const map = new Map<string, StatRow>();
    for (const s of load.data?.stats ?? []) {
      const id = String(s.vendor_id ?? '');
      if (id) map.set(id, s);
    }
    return map;
  }, [load.data?.stats]);

  const vendors = load.data?.vendors ?? [];

  const existing = useMemo(() => {
    if (!vendorId) return vendors[0] ?? null;
    return vendors.find((v) => String(v.id) === vendorId) ?? null;
  }, [vendorId, vendors]);

  const existingId = existing?.id ? String(existing.id) : null;
  const selectedStat = existingId ? statsByVendor.get(existingId) : undefined;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [tagDraft, setTagDraft] = useState('');

  useEffect(() => {
    if (!existing) {
      if (!vendorId) {
        setName('');
        setPhone('');
        setEmail('');
        setDescription('');
        setTags([]);
        setLeadTimeDays('');
        setIsActive(true);
      }
      return;
    }
    setName(String(existing.name ?? ''));
    setPhone(String(existing.phone ?? ''));
    setEmail(String(existing.email ?? ''));
    setDescription(String(existing.description ?? ''));
    setTags(Array.isArray(existing.tags) ? existing.tags.map(String) : []);
    setLeadTimeDays(
      existing.lead_time_days != null && existing.lead_time_days !== ''
        ? String(existing.lead_time_days)
        : '',
    );
    setIsActive(existing.is_active !== false);
  }, [existing, vendorId]);

  const vendorCount = vendors.length;
  const activeCount = vendors.filter((v) => v.is_active !== false).length;
  const openPoTotal = useMemo(
    () =>
      vendors.reduce((sum, v) => {
        const st = statsByVendor.get(String(v.id ?? ''));
        return sum + Number(st?.open_po_count ?? 0);
      }, 0),
    [vendors, statsByVendor],
  );
  const avgLeadDays = useMemo(() => {
    const vals = vendors
      .map((v) => Number(v.lead_time_days))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [vendors]);

  const canSave = name.trim().length > 0;

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setTagDraft('');
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((x) => x !== tag));

  const save = () =>
    submit.run(async () => {
      if (!canSave) throw new Error('Vendor name is required');
      const lead =
        leadTimeDays.trim() === '' ? null : Number.parseInt(leadTimeDays, 10);
      const body = {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        description: description.trim() || null,
        tags,
        lead_time_days: Number.isFinite(lead) ? lead : null,
        is_active: isActive,
      };
      const id = existingId;
      if (id) {
        await inventoryApi.patchVendor(id, body);
      } else {
        await inventoryApi.createVendor(body);
      }
      await shell.refresh();
      onClose?.();
    });

  const openPoCount = Number(selectedStat?.open_po_count ?? 0);
  const catalogSkuCount = Number(selectedStat?.catalog_sku_count ?? 0);
  const dispatchCount = Number(selectedStat?.dispatch_count ?? 0);
  const tierLabel = String(selectedStat?.tier_label ?? 'Standard');
  const ratingAvg = selectedStat?.rating_avg;
  const ratingCount = Number(selectedStat?.rating_count ?? 0);

  return {
    load,
    submit,
    vendors,
    statsByVendor,
    existing,
    existingId,
    vendorCode,
    vendorInitials,
    name,
    setName,
    phone,
    setPhone,
    email,
    setEmail,
    description,
    setDescription,
    tags,
    tagDraft,
    setTagDraft,
    addTag,
    removeTag,
    leadTimeDays,
    setLeadTimeDays,
    isActive,
    setIsActive,
    vendorCount,
    activeCount,
    openPoTotal,
    avgLeadDays,
    formatJmd,
    openPoCount,
    catalogSkuCount,
    dispatchCount,
    tierLabel,
    ratingAvg,
    ratingCount,
    canSave,
    save,
  };
}
