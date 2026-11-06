import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { asPagedItems, strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { useGapLoad } from '../../gap/useGapLoad';
import { parseMoneyInput, useInScreenBase, type Row } from './useInShared';

export type ReceiveLine = {
  key: string;
  itemId: string;
  name: string;
  sku: string;
  qty: string;
  unitPrice: string;
  serial: string;
};

export function useIn4ReceiveForm() {
  const base = useInScreenBase();
  const { shell, live, submit, finishSuccess, close } = base;
  const load = useGapLoad(async () => {
    const [items, locations] = await Promise.all([
      inventoryApi.items(),
      inventoryApi.locationsBins(),
    ]);
    return {
      items: asPagedItems(items as { items?: unknown[] }),
      locations: (locations as { locations?: Row[] }).locations ?? [],
    };
  }, []);

  const [locationId, setLocationId] = useState('');
  const [receivedOn, setReceivedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [freightCost, setFreightCost] = useState('0');
  const [dutyCost, setDutyCost] = useState('0');
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [addItemId, setAddItemId] = useState('');

  const items = load.data?.items ?? [];
  const locations = load.data?.locations ?? [];

  useEffect(() => {
    if (locationId || !locations.length) return;
    const primary =
      locations.find((l) => String(l.is_primary ?? l.primary) === 'true') ?? locations[0];
    if (primary) setLocationId(String(primary.id ?? ''));
  }, [locations, locationId]);

  useEffect(() => {
    if (lines.length || !items.length) return;
    const first = items[0];
    setLines([
      {
        key: crypto.randomUUID(),
        itemId: String(first.id ?? ''),
        name: String(first.name ?? '—'),
        sku: String(first.sku ?? '—'),
        qty: '1',
        unitPrice: String(first.unit_cost_jmd ?? first.default_cost_jmd ?? '0'),
        serial: '',
      },
    ]);
  }, [items, lines.length]);

  const location = locations.find((l) => String(l.id) === locationId) ?? null;
  const locationLabel = location
    ? String(location.name ?? location.code ?? live.hubName)
    : live.hubName;

  const subtotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const q = Number(line.qty);
      const u = parseMoneyInput(line.unitPrice);
      if (!Number.isFinite(q) || q <= 0) return sum;
      return sum + q * u;
    }, 0);
  }, [lines]);

  const extraTotal = parseMoneyInput(freightCost) + parseMoneyInput(dutyCost);
  const grandTotal = subtotal + extraTotal;
  const subtotalLabel = formatJmd(subtotal);
  const grandTotalLabel = formatJmd(grandTotal);

  const canSubmit =
    Boolean(locationId) &&
    lines.length > 0 &&
    lines.every((l) => l.itemId && Number(l.qty) > 0);

  const addLine = () => {
    const item = items.find((it) => String(it.id) === addItemId) ?? items[0];
    if (!item) return;
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        itemId: String(item.id ?? ''),
        name: String(item.name ?? '—'),
        sku: String(item.sku ?? '—'),
        qty: '1',
        unitPrice: String(item.unit_cost_jmd ?? item.default_cost_jmd ?? '0'),
        serial: '',
      },
    ]);
    setAddItemId('');
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const updateLine = (key: string, patch: Partial<ReceiveLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const lineUnitTotal = (line: ReceiveLine) => {
    const q = Number(line.qty);
    const u = parseMoneyInput(line.unitPrice);
    if (!Number.isFinite(q) || q <= 0) return 0;
    return q * u;
  };

  const receive = () =>
    submit.run(async () => {
      if (!canSubmit) throw new Error('Add at least one line with quantity');
      const costs: { kind: string; amount: number }[] = [];
      const freight = parseMoneyInput(freightCost);
      const duty = parseMoneyInput(dutyCost);
      if (freight > 0) costs.push({ kind: 'freight', amount: freight });
      if (duty > 0) costs.push({ kind: 'duty', amount: duty });

      const payloadLines = lines.map((line) => ({
        item_id: line.itemId,
        qty: Number(line.qty),
        unit_price: parseMoneyInput(line.unitPrice),
        serial_number: line.serial.trim() || null,
      }));

      const key = newInventoryIdempotencyKey('receive');
      await inventoryApi.receive(
        {
          receipt: {
            location_id: locationId,
            vendor_id: null,
            purchase_order_id: null,
            received_on: receivedOn,
          },
          lines: payloadLines,
          costs,
        },
        key,
      );
      await finishSuccess();
    });

  const focusFirstLineItem = () => {
    document.getElementById('in4-receive-first-item')?.focus();
  };

  return {
    ...base,
    load,
    items,
    locations,
    locationId,
    setLocationId,
    receivedOn,
    setReceivedOn,
    freightCost,
    setFreightCost,
    dutyCost,
    setDutyCost,
    lines,
    addLine,
    removeLine,
    updateLine,
    addItemId,
    setAddItemId,
    locationLabel,
    subtotalLabel,
    grandTotalLabel,
    lineCountLabel: String(lines.length),
    lineUnitTotal,
    formatJmd,
    canSubmit,
    receive,
    focusFirstLineItem,
    strField,
  };
}
