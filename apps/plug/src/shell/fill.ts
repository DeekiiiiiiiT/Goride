import { plugSend, publicGet } from '../api';
import { catalogVariant, rememberVehicle, vehicleId } from './facts';
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
  prices?: Record<string, number>;
  price_updated_at?: string | null;
};

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
  const brand = station.brand?.trim() || '';
  setSlot(root, 'brand', brand || null);
  setSlot(root, 'address', station.address?.trim() || null);
  paintPrices(root, station);
  paintGps(root);
}

async function fillTolls(root: HTMLElement) {
  const body = await publicGet<{ plazas: { name: string; highway?: string }[] }>('/tolls');
  const plazas = body.plazas || [];
  if (!plazas.length) {
    note(root, 'Toll rates are not published yet.', 'status');
    return;
  }
  const headings = [...root.querySelectorAll('h2, h3')];
  plazas.forEach((plaza, index) => {
    const heading = headings[index];
    if (heading && /highway|portmore|spanish|caymanas|toll/i.test(heading.textContent || '')) {
      heading.textContent = plaza.name || plaza.highway || 'Toll';
    }
  });
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
  const body = await plugSend<{ logs: { id: string; grade?: string; amount?: number; litres?: number; odometer?: number; created_at?: string }[] }>(
    `/fuel-logs${id ? `?vehicleId=${encodeURIComponent(id)}` : ''}`,
    'GET',
  );
  const logs = body.logs || [];
  const slot = root.querySelector<HTMLElement>('[data-slot="history"]');
  if (!logs.length) {
    if (slot) slot.textContent = 'No fuel logs yet.';
    return;
  }
  if (slot) {
    slot.textContent = '';
    logs.forEach((row) => {
      const line = document.createElement('p');
      line.className = 'px-4 py-3 font-bold';
      const when = row.created_at ? new Date(row.created_at).toLocaleDateString('en-JM') : '';
      line.textContent = [row.grade || 'Fuel', row.litres ? `${row.litres} L` : '', row.amount != null ? `J$${Number(row.amount).toFixed(2)}` : '', when].filter(Boolean).join(' · ');
      slot.appendChild(line);
    });
  }
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

async function fillDocs(root: HTMLElement) {
  const id = vehicleId();
  const body = await plugSend<{ reminders: { kind?: string; due_on?: string | null }[] }>(
    `/reminders${id ? `?vehicleId=${encodeURIComponent(id)}` : ''}`,
    'GET',
  );
  const reminders = body.reminders || [];
  root.querySelectorAll('h2').forEach((heading) => {
    const kind = (heading.textContent || '').trim();
    const match = reminders.find((row) => kind.toLowerCase().includes(String(row.kind || '').toLowerCase()) || String(row.kind || '').toLowerCase().includes(kind.toLowerCase().slice(0, 6)));
    const card = heading.closest('div');
    if (!card) return;
    card.setAttribute('data-kind', match?.kind || kind);
    const dates = [...card.querySelectorAll('span')].filter((node) => (node.textContent || '').trim() === 'Not set');
    if (match?.due_on && dates[0]) dates[0].textContent = match.due_on;
    else if (!match && dates[0]) dates[0].textContent = 'Not set';
  });
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
  const body = await plugSend<{ notifications: { title?: string; body?: string }[] }>('/notifications', 'GET');
  const notes = body.notifications || [];
  if (!notes.length) {
    note(root, 'Inbox is empty.', 'status');
    return;
  }
  const titles = [...root.querySelectorAll('h2, h3')];
  notes.forEach((item, index) => {
    if (titles[index] && item.title) titles[index].textContent = item.title;
  });
}

async function fillPins(root: HTMLElement) {
  const body = await plugSend<{ pins: { id: string; name: string; status: string }[] }>('/contributions', 'GET');
  const pins = body.pins || [];
  const slot = root.querySelector<HTMLElement>('[data-slot="pins"]');
  const pending = pins.find((pin) => pin.status === 'pending');
  if (pending) sessionStorage.setItem('plug-pin', pending.id);
  if (!slot) return;
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
    else if (file === '19-station-detail.html' || file === '19b-directions.html' || file === '17-station-list.html') await fillStation(root);
    else if (file === '48-tolls.html') await fillTolls(root);
    else if (file === '51-account.html' || file === '52-notification-settings.html') await fillAccount(root);
    else if (file === '34-history.html') await fillHistory(root);
    else if (file === '35-fuel-spend.html') await fillSpend(root);
    else if (file === '36-documents.html') await fillDocs(root);
    else if (file === '31-maintenance-schedule.html' || file === '32-service-item.html') await fillSchedule(root);
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
