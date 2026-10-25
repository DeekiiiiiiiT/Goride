import { useEffect, useState } from 'react';
import { publicGet } from '../api';
import { demoOn } from '../demo/mode';
import { kindFor } from './act-kind';
import { fillScreen } from './fill';
import { vehicleId } from './facts';
import { getPlugRuntime } from './click';
import { onPlugClick } from '../shell/actions';

type Station = { id: string; name: string; brand?: string };

export function SearchBody() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Station[]>([]);
  useEffect(() => {
    const input = document.querySelector('[aria-label="Search query"]') as HTMLInputElement | null;
    const onInput = () => setQuery(input?.value || '');
    input?.addEventListener('input', onInput);
    void publicGet<{ stations: Station[] }>('/stations').then((body) => setRows(body.stations || [])).catch(() => setRows([]));
    return () => input?.removeEventListener('input', onInput);
  }, []);
  const shown = rows.filter((row) => !query || `${row.name} ${row.brand || ''}`.toLowerCase().includes(query.toLowerCase()));
  if (query && shown.length === 0) {
    window.location.hash = '#/search/empty';
    return null;
  }
  return (
    <div className="flex flex-col gap-2 px-4 pb-3 pt-24">
      {shown.map((row) => (
        <button key={row.id} type="button" onClick={onPlugClick} data-station-id={row.id} data-act="open-station" className="min-h-12 rounded-xl bg-surface-container-lowest px-3 text-left font-bold shadow-sm">
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
  if (file === '05-otp.html' && !root.querySelector('#otp-code')) {
    const input = document.createElement('input');
    input.id = 'otp-code';
    input.inputMode = 'numeric';
    input.maxLength = 6;
    input.autocomplete = 'one-time-code';
    input.setAttribute('aria-label', 'Code');
    input.placeholder = '6-digit code';
    input.className = 'h-12 w-full rounded-xl bg-surface-container-low px-3 text-center tracking-[0.4em] font-bold';
    const verify = root.querySelector('[data-act="verify-continue"]');
    verify?.parentElement?.before(input);
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
        window.location.hash = `#/garage/${id}/service`;
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
        window.location.hash = `#/garage/${id}/documents/edit`;
      });
    });
  }
  if (file === '25-confirm-odometer.html') {
    const input = root.querySelector('#odometerInput') as HTMLInputElement | null;
    const stored = sessionStorage.getItem('plug-odometer');
    if (input && !stored && !demoOn()) input.value = '';
  }
  if (file === '43-place-pin.html') {
    const accuracy = Number(sessionStorage.getItem('plug-accuracy') || (demoOn() ? 12 : 999));
    if (accuracy > 50) {
      root.querySelectorAll('button').forEach((button) => {
        if (/confirm pin location|confirm location/i.test(button.textContent || '')) {
          button.setAttribute('disabled', 'true');
          button.setAttribute('title', 'Waiting for a better GPS fix');
        }
      });
    }
  }
  hideFlagged(root);
  void fillScreen(file, root);
}

const KIND_FLAG: Record<string, string> = {
  'log-fuel': 'plug.fuel_log',
  parts: 'plug.parts',
  'parts-map': 'plug.parts',
  tolls: 'plug.tolls',
  documents: 'plug.documents',
  map: 'plug.map_it',
  'map-kind': 'plug.map_it',
};

function hideFlagged(root: HTMLElement) {
  if (demoOn()) return;
  let runtime: ReturnType<typeof getPlugRuntime> | null = null;
  try {
    runtime = getPlugRuntime();
  } catch {
    return;
  }
  const screen = root.getAttribute('data-plug-screen') || '';
  root.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
    const flag = KIND_FLAG[kindFor(el.dataset.act || '', screen) || ''];
    if (flag && !runtime?.flagOn(flag)) el.hidden = true;
  });
}
