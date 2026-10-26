import { plugSend, publicGet } from '../api';
import { readQueue, readStationCache, writeStationCache } from '../offline';
import { onPlugClick } from '../shell/actions';
import { catalogVariant, deviceFix, rememberVehicle, vehicleId } from './facts';
import { getPlugRuntime } from './click';

type Vehicle = {
  id: string;
  nickname?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  catalog_variant_id?: string | null;
  starting_odometer?: number | null;
};

type Station = {
  id: string;
  name: string;
  brand?: string | null;
  address?: string | null;
  lat?: number;
  lng?: number;
  pcode?: string | null;
  prices?: Record<string, number>;
  price_updated_at?: string | null;
};

type TollPlaza = { id?: string; name?: string; highway?: string; prices?: unknown };

const LAST_FILL = 'plug-last-fill';

export type SavedFill = {
  stationName?: string;
  grade?: string;
  amount?: number;
  litres?: number;
  odometer?: number;
  savedAt?: string;
};

export function rememberFill(fill: SavedFill) {
  sessionStorage.setItem(LAST_FILL, JSON.stringify(fill));
}

function readFill(): SavedFill | null {
  try {
    const raw = sessionStorage.getItem(LAST_FILL);
    return raw ? JSON.parse(raw) as SavedFill : null;
  } catch {
    return null;
  }
}

type FuelLog = {
  station_id?: string | null;
  grade?: string | null;
  amount?: number | null;
  litres?: number | null;
  odometer?: number | null;
  price_per_litre?: number | null;
  created_at?: string | null;
};

function replaceText(root: ParentNode, from: string, to: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue?.includes(from)) node.nodeValue = node.nodeValue.split(from).join(to);
  }
}

function slotText(root: ParentNode, slot: string, text: string) {
  root.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`).forEach((node) => {
    node.textContent = text;
  });
}

function setSlot(root: ParentNode, slot: string, text: string | null) {
  root.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`).forEach((node) => {
    const row = (node.closest('[data-slot-row]') as HTMLElement | null) || node;
    if (!text) {
      row.style.display = 'none';
      if (node !== row) node.textContent = '';
      return;
    }
    node.textContent = text;
    row.style.display = '';
    row.classList.remove('hidden');
  });
}

function gradeLabel(grade?: string | null): string {
  const key = String(grade || '').toLowerCase();
  if (key === 'e10_90') return 'E-10 90';
  if (key === 'ulsd') return 'ULSD';
  if (key === 'diesel') return 'Diesel';
  if (key === 'e10_87') return 'E-10 87';
  return key ? key.replace(/_/g, ' ') : 'Fuel';
}

function money(value: number): string {
  return `J$${Number(value).toFixed(2)}`;
}

