import { buildFitMessage } from '@roam/types/partsResolution';
import { signInProviderLabel, supabasePlugApp } from '../authClient';
import { plugSend, publicGet } from '../api';
import { readQueue, readStationCache, writeStationCache } from '../offline';
import { handlePlugClick, onPlugClick } from '../shell/actions';
import { catalogCoversYear, catalogVariant, deviceFix, rememberVehicle, vehicleId, type CatalogVehicle } from './facts';
import { getPlugRuntime, paintLockedGradeChrome, preferredGrade } from './click';
import {
  confidenceDotClass,
  confidenceLabel,
  confidencePillClass,
  confidenceTone,
  gradeBadgeClass,
  gradeLabel as pumpGradeLabel,
  moneyJmd,
  pricedGrades,
  readPumpQuote,
  relativeAge,
} from '../live/pumpPrice';

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
  prices?: Record<string, unknown>;
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
    paintCatalogSpecs(root, null);
    paintGps(root);
    return;
  }
  rememberVehicle(car);
  slotText(root, 'car', carLabel(car));
  paintCatalogSpecs(root, await catalogRow(car));
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
    const grades = pricedGrades(prices);
    grades.forEach((grade, index) => {
      const quote = readPumpQuote(prices, grade);
      if (quote.price == null) return;
      if (index > 0) {
        const divider = document.createElement('div');
        divider.className = 'h-px bg-surface-variant mx-space-md';
        slot.appendChild(divider);
      }
      const tone = confidenceTone(quote);
      const age = relativeAge(quote.observedAt || station.price_updated_at);
      const conf = confidenceLabel(quote);
      const muted = tone === 'outdated';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'w-full text-left p-space-md flex items-center justify-between hover:bg-surface-container-low transition-colors group';
      button.dataset.act = 'log-fill';
      button.dataset.stationId = station.id;
      button.dataset.liveRow = 'station';
      button.dataset.liveName = station.name;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onPlugClick({ preventDefault() {}, stopPropagation() {}, currentTarget: button } as unknown as Parameters<typeof onPlugClick>[0]);
      });

      const left = document.createElement('div');
      left.className = 'flex items-start gap-3 min-w-0';

      const badgeWrap = document.createElement('div');
      badgeWrap.className = 'flex flex-col items-center';
      const badge = document.createElement('span');
      badge.className = `px-2 py-1 rounded-md ${gradeBadgeClass(grade)} font-label-md text-label-md font-bold tracking-tight`;
      badge.textContent = pumpGradeLabel(grade);
      badgeWrap.appendChild(badge);

      const mid = document.createElement('div');
      mid.className = 'flex flex-col min-w-0';
      const priceRow = document.createElement('div');
      priceRow.className = muted
        ? 'flex items-baseline gap-2 opacity-75'
        : 'flex items-baseline gap-2';
      const priceEl = document.createElement('span');
      priceEl.className = muted
        ? 'font-price-display text-price-display text-on-surface-variant font-bold tracking-tight'
        : 'font-price-display text-price-display text-on-surface font-extrabold tracking-tight';
      priceEl.style.fontVariantNumeric = 'tabular-nums';
      priceEl.textContent = moneyJmd(quote.price);
      const perL = document.createElement('span');
      perL.className = 'font-label-sm text-label-sm text-on-surface-variant';
      perL.textContent = '/L';
      priceRow.append(priceEl, perL);

      const confRow = document.createElement('div');
      confRow.className = 'flex items-center gap-2 mt-1';
      if (conf) {
        const pill = document.createElement('span');
        pill.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${confidencePillClass(tone)} font-label-sm text-label-sm font-semibold`;
        if (tone === 'outdated') {
          const icon = document.createElement('span');
          icon.className = 'material-symbols-outlined text-[12px] text-outline';
          icon.textContent = 'schedule';
          pill.appendChild(icon);
        } else if (tone === 'medium' && (quote.fleetCount || 0) > 0 && (quote.plugCount || 0) === 0) {
          const icon = document.createElement('span');
          icon.className = 'material-symbols-outlined text-[12px] text-amber-700';
          icon.textContent = 'local_shipping';
          pill.appendChild(icon);
        } else {
          const dot = document.createElement('span');
          dot.className = `w-1.5 h-1.5 rounded-full ${confidenceDotClass(tone).split(' ')[0]}`;
          pill.appendChild(dot);
        }
        const pillText = document.createElement('span');
        pillText.textContent = conf;
        pill.appendChild(pillText);
        confRow.appendChild(pill);
      }
      if (age) {
        const ageEl = document.createElement('span');
        ageEl.className = 'font-body-sm text-body-sm text-on-surface-variant truncate';
        ageEl.textContent = `• ${age}`;
        confRow.appendChild(ageEl);
      }
      mid.append(priceRow, confRow);
      left.append(badgeWrap, mid);

      const chevron = document.createElement('div');
      chevron.className = 'flex items-center text-on-surface-variant group-hover:text-primary transition-colors shrink-0 pl-2';
      const chevronIcon = document.createElement('span');
      chevronIcon.className = 'material-symbols-outlined text-[22px]';
      chevronIcon.textContent = 'chevron_right';
      chevron.appendChild(chevronIcon);

      button.append(left, chevron);
      slot.appendChild(button);
    });

    const callout = document.createElement('div');
    callout.className = 'p-space-md rounded-xl bg-surface-container-low flex items-start gap-3';
    const calloutIcon = document.createElement('span');
    calloutIcon.className = 'material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5';
    calloutIcon.textContent = 'verified_user';
    const calloutBody = document.createElement('div');
    calloutBody.className = 'flex flex-col';
    const calloutText = document.createElement('p');
    calloutText.className = 'font-body-sm text-body-sm text-on-surface-variant leading-relaxed';
    calloutText.textContent = "Prices come from Jamaican drivers' fuel logs and Petrojam index calculations, verified prior to map sync.";
    const calloutActions = document.createElement('div');
    calloutActions.className = 'flex items-center gap-4 mt-2';
    const reportBtn = document.createElement('button');
    reportBtn.type = 'button';
    reportBtn.dataset.act = 'report-price';
    reportBtn.dataset.stationId = station.id;
    reportBtn.className = 'font-label-md text-label-md text-secondary font-bold hover:underline flex items-center gap-1';
    const reportIcon = document.createElement('span');
    reportIcon.className = 'material-symbols-outlined text-[16px]';
    reportIcon.textContent = 'report_problem';
    const reportLabel = document.createElement('span');
    reportLabel.textContent = 'Price looks wrong?';
    reportBtn.append(reportIcon, reportLabel);
    reportBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onPlugClick({ preventDefault() {}, stopPropagation() {}, currentTarget: reportBtn } as unknown as Parameters<typeof onPlugClick>[0]);
    });
    calloutActions.appendChild(reportBtn);
    calloutBody.append(calloutText, calloutActions);
    callout.append(calloutIcon, calloutBody);
    slot.appendChild(callout);
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
  if (station.address?.trim()) sessionStorage.setItem('plug-station-address', station.address.trim());
  else sessionStorage.removeItem('plug-station-address');
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
  return readPumpQuote(station.prices, grade).price;
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

function wireAct(el: HTMLElement) {
  el.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onPlugClick({ preventDefault() {}, stopPropagation() {}, currentTarget: el } as unknown as Parameters<typeof onPlugClick>[0]);
  });
}

function paintStationRows(root: HTMLElement, stations: Station[], empty: string) {
  let slot = root.querySelector<HTMLElement>('[data-live-list="stations"]');
  if (!slot) {
    slot = document.createElement('div');
    slot.dataset.liveList = 'stations';
    slot.className = 'flex flex-col gap-space-md px-gutter py-3';
    (root.querySelector('main') || root).appendChild(slot);
  }
  slot.className = 'flex flex-col gap-space-md';
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
  let cheapestMarked = false;
  ranked.forEach((station) => {
    const quote = readPumpQuote(station.prices, grade);
    const price = quote.price;
    const isCheapest = price != null && !cheapestMarked;
    if (isCheapest) cheapestMarked = true;
    const distance = station.lat != null && station.lng != null ? kmBetween(station.lat, station.lng) : null;
    const whereLine = [distance, station.address?.trim()].filter(Boolean).join(' • ');
    const tone = confidenceTone(quote);
    const conf = confidenceLabel(quote);
    const age = relativeAge(quote.observedAt || station.price_updated_at);
    const confLine = [conf, age].filter(Boolean).join(' • ');

    const card = document.createElement('div');
    card.className = price == null
      ? 'flex flex-col p-space-md rounded-2xl bg-surface-container-low shadow-sm gap-space-md'
      : 'flex flex-col p-space-md rounded-2xl bg-surface-container-lowest shadow-sm gap-space-sm relative overflow-hidden';
    card.dataset.liveName = station.name;
    card.dataset.liveRow = 'station';

    const top = document.createElement('div');
    top.className = 'flex items-start justify-between gap-space-sm';

    const left = document.createElement('div');
    left.className = 'flex flex-col min-w-0';
    const nameBtn = document.createElement('button');
    nameBtn.type = 'button';
    nameBtn.dataset.act = 'open-station';
    nameBtn.dataset.stationId = station.id;
    nameBtn.className = 'text-left font-headline-sm text-headline-sm text-on-surface truncate';
    nameBtn.textContent = station.name;
    wireAct(nameBtn);
    left.appendChild(nameBtn);
    if (whereLine) {
      const meta = document.createElement('span');
      meta.className = 'font-body-sm text-body-sm text-on-surface-variant truncate';
      meta.textContent = whereLine;
      left.appendChild(meta);
    }

    const right = document.createElement('div');
    right.className = 'flex flex-col items-end shrink-0';
    if (price != null) {
      if (isCheapest) {
        const badge = document.createElement('div');
        badge.className = 'px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm font-bold flex items-center gap-1 mb-1';
        const star = document.createElement('span');
        star.className = 'text-tertiary text-[11px]';
        star.textContent = '★';
        const cheapestLabel = document.createElement('span');
        cheapestLabel.textContent = 'Cheapest';
        badge.append(star, cheapestLabel);
        right.appendChild(badge);
      }
      const priceRow = document.createElement('div');
      priceRow.className = tone === 'outdated' ? 'flex items-baseline opacity-60' : 'flex items-baseline';
      const priceEl = document.createElement('span');
      priceEl.className = tone === 'outdated'
        ? 'font-price-display text-price-display text-outline font-bold tracking-tight line-through'
        : 'font-price-display text-price-display text-on-surface font-extrabold tracking-tight';
      priceEl.style.fontVariantNumeric = 'tabular-nums';
      priceEl.textContent = moneyJmd(price);
      const perL = document.createElement('span');
      perL.className = tone === 'outdated'
        ? 'font-label-sm text-label-sm text-outline ml-1 font-semibold'
        : 'font-label-sm text-label-sm text-on-surface-variant ml-1 font-semibold';
      perL.textContent = '/ L';
      priceRow.append(priceEl, perL);
      right.appendChild(priceRow);
    } else {
      const none = document.createElement('span');
      none.className = 'font-body-md text-body-md text-on-surface-variant italic font-medium';
      none.textContent = 'No price yet';
      right.appendChild(none);
    }

    top.append(left, right);
    card.appendChild(top);

    if (price != null && confLine) {
      const confWrap = document.createElement('div');
      confWrap.className = 'flex flex-wrap items-center justify-between gap-2 pt-1';
      const pill = document.createElement('div');
      pill.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container text-on-surface';
      if (tone === 'outdated') {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined text-[18px] text-outline shrink-0';
        icon.textContent = 'schedule';
        pill.appendChild(icon);
      } else {
        const dot = document.createElement('span');
        dot.className = `w-2.5 h-2.5 rounded-full ${confidenceDotClass(tone)}`;
        pill.appendChild(dot);
      }
      const pillText = document.createElement('span');
      pillText.className = 'font-label-md text-label-md';
      pillText.textContent = confLine;
      pill.appendChild(pillText);
      confWrap.appendChild(pill);
      card.appendChild(confWrap);
    }

    if (price == null) {
      const prompt = document.createElement('button');
      prompt.type = 'button';
      prompt.dataset.act = 'log-fill';
      prompt.dataset.stationId = station.id;
      prompt.className = 'flex items-center justify-between p-space-md rounded-xl bg-surface-container-lowest hover:bg-surface-bright active:scale-[0.99] transition-all shadow-sm w-full text-left';
      const promptLeft = document.createElement('div');
      promptLeft.className = 'flex items-center gap-space-sm min-w-0';
      const promptIconWrap = document.createElement('div');
      promptIconWrap.className = 'w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary shrink-0';
      const promptIcon = document.createElement('span');
      promptIcon.className = 'material-symbols-outlined text-[20px]';
      promptIcon.textContent = 'add_a_photo';
      promptIconWrap.appendChild(promptIcon);
      const promptCopy = document.createElement('div');
      promptCopy.className = 'flex flex-col min-w-0';
      const promptTitle = document.createElement('span');
      promptTitle.className = 'font-label-lg text-label-lg text-primary font-bold truncate';
      promptTitle.textContent = 'Be the first to log fuel here';
      const promptSub = document.createElement('span');
      promptSub.className = 'font-body-sm text-body-sm text-on-surface-variant';
      promptSub.textContent = 'Snap pump or pump sign to help travelers';
      promptCopy.append(promptTitle, promptSub);
      promptLeft.append(promptIconWrap, promptCopy);
      prompt.appendChild(promptLeft);
      wireAct(prompt);
      card.appendChild(prompt);
    } else {
      const actions = document.createElement('div');
      actions.className = 'flex items-center justify-between pt-space-xs gap-space-sm';
      const drive = document.createElement('button');
      drive.type = 'button';
      drive.dataset.act = 'drive-now';
      drive.dataset.stationId = station.id;
      drive.className = isCheapest
        ? 'flex-1 h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center gap-1.5 font-label-lg text-label-lg active:scale-[0.98] transition-transform shadow-sm'
        : 'flex-1 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center gap-1.5 font-label-lg text-label-lg active:scale-[0.98] transition-transform';
      const driveIcon = document.createElement('span');
      driveIcon.className = 'material-symbols-outlined text-[18px]';
      driveIcon.textContent = isCheapest ? 'directions' : 'turn_sharp_right';
      const driveLabel = document.createElement('span');
      driveLabel.textContent = 'Drive Here';
      drive.append(driveIcon, driveLabel);
      wireAct(drive);

      const secondary = document.createElement('button');
      secondary.type = 'button';
      secondary.dataset.act = 'log-fill';
      secondary.dataset.stationId = station.id;
      secondary.className = isCheapest
        ? 'h-11 px-space-md rounded-xl bg-surface-container hover:bg-surface-container-high text-primary flex items-center justify-center gap-1 font-label-md text-label-md active:scale-95 transition-transform'
        : 'h-11 px-space-md rounded-xl bg-surface-container text-on-surface-variant flex items-center justify-center gap-1 font-label-md text-label-md';
      const secondaryIcon = document.createElement('span');
      secondaryIcon.className = 'material-symbols-outlined text-[18px]';
      secondaryIcon.textContent = isCheapest ? 'edit_calendar' : 'add_circle';
      const secondaryLabel = document.createElement('span');
      secondaryLabel.textContent = isCheapest ? 'Confirm' : 'Log';
      secondary.append(secondaryIcon, secondaryLabel);
      wireAct(secondary);

      actions.append(drive, secondary);
      card.appendChild(actions);
    }

    slot.appendChild(card);
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
  const gradeKey = saved?.grade || sessionStorage.getItem('plug-grade') || preferredGrade();
  const grade = gradeLabel(gradeKey);
  const rateNum = saved && Number(saved.amount) > 0 && Number(saved.litres) > 0
    ? Number(saved.amount) / Number(saved.litres)
    : null;
  const rate = rateNum != null ? `${money(rateNum)} / L` : '';
  const odo = saved?.odometer != null && Number(saved.odometer) > 0
    ? `${Number(saved.odometer).toLocaleString('en-JM')} km`
    : '';
  const car = sessionStorage.getItem('plug-car-name') || '';
  slotText(root, 'receipt-station', station || 'Not entered yet');
  slotText(root, 'receipt-amount', amount || 'Not entered yet');
  slotText(root, 'receipt-litres', litres);
  slotText(root, 'receipt-grade', grade && rate ? `${grade} @ ${rate}` : grade || 'Not entered yet');
  slotText(root, 'receipt-grade-badge', grade || '—');
  slotText(root, 'receipt-rate', rate || '—');
  const subtitle = [car ? `${car} updated` : '', odo ? `Odometer at ${odo}` : ''].filter(Boolean).join(' • ');
  slotText(root, 'saved-subtitle', subtitle || 'Fuel log saved');
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
  const priceStatus = sessionStorage.getItem('plug-price-status') || 'checking';
  const priceLine = priceStatus === 'published'
    ? 'On the map'
    : priceStatus === 'review'
      ? 'Waiting for a check. It is not on the map yet.'
      : 'Checking this price';
  setSlot(root, 'price-status', priceLine);
  root.querySelectorAll<HTMLElement>('[data-slot="fill-time"]').forEach((node) => {
    if (savedAt) node.dataset.liveRow = 'fill';
  });

  // Stitch 27c: show one live consensus card — never demo tab switchers.
  root.querySelector('#consensus-tab-bar')?.remove();
  const status = priceStatus === 'published' || priceStatus === 'review' ? priceStatus : 'checking';
  root.querySelectorAll<HTMLElement>('[data-price-card], #state-card-checking, #state-card-published, #state-card-review').forEach((card) => {
    const key = card.dataset.priceCard
      || (card.id === 'state-card-published' ? 'published' : card.id === 'state-card-review' ? 'review' : 'checking');
    card.classList.toggle('hidden', key !== status);
  });
  const stationBit = station || 'this station';
  slotText(root, 'consensus-checking-body', `Thanks! We're cross-referencing your ${grade} price at ${stationBit} — it'll help nearby drivers shortly.`);
  slotText(root, 'consensus-published-body', rateNum != null
    ? `${stationBit} price board updated to ${money(rateNum)}/L.`
    : `${stationBit} price board updated.`);
  slotText(root, 'consensus-published-grade', `${grade} verified active`);
  slotText(root, 'consensus-published-price', rateNum != null ? money(rateNum) : '—');
  slotText(root, 'consensus-review-body', `Your price looks slightly different from this week's baseline — the Roam Plug team will take a friendly peek. We've logged your fuel at ${stationBit} perfectly.`);

  if (root.querySelector('[data-grade-locked], #grades-tray')) {
    if (!sessionStorage.getItem('plug-preferred-grade')) {
      sessionStorage.setItem('plug-preferred-grade', preferredGrade());
    }
    if (!sessionStorage.getItem('plug-grade')) {
      sessionStorage.setItem('plug-grade', preferredGrade());
    }
    paintLockedGradeChrome(root, sessionStorage.getItem('plug-grade'));
  }
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
  const { data: sessionData } = await supabasePlugApp.auth.getSession();
  slotText(root, 'sign-in-method', signInProviderLabel(sessionData.session?.user?.app_metadata?.provider));
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

type CatalogPart = {
  part_id?: string;
  id?: string;
  part_name?: string;
  name?: string;
  category?: string;
  tier?: number;
  oem_part_number?: string | null;
  manufacturer?: string | null;
  fit_scope?: string | null;
  sister_names?: string | null;
  source_make?: string | null;
  reference_oem?: string | null;
  also_known_as?: string[] | null;
  confirmed_installs?: number | null;
  position?: string | null;
  description?: string | null;
};

function partIdOf(part: CatalogPart): string {
  return String(part.part_id || part.id || '');
}

function partNameOf(part: CatalogPart): string {
  return String(part.part_name || part.name || '').trim();
}

function fitFor(part: CatalogPart) {
  return buildFitMessage({
    tier: Number(part.tier) || 4,
    fitScope: part.fit_scope || null,
    sisterNames: part.sister_names || null,
    sourceMake: part.source_make || null,
    manufacturer: part.manufacturer || null,
    referenceOem: part.reference_oem || null,
    confirmedInstalls: Number(part.confirmed_installs) || 0,
  });
}

function fitClaim(part: CatalogPart): string {
  const fit = fitFor(part);
  if (fit.confirmedFit && Number(part.tier) === 1) return 'Exact factory part';
  if (fit.confirmedFit) return '100% fit';
  return fit.tierLabel;
}

function resultsCategory(): string {
  const query = window.location.hash.split('?')[1] || '';
  return new URLSearchParams(query).get('cat') || '';
}

function inCategory(part: CatalogPart, cat: string): boolean {
  if (!cat) return true;
  const name = String(part.category || '').trim();
  if (!name) return true;
  return name.toLowerCase() === cat.toLowerCase();
}

function detailPartId(): string {
  const match = window.location.hash.replace(/^#/, '').split('?')[0].match(/^\/parts\/([^/]+)$/);
  if (!match || match[1] === 'results' || match[1] === 'soon') return '';
  return decodeURIComponent(match[1]);
}

async function loadParts(): Promise<CatalogPart[]> {
  const variant = catalogVariant();
  if (!variant) return [];
  const body = await publicGet<{ parts?: CatalogPart[] }>(`/parts?variant=${encodeURIComponent(variant)}`);
  return body.parts || [];
}

function showRow(root: ParentNode, slot: string, text: string | null) {
  setSlot(root, slot, text);
}

function fillResults(root: HTMLElement, parts: CatalogPart[]) {
  const rows = parts.filter((part) => inCategory(part, resultsCategory()) && partNameOf(part));
  const empty = root.querySelector<HTMLElement>('[data-parts-empty]');
  const list = root.querySelector<HTMLElement>('[data-parts-list]');
  const template = root.querySelector<HTMLElement>('[data-part-template]');
  if (empty) empty.style.display = rows.length ? 'none' : '';
  showRow(root, 'parts-count', rows.length ? `${rows.length} part${rows.length === 1 ? '' : 's'} for your car` : null);
  if (!list || !template) return;
  list.replaceChildren();
  const groups = new Map<number, CatalogPart[]>();
  rows.forEach((part) => {
    const tier = Number(part.tier) || 4;
    const bucket = groups.get(tier) || [];
    bucket.push(part);
    groups.set(tier, bucket);
  });
  [...groups.keys()].sort((a, b) => a - b).forEach((tier) => {
    const group = document.createElement('section');
    group.className = 'space-y-space-sm';
    const title = document.createElement('h3');
    title.className = 'font-headline-sm text-headline-sm text-on-surface';
    title.textContent = fitFor(groups.get(tier)![0]).tierLabel;
    group.appendChild(title);
    groups.get(tier)!.forEach((part) => {
      const card = template.cloneNode(true) as HTMLElement;
      card.classList.remove('hidden');
      card.style.display = 'flex';
      card.removeAttribute('data-part-template');
      const id = partIdOf(part);
      const name = partNameOf(part);
      if (id) card.setAttribute('data-part-id', id);
      card.dataset.liveRow = 'part';
      card.addEventListener('click', (event) => {
        event.preventDefault();
        void handlePlugClick(card);
      });
      showRow(card, 'part-name', name);
      showRow(card, 'part-number', part.oem_part_number?.trim() || null);
      showRow(card, 'fit-reason', fitFor(part).matchReason);
      group.appendChild(card);
    });
    list.appendChild(group);
  });
}

function fillDetail(root: HTMLElement, parts: CatalogPart[]) {
  const id = detailPartId();
  const part = parts.find((row) => partIdOf(row) === id);
  const missing = root.querySelector<HTMLElement>('[data-part-missing]');
  const facts = root.querySelector<HTMLElement>('[data-part-facts]');
  if (!part) {
    if (missing) missing.style.display = '';
    if (facts) facts.style.display = 'none';
    return;
  }
  if (missing) missing.style.display = 'none';
  if (facts) facts.style.display = '';
  const fit = fitFor(part);
  showRow(root, 'part-name', partNameOf(part) || null);
  showRow(root, 'part-description', part.description?.trim() || null);
  showRow(root, 'manufacturer', part.manufacturer?.trim() || null);
  showRow(root, 'part-number', part.oem_part_number?.trim() || null);
  showRow(root, 'fit-claim', fitClaim(part));
  showRow(root, 'fit-reason', fit.matchReason);
  showRow(root, 'position', part.position?.trim() || null);
  const also = (part.also_known_as || []).map((value) => String(value).trim()).filter(Boolean);
  const slot = root.querySelector<HTMLElement>('[data-slot="also-known"]');
  if (slot) {
    slot.replaceChildren();
    also.forEach((number) => {
      const line = document.createElement('p');
      line.className = 'font-label-lg text-label-lg text-on-surface';
      line.textContent = number;
      slot.appendChild(line);
    });
    const row = (slot.closest('[data-slot-row]') as HTMLElement | null) || slot;
    row.style.display = also.length ? '' : 'none';
  }
}

async function fillParts(root: HTMLElement) {
  const screen = root.getAttribute('data-plug-screen') || '';
  const parts = await loadParts();
  const firstId = partIdOf(parts[0] || {});
  if (firstId) root.dataset.firstPart = firstId;
  if (screen === '39-parts-results.html') fillResults(root, parts);
  else if (screen === '40-part-detail.html') fillDetail(root, parts);
}

async function fillInbox(root: HTMLElement) {
  const body = await plugSend<{ notifications: { title?: string; body?: string; created_at?: string | null; kind?: string | null }[] }>('/notifications', 'GET').catch(() => ({ notifications: [] as { title?: string; body?: string; created_at?: string | null; kind?: string | null }[] }));
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
  slot.className = 'flex flex-col gap-space-sm';
  if (!notes.length) {
    const line = document.createElement('p');
    line.className = 'px-1 py-3 text-sm';
    line.textContent = 'Inbox is empty.';
    slot.appendChild(line);
    return;
  }
  notes.forEach((item) => {
    const title = (item.title || '').trim() || 'Update';
    const bodyText = (item.body || '').trim();
    const when = item.created_at ? whenLabel(item.created_at, true) : '';
    const kind = String(item.kind || title).toLowerCase();
    const priceNote = /price|pump|fuel|radar|scout|published|live/i.test(kind + title + bodyText);
    const icon = priceNote
      ? (/couldn|mismatch|discrep|review|not match/i.test(title + bodyText) ? 'history_toggle_off' : 'check_circle')
      : 'notifications';
    const eyebrow = priceNote
      ? (/couldn|mismatch|discrep|review|not match/i.test(title + bodyText) ? 'Pump Discrepancy' : 'Live on Radar')
      : 'Alert';
    const card = document.createElement('div');
    card.className = 'relative overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm p-space-md';
    card.innerHTML = `
      <div class="flex items-start gap-space-sm">
        <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0 text-primary-container">
          <span class="material-symbols-outlined text-[22px]" style="font-variation-settings: 'FILL' 1;">${icon}</span>
        </div>
        <div class="flex flex-col flex-1 min-w-0">
          <div class="flex items-center justify-between gap-space-xs mb-1">
            <span class="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider">${eyebrow}</span>
            ${when ? `<span class="font-label-sm text-label-sm text-on-surface-variant">${when}</span>` : ''}
          </div>
          <h3 class="font-headline-sm text-headline-sm text-on-surface font-bold leading-snug"></h3>
          ${bodyText ? '<p class="font-body-md text-body-md text-on-surface-variant mt-space-xs leading-relaxed"></p>' : ''}
        </div>
      </div>
    `;
    const heading = card.querySelector('h3');
    if (heading) heading.textContent = title;
    const para = card.querySelector('p');
    if (para && bodyText) para.textContent = bodyText;
    slot.appendChild(card);
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
    const status = pin.status === 'verified' || pin.status === 'approved'
      ? 'Approved'
      : pin.status === 'rejected'
        ? 'Not approved'
        : 'Pending';
    line.textContent = `${pin.name} · ${status}`;
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

function catalogFacts(row: CatalogVehicle): string[] {
  return [row.catalog_trim || row.trim_series || '', row.chassis_code || '', row.engine_code || '']
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function paintCatalogSpecs(root: HTMLElement, row: CatalogVehicle | null) {
  const slot = root.querySelector<HTMLElement>('[data-slot="catalog-specs"]');
  if (!slot) return;
  slot.textContent = '';
  const facts = row ? catalogFacts(row) : [];
  if (!facts.length) return;
  const line = document.createElement('p');
  line.className = 'px-4 py-2 font-label-md text-label-md text-on-surface';
  line.dataset.liveRow = 'catalog';
  line.textContent = facts.join(' · ');
  slot.appendChild(line);
}

async function catalogRow(car: Vehicle): Promise<CatalogVehicle | null> {
  const id = car.catalog_variant_id || catalogVariant();
  if (!id) return null;
  try {
    const body = await publicGet<{ vehicles: CatalogVehicle[] }>(`/vehicle-catalog?id=${encodeURIComponent(id)}`);
    return body.vehicles?.[0] || null;
  } catch {
    return null;
  }
}

function paintTrimChoices(root: HTMLElement, rows: CatalogVehicle[]) {
  const slot = root.querySelector<HTMLElement>('[data-slot="trims"]');
  if (!slot) return;
  const year = Number(sessionStorage.getItem('plug-year') || '');
  const shown = year ? rows.filter((row) => catalogCoversYear(row, year)) : rows;
  slot.textContent = '';
  shown.forEach((row) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'w-full min-h-12 rounded-xl bg-surface-container-lowest p-4 text-left font-bold shadow-sm';
    button.dataset.act = 'pick-catalog';
    button.dataset.catalogId = row.id;
    if (row.make) button.dataset.make = row.make;
    if (row.model) button.dataset.model = row.model;
    const title = [row.make, row.model].filter(Boolean).join(' ').trim() || 'This model';
    const facts = catalogFacts(row);
    button.textContent = facts.length ? `${title} · ${facts.join(' · ')}` : title;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      void handlePlugClick(button);
    });
    slot.appendChild(button);
  });
}

async function fillCatalog(root: HTMLElement, query: string) {
  const body = await publicGet<{ vehicles: CatalogVehicle[] }>(
    `/vehicle-catalog?q=${encodeURIComponent(query)}`,
  );
  const rows = body.vehicles || [];
  paintTrimChoices(root, rows);
  if (!rows.length) return;
  const cards = [...root.querySelectorAll<HTMLElement>('[data-make], button')];
  rows.slice(0, 8).forEach((row) => {
    const card = cards.find((node) => {
      const label = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (/continue|skip|back|search|clear|find your/.test(label)) return false;
      const make = (row.make || '').toLowerCase();
      const model = (row.model || '').toLowerCase();
      return (make && label.split(' ').includes(make)) || (model && label.split(' ').includes(model));
    });
    if (card && row.make) card.dataset.make = row.make;
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
  root.querySelectorAll<HTMLElement>('[data-add-car]').forEach((node) => {
    node.style.display = car ? 'none' : '';
  });
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
    root.dataset.filled = '1';
  } catch {
    slotText(root, 'car', 'Add a car');
    note(root, 'Could not load this. Go back and try again.', 'alert');
    root.dataset.filled = '1';
  }
}
