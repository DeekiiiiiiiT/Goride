import { useEffect, useState } from 'react';
import { publicGet } from '../api';
import { fillScreen } from './fill';
import { vehicleId } from './facts';
import { getPlugRuntime } from './click';
import { onPlugClick } from '../shell/actions';

type Station = { id: string; name: string; brand?: string };

type SearchPlace = { id: string; name: string; kind?: string };

export function SearchBody() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Station[]>([]);
  const [places, setPlaces] = useState<SearchPlace[]>([]);
  useEffect(() => {
    const input = document.querySelector('[aria-label="Search query"]') as HTMLInputElement | null;
    const onInput = () => setQuery(input?.value || '');
    input?.addEventListener('input', onInput);
    void publicGet<{ stations: Station[] }>('/stations').then((body) => setRows(body.stations || [])).catch(() => setRows([]));
    void publicGet<{ places: SearchPlace[] }>('/places').then((body) => setPlaces(body.places || [])).catch(() => setPlaces([]));
    return () => input?.removeEventListener('input', onInput);
  }, []);
  const q = query.toLowerCase();
  const shown = rows.filter((row) => !q || `${row.name} ${row.brand || ''}`.toLowerCase().includes(q));
  const shownPlaces = places.filter((row) => !q || row.name.toLowerCase().includes(q));
  useEffect(() => {
    if (query && shown.length === 0 && shownPlaces.length === 0 && (rows.length > 0 || places.length > 0)) getPlugRuntime().go('/search/empty');
  }, [query, rows.length, places.length, shown.length, shownPlaces.length]);
  if (query && shown.length === 0 && shownPlaces.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pb-3 pt-24">
      {shown.map((row) => (
        <button key={row.id} type="button" onClick={onPlugClick} data-station-id={row.id} data-act="open-station" className="min-h-12 rounded-xl bg-surface-container-lowest px-3 text-left font-bold shadow-sm">
          {row.name}
        </button>
      ))}
      {shownPlaces.map((row) => (
        <button key={row.id} type="button" onClick={onPlugClick} data-station-id={row.id} data-act="open-place" className="min-h-12 rounded-xl bg-surface-container-lowest px-3 text-left font-bold shadow-sm">
          {row.name}
        </button>
      ))}
    </div>
  );
}

export function bindScreen(file: string, root: HTMLElement) {
  if (file === '49-search.html') {
    const input = root.querySelector('[aria-label="Search query"]') as HTMLInputElement | null;
    if (input && input.value === 'Highway 2000') input.value = '';
  }
  if (file === '25-confirm-odometer.html') {
    const input = root.querySelector('#odometerInput') as HTMLInputElement | null;
    const stored = sessionStorage.getItem('plug-odometer');
    if (input && stored) input.value = stored;
  }
  if (file === '26-fuel-details.html') {
    const name = sessionStorage.getItem('plug-station-name');
    const card = root.querySelector('#verified-station-card');
    if (card && name) {
      const title = card.querySelector('h2, h3, strong') || card.querySelector('span');
      if (title) title.textContent = name;
    }
  }
  if (file === '31-maintenance-schedule.html') {
    root.querySelectorAll('div.cursor-pointer').forEach((card) => {
      card.addEventListener('click', () => {
        const name = card.textContent || '';
        const service = name.replace(/\s+/g, ' ').trim();
        if (!service) return;
        sessionStorage.setItem('plug-service', service);
        const id = vehicleId();
        if (!id) return;
        window.dispatchEvent(new Event('plug-refresh'));
        getPlugRuntime().go(`/garage/${id}/service`);
      });
    });
  }
  if (file === '36-documents.html') {
    root.querySelectorAll('h2').forEach((heading) => {
      const kind = (heading.textContent || '').replace(/\s+/g, ' ').trim();
      if (!kind) return;
      const card = heading.closest('div');
      card?.addEventListener('click', () => {
        sessionStorage.setItem('plug-doc', kind);
        const id = vehicleId();
        if (!id) return;
        window.dispatchEvent(new Event('plug-refresh'));
        getPlugRuntime().go(`/garage/${id}/documents/edit`);
      });
    });
  }
  if (file === '25-confirm-odometer.html') {
    const input = root.querySelector('#odometerInput') as HTMLInputElement | null;
    const stored = sessionStorage.getItem('plug-odometer');
    if (input && !stored) input.value = '';
  }
  if (file === '43-place-pin.html') {
    const accuracy = Number(sessionStorage.getItem('plug-accuracy') || 999);
    if (accuracy > 50) {
      root.querySelectorAll('button').forEach((button) => {
        if (/confirm pin location|confirm location/i.test(button.textContent || '')) {
          button.setAttribute('disabled', 'true');
          button.setAttribute('title', 'Waiting for a better GPS fix');
        }
      });
    }
  }
  if (file === '42-choose-type.html') paintChosenType(root);
  if (file === '44-place-details.html') {
    const fuel = sessionStorage.getItem('plug-place-kind') === 'fuel';
    const brand = root.querySelector<HTMLElement>('#brand-selector');
    if (brand) brand.hidden = !fuel;
  }
  tuneFields(root);
  void fillScreen(file, root);
}

function tuneFields(root: HTMLElement) {
  root.querySelectorAll('input, textarea').forEach((node) => {
    const input = node as HTMLInputElement;
    const hint = `${input.id} ${input.getAttribute('aria-label') || ''} ${input.placeholder || ''}`.toLowerCase();
    if (/phone/.test(hint)) {
      input.type = 'tel';
      input.inputMode = 'tel';
      if (!input.autocomplete) input.autocomplete = 'tel';
      input.enterKeyHint = 'next';
    } else if (/otp|code|one-time/.test(hint)) {
      input.inputMode = 'numeric';
      input.autocomplete = 'one-time-code';
      input.enterKeyHint = 'done';
    } else if (/email/.test(hint)) {
      input.type = 'email';
      input.autocomplete = 'email';
      input.enterKeyHint = 'next';
    } else if (/amount|litre|liter|cost|price/.test(hint)) {
      if (input.type === 'number') input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.enterKeyHint = 'next';
    } else if (/odometer|mileage|km\b/.test(hint)) {
      if (input.type === 'number') input.type = 'text';
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.enterKeyHint = 'next';
    } else if (/search/.test(hint)) {
      input.enterKeyHint = 'search';
      if (!input.autocomplete) input.autocomplete = 'off';
    } else if (/name|nickname|plate/.test(hint)) {
      if (!input.autocomplete) input.autocomplete = 'name';
      input.enterKeyHint = 'next';
    }
    if (!input.enterKeyHint) input.enterKeyHint = 'done';
  });
}

function paintChosenType(root: HTMLElement) {
  const chosen = sessionStorage.getItem('plug-place-kind') || '';
  root.querySelectorAll<HTMLElement>('[data-kind]').forEach((el) => {
    el.setAttribute('aria-checked', el.dataset.kind === chosen ? 'true' : 'false');
  });
  const label = root.querySelector('#selectedLabel');
  if (label) label.textContent = chosen ? (root.querySelector<HTMLElement>(`[data-kind="${chosen}"]`)?.getAttribute('aria-label') || 'Choose a type') : 'Choose a type';
}
