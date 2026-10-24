import { useEffect, useState } from 'react';
import { publicGet } from '../api';
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
    return <p className="px-4 py-8 pt-24 text-center text-on-surface-variant" role="status">No matches for “{query}”.</p>;
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
        sessionStorage.setItem('plug-service', /oil/i.test(name) ? 'oil' : 'service');
        const id = sessionStorage.getItem('plug-vehicle') || 'demo-car';
        window.location.hash = `#/garage/${id}/service`;
      });
    });
  }
  if (file === '36-documents.html') {
    root.querySelectorAll('h2').forEach((heading) => {
      if (!/fitness/i.test(heading.textContent || '')) return;
      const card = heading.closest('div');
      card?.addEventListener('click', () => {
        sessionStorage.setItem('plug-doc', 'fitness');
        const id = sessionStorage.getItem('plug-vehicle') || 'demo-car';
        window.location.hash = `#/garage/${id}/documents/edit`;
      });
    });
  }
  if (file === '24-odometer-scan.html' && !root.querySelector('#plug-odo-file')) {
    const input = document.createElement('input');
    input.id = 'plug-odo-file';
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.className = 'sr-only';
    input.addEventListener('change', () => {
      const reading = sessionStorage.getItem('plug-last-odo') || '84612';
      const next = String(Number(reading) + 120);
      sessionStorage.setItem('plug-odometer', next);
      window.location.hash = '#/fuel/confirm';
    });
    root.appendChild(input);
  }
  if (file === '43-place-pin.html') {
    const accuracy = Number(sessionStorage.getItem('plug-accuracy') || (sessionStorage.getItem('plug-demo') === '1' ? 12 : 999));
    sessionStorage.setItem('plug-accuracy', String(accuracy));
    if (accuracy > 50) {
      root.querySelectorAll('button').forEach((button) => {
        if (/confirm pin location|confirm location/i.test(button.textContent || '')) {
          button.setAttribute('disabled', 'true');
          button.setAttribute('title', 'Waiting for a better GPS fix');
        }
      });
    }
  }
}
