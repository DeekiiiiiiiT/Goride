import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { formatJmd } from '../inventoryFormat';
import { downloadText } from '../inventoryDownload';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type LocRow = Record<string, unknown>;
type BinRow = Record<string, unknown>;

function locKind(row: LocRow): string {
  return String(row.kind ?? row.location_type ?? 'warehouse');
}

export function useGapLocationsBinsForm(onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => inventoryApi.locationsBins(), []);

  const locations = (load.data?.locations ?? []) as LocRow[];
  const bins = ((load.data as { bins?: BinRow[] })?.bins ?? []) as BinRow[];

  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedBinId, setSelectedBinId] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [binCode, setBinCode] = useState('');
  const [binZone, setBinZone] = useState('');
  const [binLocationId, setBinLocationId] = useState('');
  const [binFilter, setBinFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [locationKind, setLocationKind] = useState('warehouse');
  const [locationIsSecure, setLocationIsSecure] = useState('standard');

  useEffect(() => {
    if (!locations.length) {
      setSelectedLocationId('');
      return;
    }
    if (!selectedLocationId || !locations.some((l) => String(l.id) === selectedLocationId)) {
      const def = locations.find((l) => l.is_default) ?? locations[0];
      setSelectedLocationId(String(def.id));
    }
  }, [locations, selectedLocationId]);

  useEffect(() => {
    if (binLocationId) return;
    if (selectedLocationId) setBinLocationId(selectedLocationId);
  }, [selectedLocationId, binLocationId]);

  const selectedLocation = useMemo(
    () => locations.find((l) => String(l.id) === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  );

  useEffect(() => {
    if (!selectedLocation) return;
    setLocationName(String(selectedLocation.name ?? ''));
    setLocationCode(String(selectedLocation.code ?? ''));
    setLocationAddress(String(selectedLocation.address ?? ''));
    setLocationKind(String(selectedLocation.kind ?? locKind(selectedLocation)));
    setLocationIsSecure(selectedLocation.is_secure ? 'secure' : 'standard');
  }, [selectedLocation]);

  const selectedBin = useMemo(
    () => bins.find((b) => String(b.id) === selectedBinId) ?? null,
    [bins, selectedBinId],
  );

  useEffect(() => {
    if (!selectedBin) return;
    setBinCode(String(selectedBin.code ?? ''));
    setBinZone(String(selectedBin.zone ?? ''));
    if (selectedBin.location_id) setBinLocationId(String(selectedBin.location_id));
  }, [selectedBin]);

  const utilizationPct = useMemo(() => {
    if (!selectedLocation) return 0;
    const cap = Number(selectedLocation.capacity_units ?? selectedLocation.capacity ?? 0);
    const used = Number(selectedLocation.used_units ?? selectedLocation.stock_units ?? 0);
    if (cap > 0) return Math.min(100, Math.round((used / cap) * 100));
    const pct = Number(selectedLocation.utilization_pct ?? selectedLocation.utilizationPct);
    return Number.isFinite(pct) ? Math.min(100, Math.round(pct)) : 0;
  }, [selectedLocation]);

  const filteredLocations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((loc) => {
      const code = String(loc.code ?? '').toLowerCase();
      const name = String(loc.name ?? '').toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [locations, searchQuery]);

  const warehouses = useMemo(
    () => filteredLocations.filter((l) => locKind(l) === 'warehouse' || locKind(l) === 'virtual'),
    [filteredLocations],
  );
  const vehicles = useMemo(
    () => filteredLocations.filter((l) => locKind(l) === 'vehicle'),
    [filteredLocations],
  );
  const people = useMemo(
    () => filteredLocations.filter((l) => locKind(l) === 'person'),
    [filteredLocations],
  );

  const binsForSelected = useMemo(() => {
    if (!selectedLocationId) return [];
    const q = binFilter.trim().toLowerCase();
    return bins.filter((b) => {
      if (String(b.location_id) !== selectedLocationId) return false;
      if (!q) return true;
      const code = String(b.code ?? '').toLowerCase();
      const zone = String(b.zone ?? '').toLowerCase();
      return code.includes(q) || zone.includes(q);
    });
  }, [bins, selectedLocationId, binFilter]);

  const canSaveLocation = locationName.trim().length > 0 && locationCode.trim().length > 0;
  const canSaveBin = binCode.trim().length > 0 && binLocationId.trim().length > 0;
  const canPatchLocation = Boolean(selectedLocationId) && canSaveLocation;
  const canPatchBin = Boolean(selectedBinId) && canSaveBin;

  const saveLocation = () =>
    submit.run(async () => {
      if (!canSaveLocation) throw new Error('Enter location code and name');
      await inventoryApi.createLocation({
        name: locationName.trim(),
        code: locationCode.trim(),
        address: locationAddress.trim() || null,
      });
      setLocationName('');
      setLocationCode('');
      setLocationAddress('');
      await load.reload();
      await shell.refresh();
    });

  const patchLocation = () =>
    submit.run(async () => {
      if (!canPatchLocation) throw new Error('Select a location with code and name');
      await inventoryApi.patchLocation(selectedLocationId, {
        name: locationName.trim(),
        code: locationCode.trim(),
        address: locationAddress.trim() || null,
        kind: locationKind,
        is_secure: locationIsSecure !== 'standard',
      });
      await load.reload();
      await shell.refresh();
    });

  const archiveLocation = () =>
    submit.run(async () => {
      if (!selectedLocationId) throw new Error('Select a location');
      await inventoryApi.patchLocation(selectedLocationId, { archive: true, is_active: false });
      await load.reload();
      await shell.refresh();
    });

  const saveBin = () =>
    submit.run(async () => {
      if (!canSaveBin) throw new Error('Choose a location and enter a bin code');
      await inventoryApi.createBin({
        location_id: binLocationId,
        code: binCode.trim(),
        zone: binZone.trim() || null,
      });
      setBinCode('');
      setBinZone('');
      await load.reload();
      await shell.refresh();
    });

  const patchBin = () =>
    submit.run(async () => {
      if (!canPatchBin) throw new Error('Select a bin to update');
      await inventoryApi.patchBin(selectedBinId, {
        code: binCode.trim(),
        zone: binZone.trim() || null,
        location_id: binLocationId,
      });
      await load.reload();
      await shell.refresh();
    });

  const archiveBin = () =>
    submit.run(async () => {
      if (!selectedBinId) throw new Error('Select a bin');
      await inventoryApi.patchBin(selectedBinId, { archive: true });
      await load.reload();
      await shell.refresh();
    });

  const locationPlate = (row: LocRow) => String(row.plate ?? row.code ?? '—');
  const locationSubtitle = (row: LocRow) =>
    String(row.locker_label ?? row.description ?? row.address ?? '—');
  const locationStatus = (row: LocRow) => String(row.status_label ?? row.status ?? '—');
  const locationItemCount = (row: LocRow) => Number(row.item_count ?? row.items_count ?? 0);
  const locationStockValueLabel = (row: LocRow) =>
    formatJmd(Number(row.stock_value_jmd ?? row.valuation_jmd ?? 0) || null);

  const selectedStockValueLabel = formatJmd(
    Number(
      selectedLocation?.stock_value_jmd ??
        selectedLocation?.valuation_jmd ??
        selectedLocation?.total_value_jmd ??
        0,
    ) || null,
  );

  const downloadLabelSheet = () => {
    const code = selectedLocation ? String(selectedLocation.code ?? 'location') : 'location';
    const lines = binsForSelected.map((b) => `${String(b.code ?? '')},${String(b.zone ?? '')}`).join('\n');
    downloadText(`${code}-bins.csv`, `code,zone\n${lines}`);
  };

  return {
    load,
    submit,
    locations,
    bins,
    warehouses,
    vehicles,
    people,
    selectedLocation,
    selectedLocationId,
    setSelectedLocationId,
    selectedBinId,
    setSelectedBinId,
    binsForSelected,
    utilizationPct,
    locationName,
    setLocationName,
    locationCode,
    setLocationCode,
    locationAddress,
    setLocationAddress,
    binCode,
    setBinCode,
    binZone,
    setBinZone,
    binLocationId,
    setBinLocationId,
    binFilter,
    setBinFilter,
    searchQuery,
    setSearchQuery,
    locationKind,
    setLocationKind,
    locationIsSecure,
    setLocationIsSecure,
    canSaveLocation,
    canSaveBin,
    canPatchLocation,
    canPatchBin,
    saveLocation,
    patchLocation,
    archiveLocation,
    saveBin,
    patchBin,
    archiveBin,
    onClose,
    locationPlate,
    locationSubtitle,
    locationStatus,
    locationItemCount,
    locationStockValueLabel,
    selectedStockValueLabel,
    downloadLabelSheet,
    formatJmd,
  };
}