function whenLabel(value: string, withTime: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (!withTime) return date.toLocaleDateString('en-JM', { day: 'numeric', month: 'short', year: 'numeric' });
  return date.toLocaleString('en-JM', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function daysUntil(value: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

function reminderTitle(kind: string): string {
  const key = kind.toLowerCase();
  if (key.includes('fitness')) return 'Certificate of Fitness';
  if (key.includes('insur')) return 'Motor Vehicle Insurance';
  if (key.includes('licen')) return "Driver's Licence";
  if (key.includes('tax') || key.includes('regist')) return 'Road Tax & Registration';
  return kind;
}

function readingLabel(value: number | null): string {
  return value == null ? 'No reading yet' : `${Number(value).toLocaleString('en-JM')} km`;
}

function asKm(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function note(root: HTMLElement, text: string, role: 'status' | 'alert') {
  if (root.querySelector('[data-fill-note]')) return;
  const line = document.createElement('p');
  line.dataset.fillNote = '1';
  line.setAttribute('role', role);
  line.className = 'px-4 py-3 text-sm';
  line.textContent = text;
  root.prepend(line);
}

function carLabel(car: Vehicle): string {
  return car.nickname || [car.year, car.make, car.model].filter(Boolean).join(' ') || 'Your car';
}

async function garage(): Promise<Vehicle[]> {
  const body = await plugSend<{ vehicles: Vehicle[] }>('/garage', 'GET');
  return body.vehicles || [];
}

async function fillVehicle(root: HTMLElement) {
  let cars: Vehicle[] = [];
  try {
    cars = await garage();
  } catch {
    cars = [];
  }
  const id = vehicleId();
  const car = cars.find((row) => row.id === id) || cars[0];
  if (!car) {
    slotText(root, 'car', 'Add a car');
    slotText(root, 'last-reading', 'No reading yet');
    paintGps(root);
    return;
  }
  rememberVehicle(car);
  slotText(root, 'car', carLabel(car));
  const reading = await lastReading(car);
  const odo = root.querySelector('[data-slot="odometer"]');
  if (odo) odo.textContent = reading == null ? '' : Number(reading).toLocaleString('en-JM');
  slotText(root, 'last-reading', readingLabel(reading));
  paintSinceLast(root, reading);
  paintGps(root);
}

async function lastReading(car: Vehicle | undefined): Promise<number | null> {
  if (!car) return null;
  try {
    const body = await plugSend<{ logs: FuelLog[] }>(`/fuel-logs?vehicleId=${encodeURIComponent(car.id)}`, 'GET');
    const logged = (body.logs || []).map((row) => asKm(row.odometer)).find((value) => value != null);
    if (logged != null) return logged;
  } catch {
    /* A signed-out screen still shows the saved starting reading. */
  }
  return asKm(car.starting_odometer);
}

function paintGps(root: HTMLElement) {
  const name = sessionStorage.getItem('plug-station-name');
  const accuracy = Number(sessionStorage.getItem('plug-accuracy'));
  const parts: string[] = [];
  if (accuracy > 0 && accuracy <= 100) parts.push(`GPS ±${Math.round(accuracy)} m`);
  if (name) parts.push(name);
  setSlot(root, 'gps', parts.length ? parts.join(' · ') : null);
}

function paintSinceLast(root: HTMLElement, last: number | null) {
  const current = asKm(String(sessionStorage.getItem('plug-odometer') || '').replace(/,/g, ''));
  if (last == null || current == null) {
    setSlot(root, 'since-last', null);
    return;
  }
  const distance = Math.round(current - last);
  setSlot(root, 'since-last', distance > 0 ? `${distance.toLocaleString('en-JM')} km` : null);
}

function paintPrices(root: HTMLElement, station: Station) {
  const prices = station.prices || {};
  root.querySelectorAll<HTMLElement>('[data-slot="prices"]').forEach((slot) => {
    slot.textContent = '';
    Object.entries(prices).forEach(([grade, value]) => {
      const amount = Number(value);
      if (!Number.isFinite(amount)) return;
      const row = document.createElement('div');
      row.className = 'p-3 rounded-xl bg-surface-container-low flex items-center justify-between';
      row.dataset.liveRow = 'station';
      row.dataset.liveName = station.name;
      const name = document.createElement('span');
      name.className = 'font-label-lg text-on-surface';
      name.textContent = gradeLabel(grade);
      const price = document.createElement('span');
      price.className = 'font-bold text-on-surface';
      price.textContent = money(amount);
      row.append(name, price);
      slot.appendChild(row);
    });
  });
  const when = station.price_updated_at ? new Date(station.price_updated_at) : null;
  setSlot(root, 'price-updated', when && !Number.isNaN(when.getTime()) ? `Updated ${when.toLocaleDateString('en-JM')}` : null);
}

async function fillGarage(root: HTMLElement) {
  const cars = await garage();
  const cards = [...root.querySelectorAll('h3')].map((heading) => heading.closest('div.w-full')).filter((card): card is HTMLElement => Boolean(card));
  if (!cars.length) {
    note(root, 'No cars in this garage yet.', 'status');
    cards.forEach((card) => card.remove());
    return;
  }
  const template = cards[0];
  const parent = template?.parentElement;
  if (!template || !parent) return;
  cards.slice(1).forEach((card) => card.remove());
  cars.forEach((car, index) => {
    const card = index === 0 ? template : template.cloneNode(true) as HTMLElement;
    const name = carLabel(car);
    slotText(card, 'car', name);
    card.querySelectorAll('h3').forEach((heading) => { heading.textContent = name; });
    card.dataset.vehicleId = car.id;
    card.addEventListener('click', () => { getPlugRuntime().go(`/garage/${car.id}`); });
    if (index > 0) parent.appendChild(card);
    rememberVehicle(car);
  });
  const count = root.querySelector('p');
  if (count && /vehicles registered/i.test(count.textContent || '')) {
    count.textContent = `${cars.length} vehicle${cars.length === 1 ? '' : 's'}`;
  }
}

async function fillStation(root: HTMLElement) {
  const id = decodeURIComponent((window.location.hash.match(/\/stations\/([^/?]+)/) || [])[1] || sessionStorage.getItem('plug-station') || '');
  if (!id) return;
  const body = await publicGet<{ station: Station }>(`/stations/${id}`);
  const station = body.station;
  if (!station) return;
  sessionStorage.setItem('plug-station', station.id);
  sessionStorage.setItem('plug-station-name', station.name);
  slotText(root, 'station-name', station.name);
  root.querySelectorAll<HTMLElement>('[data-slot="station-name"]').forEach((node) => {
    node.dataset.liveName = station.name;
    node.dataset.liveRow = 'station';
  });
  const brand = station.brand?.trim() || '';
  setSlot(root, 'brand', brand || null);
  setSlot(root, 'address', station.address?.trim() || null);
  paintPrices(root, station);
  paintGps(root);
}

function kmBetween(lat: number, lng: number): string | null {
  const fix = deviceFix();
  if (!fix || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat - fix.lat);
  const dLng = toRad(lng - fix.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(fix.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(a));
  if (!Number.isFinite(km)) return null;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

function priceFor(station: Station, grade: string): number | null {
  const value = Number(station.prices?.[grade]);
  return Number.isFinite(value) ? value : null;
}

async function loadStations(offlineOnly: boolean): Promise<Station[]> {
  if (offlineOnly) return readStationCache();
  try {
    const body = await publicGet<{ stations: Station[] }>('/stations');
    const rows = body.stations || [];
    writeStationCache(rows);
    return rows;
  } catch {
    return readStationCache();
  }
}

function paintStationRows(root: HTMLElement, stations: Station[], empty: string) {
  let slot = root.querySelector<HTMLElement>('[data-live-list="stations"]');
  if (!slot) {
    slot = document.createElement('div');
    slot.dataset.liveList = 'stations';
    slot.className = 'flex flex-col gap-2 px-4 py-3';
    (root.querySelector('main') || root).appendChild(slot);
  }
  slot.textContent = '';
  const grade = sessionStorage.getItem('plug-grade') || 'e10_87';
  const priced = stations.map((station) => priceFor(station, grade)).filter((value): value is number => value != null);
  if (priced.length >= 2) {
    const avg = priced.reduce((sum, value) => sum + value, 0) / priced.length;
    slotText(root, 'parish-avg', money(avg));
  }
  const count = root.querySelector<HTMLElement>('[data-slot="station-count"]');
  if (count) count.textContent = String(stations.length);
  root.querySelectorAll('button span').forEach((span) => {
    if (/^show \d+ stations$/i.test((span.textContent || '').replace(/\s+/g, ' ').trim())) {
      span.textContent = `Show ${stations.length} stations`;
    }
  });
  if (!stations.length) {
    const line = document.createElement('p');
    line.className = 'px-1 py-3 text-sm';
    line.textContent = empty;
    slot.appendChild(line);
    return;
  }
  const ranked = [...stations].sort((a, b) => (priceFor(a, grade) ?? Number.POSITIVE_INFINITY) - (priceFor(b, grade) ?? Number.POSITIVE_INFINITY));
  ranked.forEach((station) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.act = 'open-station';
    button.dataset.stationId = station.id;
    button.dataset.liveName = station.name;
    button.dataset.liveRow = 'station';
    button.className = 'flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-surface-container-lowest p-3 text-left shadow-sm';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onPlugClick({ preventDefault() {}, stopPropagation() {}, currentTarget: button } as unknown as Parameters<typeof onPlugClick>[0]);
    });
    const name = document.createElement('span');
    name.className = 'font-bold';
    name.textContent = station.name;
    const meta = document.createElement('span');
    meta.className = 'text-sm';
    const distance = station.lat != null && station.lng != null ? kmBetween(station.lat, station.lng) : null;
    const price = priceFor(station, grade);
    meta.textContent = [distance, price != null ? money(price) : ''].filter(Boolean).join(' · ');
    button.append(name, meta);
    slot.appendChild(button);
  });
}

async function fillStationList(root: HTMLElement, offlineOnly: boolean) {
  const stations = await loadStations(offlineOnly);
  const cached = offlineOnly || root.hasAttribute('data-offline-list') || Boolean(root.querySelector('[data-offline-list]'));
  const empty = cached && !stations.length ? 'No stations saved on this phone.' : 'No stations nearby';
  paintStationRows(root, stations, stations.length ? '' : (cached ? 'No stations saved on this phone.' : empty));
}

async function fillWhere(root: HTMLElement) {
  const slot = root.querySelector<HTMLElement>('[data-slot="where"]');
  if (!slot) return;
  const fix = deviceFix();
  if (!fix) {
    slot.textContent = 'Near you';
    return;
  }
  try {
    const [stations, areas] = await Promise.all([
      loadStations(false),
      publicGet<{ areas?: { pcode: string; name: string }[] }>('/geo/parishes?level=1'),
    ]);
    let nearest: Station | null = null;
    let best = Number.POSITIVE_INFINITY;
    stations.forEach((station) => {
      if (station.lat == null || station.lng == null || !fix) return;
      const toRad = (value: number) => (value * Math.PI) / 180;
      const dLat = toRad(station.lat - fix.lat);
      const dLng = toRad(station.lng - fix.lng);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(fix.lat)) * Math.cos(toRad(station.lat)) * Math.sin(dLng / 2) ** 2;
      const km = 2 * 6371 * Math.asin(Math.sqrt(a));
      if (km < best) {
        best = km;
        nearest = station;
      }
    });
    const name = areas.areas?.find((area) => area.pcode && area.pcode === nearest?.pcode)?.name;
    slot.textContent = name || 'Near you';
  } catch {
    slot.textContent = 'Near you';
  }
}

function tollAmount(prices: unknown): string | null {
  if (typeof prices === 'number' && Number.isFinite(prices)) return money(prices);
  if (!prices || typeof prices !== 'object') return null;
  const value = Object.values(prices as Record<string, unknown>).map(Number).find((item) => Number.isFinite(item));
  return value == null ? null : money(value);
}

async function fillTolls(root: HTMLElement) {
  const slot = root.querySelector<HTMLElement>('[data-live-list="tolls"]');
  const body = await publicGet<{ plazas: TollPlaza[] }>('/tolls');
  const plazas = body.plazas || [];
  if (!slot) {
    note(root, plazas.length ? '' : 'Toll rates are not published yet.', 'status');
    return;
  }
  slot.textContent = '';
  if (!plazas.length) {
    const line = document.createElement('p');
    line.className = 'px-1 py-3';
    line.textContent = 'Toll rates are not published yet.';
    slot.appendChild(line);
    return;
  }
  plazas.forEach((plaza) => {
    const row = document.createElement('div');
    row.className = 'flex min-h-12 items-center justify-between rounded-xl bg-surface-container-lowest p-3 shadow-sm';
    row.dataset.liveRow = 'toll';
    const label = plaza.name || plaza.highway || 'Toll';
    row.dataset.liveName = label;
    const name = document.createElement('span');
    name.className = 'font-bold';
    name.textContent = label;
    const price = document.createElement('span');
    price.textContent = tollAmount(plaza.prices) || 'Rate not published';
    row.append(name, price);
    slot.appendChild(row);
  });
}

function paintReceipt(root: HTMLElement) {
  const saved = readFill();
  const station = saved?.stationName || sessionStorage.getItem('plug-station-name') || '';
  const amount = saved && Number(saved.amount) > 0 ? money(Number(saved.amount)) : '';
  const litres = saved && Number(saved.litres) > 0 ? `${Number(saved.litres)} L` : '';
  const grade = saved?.grade ? gradeLabel(saved.grade) : '';
  const rate = saved && Number(saved.amount) > 0 && Number(saved.litres) > 0
    ? `${money(Number(saved.amount) / Number(saved.litres))} / L`
    : '';
  slotText(root, 'receipt-station', station || 'Not entered yet');
  slotText(root, 'receipt-amount', amount || 'Not entered yet');
  slotText(root, 'receipt-litres', litres);
  slotText(root, 'receipt-grade', grade && rate ? `${grade} @ ${rate}` : grade || 'Not entered yet');
  const formula = root.querySelector('#rate-formula');
  if (formula) formula.textContent = amount && litres ? `${amount} ÷ ${litres}` : 'Not entered yet';
  const display = root.querySelector('#rate-display');
  if (display) display.textContent = rate || 'Not entered yet';
  const total = root.querySelector<HTMLInputElement>('#total-cost, #amount-input');
  if (total && saved && document.activeElement !== total && !total.value) total.value = saved.amount ? String(saved.amount) : '';
  const volume = root.querySelector<HTMLInputElement>('#volume-litres, #litres-input');
  if (volume && saved && document.activeElement !== volume && !volume.value) volume.value = saved.litres ? String(saved.litres) : '';
  const savedAt = saved?.savedAt ? whenLabel(saved.savedAt, true) : '';
  setSlot(root, 'fill-time', savedAt || null);
  root.querySelectorAll<HTMLElement>('[data-slot="fill-time"]').forEach((node) => {
    if (savedAt) node.dataset.liveRow = 'fill';
  });
}

async function fillPlace(root: HTMLElement) {
  const raw = decodeURIComponent((window.location.hash.match(/\/places\/([^/?]+)/) || [])[1] || '');
  const reserved = new Set(['mechanic', 'facility', 'store']);
  let name = '';
  let address = '';
  let hours = '';
  let phone = '';
  if (raw && !reserved.has(raw)) {
    try {
      const body = await publicGet<{ place?: { name?: string; brand?: string | null; details?: { address?: string; hours?: string | null; phone?: string | null } | null } }>(`/places/${encodeURIComponent(raw)}`);
      name = body.place?.name || '';
      address = body.place?.details?.address || body.place?.brand || '';
      hours = body.place?.details?.hours?.trim() || '';
      phone = body.place?.details?.phone?.trim() || '';
    } catch {
      name = '';
    }
  }
  const title = name || 'No place selected';
  root.querySelectorAll('h1, h2').forEach((node) => {
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text === 'Not entered yet') node.textContent = title;
  });
  slotText(root, 'place-name', title);
  slotText(root, 'place-address', address);
  setSlot(root, 'place-hours', hours || null);
  setSlot(root, 'place-phone', phone || null);
  root.querySelectorAll<HTMLAnchorElement>('[data-slot="place-phone-link"]').forEach((link) => {
    if (phone) link.href = `tel:${phone}`;
  });
  if (name) {
    const row = root.querySelector<HTMLElement>('[data-slot="place-name"]');
    if (row) {
      row.dataset.liveName = name;
      row.dataset.liveRow = 'place';
    }
  }
}

async function fillLatestFill(root: HTMLElement) {
  const id = vehicleId();
  let logs: FuelLog[] = [];
  try {
    const body = await plugSend<{ logs: FuelLog[] }>(`/fuel-logs${id ? `?vehicleId=${encodeURIComponent(id)}` : ''}`, 'GET');
    logs = body.logs || [];
  } catch {
    logs = [];
  }
  const latest = logs[0];
  if (!latest) {
    slotText(root, 'last-station', 'No fills yet');
    slotText(root, 'last-detail', '');
    slotText(root, 'last-amount', '');
    return;
  }
  const names = new Map((await loadStations(false).catch(() => [] as Station[])).map((station) => [station.id, station.name]));
  slotText(root, 'last-station', (latest.station_id && names.get(latest.station_id)) || 'Fuel stop');
  slotText(root, 'last-detail', [latest.litres != null ? `${Number(latest.litres)} L` : '', latest.created_at ? new Date(latest.created_at).toLocaleString('en-JM') : ''].filter(Boolean).join(' · '));
  slotText(root, 'last-amount', latest.amount != null ? money(Number(latest.amount)) : '');
}

function queueNote(root: HTMLElement) {
  const waiting = readQueue().length;
  const slot = root.querySelector<HTMLElement>('[data-slot="queue-count"]');
  if (!slot) return;
  const row = (slot.closest('[data-slot-row]') as HTMLElement | null) || slot.parentElement;
  if (!waiting) {
    if (row) row.hidden = true;
    slot.textContent = '';
    return;
  }
  if (row) row.hidden = false;
  slot.textContent = `${waiting} logs waiting`;
}

async function fillAccount(root: HTMLElement) {
  const [exported, contributions, garageBody] = await Promise.all([
    plugSend<{ profile?: { display_name?: string | null; created_at?: string | null }[]; fuel_log?: { amount?: number | null }[]; user_vehicle?: { nickname?: string | null; year?: number | null; make?: string | null; model?: string | null }[] }>('/me/export', 'GET').catch(() => ({ profile: [], fuel_log: [], user_vehicle: [] })),
    plugSend<{ pins?: { status?: string }[] }>('/contributions', 'GET').catch(() => ({ pins: [] })),
    plugSend<{ vehicles?: { nickname?: string | null; year?: number | null; make?: string | null; model?: string | null }[] }>('/garage', 'GET').catch(() => ({ vehicles: [] })),
  ]);
  const profile = exported.profile?.[0];
  const name = profile?.display_name || sessionStorage.getItem('plug-name') || 'Your account';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'You';
  slotText(root, 'display-name', name);
  const cars = garageBody.vehicles?.length ? garageBody.vehicles : exported.user_vehicle || [];
  const car = cars[0];
  const carName = car ? (car.nickname || [car.year, car.make, car.model].filter(Boolean).join(' ')) : '';
  const pins = contributions.pins || [];
  const spend = (exported.fuel_log || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  replaceText(root, 'No cars yet', cars.length ? `${cars.length} active` : 'No cars yet');
  replaceText(root, '1 Active Car', cars.length ? `${cars.length} active` : 'No cars yet');
  replaceText(root, 'No places yet', pins.length ? `${pins.length} place${pins.length === 1 ? '' : 's'}` : 'No places yet');
  replaceText(root, '14 Island Spots', pins.length ? `${pins.length} place${pins.length === 1 ? '' : 's'}` : 'No places yet');
  replaceText(root, 'No prices yet', '');
  replaceText(root, '42 Fuel Rates', '');
  replaceText(root, 'No fills yet', exported.fuel_log?.length ? `J$${Math.round(spend).toLocaleString()}` : 'No fills yet');
  replaceText(root, 'J$14,200', exported.fuel_log?.length ? `J$${Math.round(spend).toLocaleString()}` : 'No fills yet');
  replaceText(root, 'No reminder yet', 'No reminder yet');
  replaceText(root, 'Fitness expires in 14 days', 'No reminder yet');
  const avatar = root.querySelector('[data-initials]');
  if (avatar) avatar.textContent = initials;
  if (carName) slotText(root, 'car', carName);
}

async function fillHistory(root: HTMLElement) {
  const id = vehicleId();
  const query = id ? `?vehicleId=${encodeURIComponent(id)}` : '';
  const [servicesBody, logsBody] = await Promise.all([
    plugSend<{ services?: { name?: string; shop?: string; cost?: number; amount?: number; done_on?: string }[] }>(`/services${query}`, 'GET').catch(() => ({ services: [] })),
    plugSend<{ logs: FuelLog[] }>(`/fuel-logs${query}`, 'GET').catch(() => ({ logs: [] as FuelLog[] })),
  ]);
  const services = servicesBody.services || [];
  const logs = logsBody.logs || [];
  const slot = root.querySelector<HTMLElement>('[data-slot="history"]');
  if (!slot) return;
  if (!services.length && !logs.length) {
    slot.textContent = 'No services yet';
    return;
  }
  slot.textContent = '';
  services.forEach((row) => {
    const line = document.createElement('p');
    line.className = 'px-4 py-3 font-bold';
    const cost = row.cost ?? row.amount;
    line.textContent = [row.name || 'Service', row.shop || '', cost != null ? money(Number(cost)) : '', row.done_on || ''].filter(Boolean).join(' · ');
    slot.appendChild(line);
  });
  logs.forEach((row) => {
    const line = document.createElement('p');
    line.className = 'px-4 py-3 font-bold';
    const when = row.created_at ? new Date(row.created_at).toLocaleDateString('en-JM') : '';
    line.textContent = [gradeLabel(row.grade), row.litres ? `${row.litres} L` : '', row.amount != null ? money(Number(row.amount)) : '', when].filter(Boolean).join(' · ');
    slot.appendChild(line);
  });
}

async function fillSpend(root: HTMLElement) {
  const id = vehicleId();
  const [logsBody, cars, stationsBody] = await Promise.all([
    plugSend<{ logs: FuelLog[] }>(`/fuel-logs${id ? `?vehicleId=${encodeURIComponent(id)}` : ''}`, 'GET'),
    garage().catch(() => [] as Vehicle[]),
    publicGet<{ stations: Station[] }>('/stations').catch(() => ({ stations: [] as Station[] })),
  ]);
  const logs = logsBody.logs || [];
  const total = logs.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  slotText(root, 'spend', logs.length ? money(total) : 'No fuel spend yet');
  const names = new Map((stationsBody.stations || []).map((station) => [station.id, station.name]));
  const car = cars.find((row) => row.id === id) || cars[0];
  const slot = root.querySelector<HTMLElement>('[data-slot="fills"]');
  const count = root.querySelector<HTMLElement>('[data-slot="fill-count"]');
  if (count) count.textContent = logs.length ? `${logs.length}` : '';
  if (!slot) return;
  if (!logs.length) {
    slot.textContent = 'No fills yet';
    return;
  }
  const ordered = [...logs].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  let previous = asKm(car?.starting_odometer);
  const economy = new Map<FuelLog, number>();
  ordered.forEach((row) => {
    const reading = asKm(row.odometer);
    const litres = Number(row.litres);
    if (previous != null && reading != null && reading > previous && litres > 0) {
      economy.set(row, (reading - previous) / litres);
    }
    if (reading != null) previous = reading;
  });
  slot.textContent = '';
  logs.forEach((row) => {
    const card = document.createElement('div');
    card.className = 'rounded-xl bg-surface-container-lowest p-4 shadow-sm';
    const title = document.createElement('p');
    title.className = 'font-bold';
    const when = row.created_at ? new Date(row.created_at).toLocaleDateString('en-JM') : '';
    const station = row.station_id ? names.get(row.station_id) : '';
    title.textContent = [station || 'Fuel stop', gradeLabel(row.grade), when].filter(Boolean).join(' · ');
    const detail = document.createElement('p');
    detail.className = 'text-sm';
    const km = economy.get(row);
    detail.textContent = [
      row.litres != null ? `${Number(row.litres)} L` : '',
      row.amount != null ? money(Number(row.amount)) : '',
      km != null ? `${km.toFixed(1)} km/L` : '',
    ].filter(Boolean).join(' · ');
    card.append(title, detail);
    slot.appendChild(card);
  });
}

type Reminder = { kind?: string; due_on?: string | null };

async function loadReminders(): Promise<Reminder[]> {
  const id = vehicleId();
  const body = await plugSend<{ reminders: Reminder[] }>(
    `/reminders${id ? `?vehicleId=${encodeURIComponent(id)}` : ''}`,
    'GET',
  );
  return body.reminders || [];
}

function paintReminders(root: HTMLElement, reminders: Reminder[]) {
  const slot = root.querySelector<HTMLElement>('[data-slot="reminders"]');
  if (!slot) return;
  const rows = reminders.filter((row) => row.due_on);
  slot.textContent = '';
  if (!rows.length) {
    slot.style.display = 'none';
    return;
  }
  slot.style.display = '';
  slot.classList.remove('hidden');
  rows.forEach((row) => {
    const due = whenLabel(String(row.due_on), false);
    if (!due) return;
    const card = document.createElement('div');
    card.className = 'rounded-xl bg-surface-container-low p-3';
    card.dataset.liveRow = 'reminder';
    const title = document.createElement('p');
    title.className = 'font-bold';
    title.textContent = reminderTitle(String(row.kind || 'Reminder'));
    const line = document.createElement('p');
    line.textContent = due;
    card.append(title, line);
    const days = daysUntil(String(row.due_on));
    if (days != null && days >= 0 && days <= 30) {
      const badge = document.createElement('p');
      badge.textContent = 'Due soon';
      card.append(badge);
    }
    slot.append(card);
  });
  if (!slot.childElementCount) slot.style.display = 'none';
}

async function fillDocs(root: HTMLElement) {
  const reminders = await loadReminders();
  paintReminders(root, reminders);
  root.querySelectorAll('h2').forEach((heading) => {
    const kind = (heading.textContent || '').trim();
    const match = reminders.find((row) => kind.toLowerCase().includes(String(row.kind || '').toLowerCase()) || String(row.kind || '').toLowerCase().includes(kind.toLowerCase().slice(0, 6)));
    const card = heading.closest('[data-doc]') as HTMLElement | null;
    if (!card) return;
    const due = match?.due_on ? whenLabel(match.due_on, false) : '';
    setSlot(card, 'doc-due', due || null);
    const days = match?.due_on ? daysUntil(match.due_on) : null;
    setSlot(card, 'doc-status', days != null && days >= 0 && days <= 30 ? 'Due soon' : null);
    const dueNode = card.querySelector<HTMLElement>('[data-slot="doc-due"]');
    if (dueNode && due) dueNode.dataset.liveRow = 'reminder';
  });
}

async function fillServiceRecord(root: HTMLElement) {
  const id = vehicleId();
  const body = await plugSend<{ services?: { name?: string; shop?: string; done_on?: string }[] }>(
    `/services${id ? `?vehicleId=${encodeURIComponent(id)}` : ''}`,
    'GET',
  ).catch(() => ({ services: [] as { name?: string; shop?: string; done_on?: string }[] }));
  const latest = (body.services || []).find((row) => row.done_on);
  const due = latest?.done_on ? whenLabel(latest.done_on, false) : '';
  setSlot(root, 'last-service-date', due || null);
  setSlot(root, 'last-service-shop', latest?.shop?.trim() || null);
  const row = root.querySelector<HTMLElement>('[data-slot="last-service-date"]');
  if (row && due) row.dataset.liveRow = 'service';
}

async function fillSchedule(root: HTMLElement) {
  const variant = catalogVariant();
  if (!variant) {
    note(root, 'Add a catalog car to see its service schedule.', 'status');
    return;
  }
  const body = await publicGet<{ tasks: { op_code?: string; name?: string; title?: string }[] }>(`/schedules?variant=${encodeURIComponent(variant)}`);
  const tasks = body.tasks || [];
  const cards = [...root.querySelectorAll('div.cursor-pointer')];
  if (!tasks.length) {
    note(root, 'No service schedule for this car yet.', 'status');
    return;
  }
  tasks.forEach((task, index) => {
    const card = cards[index];
    if (!card) return;
    const name = task.name || task.title || task.op_code || 'Service';
    card.setAttribute('data-op', task.op_code || name);
    const label = card.querySelector('h2, h3, strong, span');
    if (label) label.textContent = name;
  });
}

async function fillParts(root: HTMLElement) {
  const variant = catalogVariant();
  if (!variant) return;
  const body = await publicGet<{ parts: { part_id?: string; id?: string; part_name?: string; name?: string; category?: string; tier?: number }[] }>(
    `/parts?variant=${encodeURIComponent(variant)}`,
  );
  const parts = body.parts || [];
  const first = parts[0];
  const firstId = String(first?.part_id || first?.id || '');
  if (firstId) root.dataset.firstPart = firstId;
  const cards = [...root.querySelectorAll('h4')].map((heading) => heading.closest('div')).filter((card): card is HTMLDivElement => Boolean(card));
  parts.forEach((part, index) => {
    const card = cards[index];
    if (!card) return;
    const id = String(part.part_id || part.id || '');
    if (id) card.querySelectorAll('button, a').forEach((node) => node.setAttribute('data-part-id', id));
    const name = part.part_name || part.name;
    const heading = card.querySelector('h4');
    if (heading && name) heading.textContent = name;
  });
}

async function fillInbox(root: HTMLElement) {
  const body = await plugSend<{ notifications: { title?: string; body?: string }[] }>('/notifications', 'GET').catch(() => ({ notifications: [] as { title?: string; body?: string }[] }));
  const notes = body.notifications || [];
  root.querySelectorAll('span').forEach((node) => {
    if ((node.textContent || '').trim() === 'No new alerts' || /^\d+ new alerts$/.test((node.textContent || '').trim())) {
      node.textContent = notes.length ? `${notes.length} new` : 'No new alerts';
    }
  });
  const slot = root.querySelector<HTMLElement>('[data-slot="inbox"]');
  if (!slot) {
    if (!notes.length) note(root, 'Inbox is empty.', 'status');
    return;
  }
  slot.textContent = '';
  if (!notes.length) {
    const line = document.createElement('p');
    line.className = 'px-1 py-3 text-sm';
    line.textContent = 'Inbox is empty.';
    slot.appendChild(line);
    return;
  }
  notes.forEach((item) => {
    const line = document.createElement('p');
    line.className = 'px-1 py-3 font-bold';
    line.textContent = [item.title, item.body].filter(Boolean).join(' — ');
    slot.appendChild(line);
  });
}

async function fillPins(root: HTMLElement) {
  const body = await plugSend<{ pins: { id: string; name: string; status: string; lat?: number | null; lng?: number | null; created_at?: string | null }[] }>('/contributions', 'GET');
  const pins = body.pins || [];
  const slot = root.querySelector<HTMLElement>('[data-slot="pins"]');
  const pending = pins.find((pin) => pin.status === 'pending');
  if (pending) sessionStorage.setItem('plug-pin', pending.id);
  const when = pending?.created_at ? whenLabel(pending.created_at, true) : '';
  setSlot(root, 'pin-when', when || null);
  const where = pending && Number.isFinite(Number(pending.lat)) && Number.isFinite(Number(pending.lng))
    ? `${Number(pending.lat).toFixed(4)}, ${Number(pending.lng).toFixed(4)}`
    : '';
  setSlot(root, 'pin-where', where || null);
  root.querySelectorAll<HTMLElement>('[data-slot="pin-when"]').forEach((node) => {
    if (when) node.dataset.liveRow = 'pin';
  });
  if (!slot) return;
  root.querySelectorAll('h1, h2').forEach((node) => {
    if (!(node.textContent || '').replace(/\s+/g, ' ').trim()) node.textContent = pending?.name || 'No place waiting';
  });
  if (!pins.length) {
    slot.textContent = 'No places yet.';
    return;
  }
  slot.textContent = '';
  pins.forEach((pin) => {
    const line = document.createElement('p');
    line.className = 'px-4 py-3 font-bold';
    line.textContent = `${pin.name} · ${pin.status === 'approved' ? 'Approved' : 'Waiting for approval'}`;
    slot.appendChild(line);
  });
}

async function fillParish(root: HTMLElement) {
  const body = await publicGet<{ areas?: { name: string }[] }>('/geo/parishes?level=1');
  const count = body.areas?.length || 0;
  if (!count) return;
  const line = [...root.querySelectorAll('p')].find((node) => /tap a parish/i.test(node.textContent || ''));
  if (line) line.textContent = `${count} parishes on the map. Tap a region to inspect gaps.`;
}

async function fillCatalog(root: HTMLElement, query: string) {
  const body = await publicGet<{ vehicles: { id: string; make: string; model: string; year: number }[] }>(
    `/vehicle-catalog?q=${encodeURIComponent(query)}`,
  );
  const rows = body.vehicles || [];
  if (!rows.length) return;
  const cards = [...root.querySelectorAll<HTMLElement>('[data-make], button')];
  rows.slice(0, 8).forEach((row) => {
    const card = cards.find((node) => {
      const label = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (/continue|skip|back|search|clear|find your/.test(label)) return false;
      return label.split(' ').includes(row.make.toLowerCase()) || label.split(' ').includes(row.model.toLowerCase());
    });
    if (card) card.dataset.make = row.make;
  });
}

async function paintCarName(root: HTMLElement) {
  let cars: Vehicle[] = [];
  try {
    cars = await garage();
  } catch {
    cars = [];
  }
  const car = cars.find((row) => row.id === vehicleId()) || cars[0];
  slotText(root, 'car', car ? carLabel(car) : 'Add a car');
}

export async function fillScreen(file: string, root: HTMLElement) {
  root.querySelector('[data-fill-note]')?.remove();
  try {
    if (file === '30-vehicle-overview.html' || file === '13-vehicle-added.html' || file === '24-odometer-scan.html' || file === '25-confirm-odometer.html') await fillVehicle(root);
    else if (file === '29-my-vehicles.html') await fillGarage(root);
    else if (file === '19-station-detail.html' || file === '19b-directions.html') await fillStation(root);
    else if (file === '17-station-list.html' || file === '16-guest-mode.html') await fillStationList(root, false);
    else if (file === '15d-offline-chip.html' || file === '57-offline.html') await fillStationList(root, true);
    else if (file === '48-tolls.html') await fillTolls(root);
    else if (file === '18-filters.html') await fillStationList(root, false);
    if (file === '15-home-explore.html' || file === '15d-offline-chip.html' || file === '16-guest-mode.html' || file === '17-station-list.html') await fillWhere(root);
    if (file === '15d-offline-chip.html' || file === '57-offline.html') queueNote(root);
    if (file === '30-vehicle-overview.html') {
      await fillLatestFill(root);
      paintReminders(root, await loadReminders().catch(() => [] as Reminder[]));
    }
    if (file === '26-fuel-details.html' || file === '27-saved.html' || file === '27b-first-save.html' || file === '28-saved-offline.html' || file === '26b-save-error.html') paintReceipt(root);
    if (file === '21-mechanic.html' || file === '22-facility.html' || file === '20-parts-store.html' || file === '43-place-pin.html' || file === '43c-poor-gps.html' || file === '23b-withdraw.html') await fillPlace(root);
    else if (file === '51-account.html' || file === '52-notification-settings.html') await fillAccount(root);
    else if (file === '34-history.html') await fillHistory(root);
    else if (file === '35-fuel-spend.html') await fillSpend(root);
    else if (file === '36-documents.html') await fillDocs(root);
    else if (file === '31-maintenance-schedule.html') await fillSchedule(root);
    else if (file === '32-service-item.html') {
      await fillSchedule(root);
      await fillServiceRecord(root);
    }
    else if (file === '39-parts-results.html' || file === '40-part-detail.html') await fillParts(root);
    else if (file === '50-notifications.html') await fillInbox(root);
    else if (file === '46-contributions.html' || file === '23-pending-place.html' || file === '46b-approved.html') await fillPins(root);
    else if (file === '47-help-map-parish.html') await fillParish(root);
    else if (file === '09-add-vehicle-make.html') await fillCatalog(root, '');
    else if (file === '10-model-year.html') await fillCatalog(root, sessionStorage.getItem('plug-make') || '');
    await paintCarName(root);
  } catch {
    slotText(root, 'car', 'Add a car');
    note(root, 'Could not load this. Go back and try again.', 'alert');
  }
}
