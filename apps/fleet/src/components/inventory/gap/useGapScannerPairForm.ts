import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type DeviceRow = Record<string, unknown>;

export function useGapScannerPairForm(onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [scannersPayload, locationsPayload] = await Promise.all([
      inventoryApi.scanners(),
      inventoryApi.locationsBins(),
    ]);
    return {
      items: (scannersPayload as { items?: DeviceRow[] }).items ?? [],
      locations: (locationsPayload as { locations?: Record<string, unknown>[] }).locations ?? [],
    };
  }, []);

  const scanners = load.data?.items ?? [];

  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [binLocationId, setBinLocationId] = useState('');

  const pendingDevice = useMemo(() => {
    if (selectedDeviceId) {
      return scanners.find((d) => String(d.id) === selectedDeviceId) ?? null;
    }
    return scanners.find((d) => !d.paired_at && d.pairing_code) ?? scanners[0] ?? null;
  }, [scanners, selectedDeviceId]);

  useEffect(() => {
    if (!scanners.length) {
      setSelectedDeviceId('');
      return;
    }
    if (!selectedDeviceId || !scanners.some((d) => String(d.id) === selectedDeviceId)) {
      const pick = scanners.find((d) => !d.paired_at && d.pairing_code) ?? scanners[0];
      setSelectedDeviceId(String(pick.id));
    }
  }, [scanners, selectedDeviceId]);

  useEffect(() => {
    if (pendingDevice?.pairing_code) setPairingCode(String(pendingDevice.pairing_code));
    if (pendingDevice?.label) setDeviceLabel(String(pendingDevice.label));
  }, [pendingDevice?.pairing_code, pendingDevice?.label, pendingDevice?.id]);

  const canPair = pairingCode.trim().length > 0;
  const pairedCount = scanners.filter((d) => d.paired_at).length;

  const pair = () =>
    submit.run(async () => {
      if (!canPair) throw new Error('Enter a pairing code');
      await inventoryApi.scannerPair({
        pairing_code: pairingCode.trim(),
        label: deviceLabel.trim() || null,
        device_id: selectedDeviceId || undefined,
        bin_location_id: binLocationId.trim() || undefined,
      });
      await load.reload();
      await shell.refresh();
      onClose?.();
    });

  const regenerateScanner = () =>
    submit.run(async () => {
      const id = selectedDeviceId || (pendingDevice?.id ? String(pendingDevice.id) : null);
      if (!id) throw new Error('Select a scanner device');
      const res = (await inventoryApi.regenerateScanner(id)) as { pairing_code?: string };
      if (res.pairing_code) setPairingCode(String(res.pairing_code));
      await load.reload();
      await shell.refresh();
    });

  const unpairScanner = () =>
    submit.run(async () => {
      const id = selectedDeviceId || (pendingDevice?.id ? String(pendingDevice.id) : null);
      if (!id) throw new Error('Select a scanner device');
      await inventoryApi.unpairScanner(id);
      await load.reload();
      await shell.refresh();
    });

  const formatPairingDisplay = (code: string) => {
    const clean = code.replace(/\W/g, '').toUpperCase();
    if (clean.length <= 3) return clean;
    const mid = Math.ceil(clean.length / 2);
    return `${clean.slice(0, mid)} · ${clean.slice(mid)}`;
  };

  return {
    load,
    submit,
    scanners,
    pairedCount,
    pendingDevice,
    selectedDeviceId,
    setSelectedDeviceId,
    pairingCode,
    setPairingCode,
    deviceLabel,
    setDeviceLabel,
    pairingDisplay: formatPairingDisplay(pairingCode),
    locations: load.data?.locations ?? [],
    binLocationId,
    setBinLocationId,
    canPair,
    pair,
    regenerateScanner,
    unpairScanner,
    onClose,
  };
}
