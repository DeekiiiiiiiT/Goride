import { plugSend, publicGet } from '../api';
import { demoOn } from '../demo/mode';
import { catalogVariant, rememberVehicle, vehicleId } from './facts';

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
  brand?: string;
  parish?: string;
  address?: string;
  prices?: Record<string, number>;
};

const SAMPLES = ['2019 Toyota Roomy', '8241-HY', 'Tariq Campbell', 'Daily Workhorse', 'Rubis Hope Road', '1KR-FE Turbo', 'GS Grade'];

function replaceText(root: ParentNode, from: string, to: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue?.includes(from)) node.nodeValue = node.nodeValue.split(from).join(to);
  }
}

function clearSamples(root: HTMLElement) {
  if (demoOn()) return;
  for (const sample of SAMPLES) replaceText(root, sample, '');
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
  const cars = await garage();
  const id = vehicleId();
  const car = cars.find((row) => row.id === id) || cars[0];
  if (!car) {
    clearSamples(root);
    note(root, 'Add a car to see it here.', 'status');
    return;
  }
  rememberVehicle(car);
  const name = carLabel(car);
  replaceText(root, '2019 Toyota Roomy', name);
  replaceText(root, 'Daily Workhorse', name);
  replaceText(root, '8241-HY', '');
  const reading = car.starting_odometer;
  if (reading != null) replaceText(root, '84,210', Number(reading).toLocaleString());
}

async function fillGarage(root: HTMLElement) {
  const cars = await garage();
  const cards = [...root.querySelectorAll('h3')].map((heading) => heading.closest('div.w-full')).filter((card): card is HTMLElement => Boolean(card));
  if (!cars.length) {
    clearSamples(root);
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
    replaceText(card, '2019 Toyota Roomy', name);
    replaceText(card, '2016 Nissan AD Wagon', name);
    card.querySelectorAll('h3').forEach((heading) => { heading.textContent = name; });
    card.dataset.vehicleId = car.id;
    card.addEventListener('click', () => { window.location.hash = `#/garage/${car.id}`; });
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
  if (!id) {
    clearSamples(root);
    return;
  }
  const body = await publicGet<{ station: Station }>(`/stations/${id}`);
  const station = body.station;
  if (!station) return;
  sessionStorage.setItem('plug-station', station.id);
  sessionStorage.setItem('plug-station-name', station.name);
  replaceText(root, 'Rubis Hope Road', station.name);
  const title = root.querySelector('h1.font-headline-md');
  if (title) title.textContent = station.name;
  const prices = station.prices || {};
  const first = Object.entries(prices)[0];
  if (first) replaceText(root, 'J$214.50', `J$${Number(first[1]).toFixed(2)}`);
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
  const body = await plugSend<{ profile?: { display_name?: string | null }[] }>('/me/export', 'GET');
  const name = body.profile?.[0]?.display_name || sessionStorage.getItem('plug-name') || '';
  replaceText(root, 'Tariq Campbell', name || (demoOn() ? 'DEMO driver' : 'Your account'));
  if (!demoOn()) replaceText(root, 'Road Scout Lvl 3', '');
}

async function fillHistory(root: HTMLElement) {
  const id = vehicleId();
  const body = await plugSend<{ logs: { id: string; grade?: string; amount?: number; litres?: number; odometer?: number; created_at?: string }[] }>(
    `/fuel-logs${id ? `?vehicleId=${encodeURIComponent(id)}` : ''}`,
    'GET',
  );
  const logs = body.logs || [];
  if (!logs.length) {
    clearSamples(root);
    note(root, 'No fuel logs yet.', 'status');
    return;
  }
  const cards = [...root.querySelectorAll('h3, h2')].slice(0, 1);
  const first = logs[0];
  if (cards[0]) cards[0].textContent = `${first.grade || 'Fuel'} · ${first.litres || 0} L`;
  if (first.amount != null) replaceText(root, 'J$', `J$${Number(first.amount).toFixed(2)} `);
}

async function fillSpend(root: HTMLElement) {
  const id = vehicleId();
  const body = await plugSend<{ logs: { amount?: number }[] }>(`/fuel-logs${id ? `?vehicleId=${encodeURIComponent(id)}` : ''}`, 'GET');
  const total = (body.logs || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const heading = [...root.querySelectorAll('h1, h2, strong')].find((node) => /J\$|spend|total/i.test(node.textContent || ''));
  if (!body.logs?.length) {
    clearSamples(root);
    note(root, 'No fuel spend yet.', 'status');
    return;
  }
  if (heading) heading.textContent = `J$${total.toFixed(2)}`;
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
    const date = card.querySelector('span');
    if (match?.due_on && date) date.textContent = match.due_on;
    else if (!match && !demoOn()) {
      const badge = [...card.querySelectorAll('span')].find((node) => /valid|expired|due/i.test(node.textContent || ''));
      if (badge) badge.textContent = 'Not set';
    }
  });
}

async function fillSchedule(root: HTMLElement) {
  const variant = catalogVariant();
  if (!variant) {
    if (!demoOn()) note(root, 'Add a catalog car to see its service schedule.', 'status');
    return;
  }
  const body = await publicGet<{ tasks: { op_code?: string; name?: string; title?: string }[] }>(`/schedules?variant=${encodeURIComponent(variant)}`);
  const tasks = body.tasks || [];
  const cards = [...root.querySelectorAll('div.cursor-pointer')];
  if (!tasks.length) {
    if (!demoOn()) note(root, 'No service schedule for this car yet.', 'status');
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
  if (!pins.length) {
    clearSamples(root);
    note(root, 'No pins yet.', 'status');
    return;
  }
  const pending = pins.find((pin) => pin.status === 'pending');
  if (pending) sessionStorage.setItem('plug-pin', pending.id);
  const titles = [...root.querySelectorAll('h2, h3')];
  pins.forEach((pin, index) => {
    if (titles[index]) titles[index].textContent = pin.name;
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

export async function fillScreen(file: string, root: HTMLElement) {
  try {
    if (file === '30-vehicle-overview.html' || file === '13-vehicle-added.html') await fillVehicle(root);
    else if (file === '29-my-vehicles.html') await fillGarage(root);
    else if (file === '19-station-detail.html' || file === '17-station-list.html') await fillStation(root);
    else if (file === '48-tolls.html') await fillTolls(root);
    else if (file === '51-account.html') await fillAccount(root);
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
    else if (!demoOn()) clearSamples(root);
  } catch {
    clearSamples(root);
    note(root, 'Could not load this. Go back and try again.', 'alert');
  }
}
