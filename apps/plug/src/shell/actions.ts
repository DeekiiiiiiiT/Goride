import type { MouseEvent as ReactMouseEvent } from 'react';
import { plugSend, publicGet } from '../api';
import { currentPath } from '../nav';
import { readQueue } from '../offline';
import { kindFor } from './act-kind';
import { catalogCoversYear, pinFix, type CatalogVehicle } from './facts';
import {
  controlLabel,
  garagePath,
  getPlugRuntime,
  goPath,
  gradeKey,
  iconName,
  launchDirections,
  odometerWarning,
  openDirections,
  phoneFrom,
  rememberGrade,
  saveFuel,
  screenFields,
  vehicleId,
} from './click';

const TAB_PATH: Record<string, string> = {
  explore: '/explore',
  'home-explore': '/explore',
  garage: '/garage',
  'garage---my-vehicles': '/garage',
  'log-fuel': '/fuel',
  'map-it': '/map',
  account: '/account',
};

function text(el: HTMLElement): string {
  return `${controlLabel(el)} ${el.getAttribute('aria-label') || ''} ${el.id}`.replace(/\s+/g, ' ').trim();
}

export function onPlugClick(event: ReactMouseEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
  void handlePlugClick(event.currentTarget);
}

export async function handlePlugClick(el: HTMLElement) {
  const rt = getPlugRuntime();
  const act = el.dataset.act || '';
  const screen = el.closest('[data-plug-screen]')?.getAttribute('data-plug-screen') || '';
  if (el.closest('[data-plug-sheet]') && (act === 'arrow-back' || act === 'close' || act === 'cancel')) {
    rt.closeSheet();
    return;
  }
  const kind = act ? kindFor(act, screen) : '';
  if (act && !kind && !el.dataset.path && !el.dataset.theme && !el.dataset.make && !el.dataset.stationId) return;
  const label = controlLabel(el);
  const blob = text(el).toLowerCase();
  const icon = iconName(el);
  const path = currentPath();
  const id = el.id;
  const dataPath = el.dataset.path || '';

  if (act === 'my-location') {
    window.dispatchEvent(new Event('plug-recenter'));
    return;
  }
  if (act === 'continue-with-phone' || kind === 'phone') {
    goPath('/signup');
    return;
  }
  if (el.dataset.catalogId) {
    sessionStorage.setItem('plug-catalog', el.dataset.catalogId);
    if (el.dataset.model) sessionStorage.setItem('plug-model', el.dataset.model);
    if (el.dataset.make) sessionStorage.setItem('plug-make', el.dataset.make);
    rt.toast(`${el.dataset.model || 'That car'} selected`);
    return;
  }
  if (act === 'continue-with-google' || kind === 'google') {
    try {
      await rt.continueWithGoogle();
    } catch (err) {
      rt.toast(err instanceof Error ? err.message : 'Google sign-in did not start');
    }
    return;
  }
  if (act === 'continue-with-apple' || kind === 'apple') {
    rt.toast('Apple sign-in is not available');
    return;
  }

  if (el.dataset.theme) {
    const theme = el.dataset.theme;
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('plug-theme', dark ? 'dark' : 'light');
    rt.toast(dark ? 'Dark theme on' : 'Light theme on');
    return;
  }
  if (el.dataset.act === 'open-place' && el.dataset.stationId) {
    rt.go(`/places/${el.dataset.stationId}`);
    return;
  }
  if (el.dataset.act === 'open-station' && el.dataset.stationId) {
    sessionStorage.setItem('plug-station', el.dataset.stationId);
    rt.go(`/stations/${el.dataset.stationId}`);
    return;
  }
  if (el.dataset.act === 'drive-now') {
    if (el.dataset.stationId) sessionStorage.setItem('plug-station', el.dataset.stationId);
    await openDirections(el.dataset.stationId);
    return;
  }
  if (el.dataset.act === 'log-fill') {
    if (el.dataset.stationId) sessionStorage.setItem('plug-station', el.dataset.stationId);
    goPath('/fuel');
    return;
  }
  if (el.dataset.act === 'see-all') {
    rt.go('/explore/list');
    return;
  }
  if (el.dataset.act === 'my-car') {
    goPath(garagePath());
    return;
  }
  if (el.dataset.act === 'create-account') {
    goPath('/signup');
    return;
  }
  if (dataPath && TAB_PATH[dataPath]) {
    const dest = TAB_PATH[dataPath];
    if (dest === '/fuel') {
      goPath('/fuel');
      return;
    }
    if (!rt.signedIn() && dest !== '/explore' && dest !== '/account') {
      rt.signIn(dest);
      return;
    }
    rt.tab(dest);
    return;
  }
  if (icon === 'arrow_back' || /^(back|go back)$/i.test(label) || blob.includes('go back')) {
    rt.back();
    return;
  }
  if (icon === 'close' || id === 'clear-phone' || /cancel or close|^close$|^cancel scan$/i.test(label)) {
    if (id === 'clear-phone') {
      const input = document.getElementById('phone-input') as HTMLInputElement | null;
      if (input) input.value = '';
      return;
    }
    if (path.startsWith('/fuel')) {
      rt.go(sessionStorage.getItem('plug-fuel-from') || '/explore');
      return;
    }
    rt.back();
    return;
  }
  if (icon === 'mic' || /voice search/i.test(blob)) return;
  if (icon === 'notifications' || /^inbox$/i.test(label)) {
    goPath('/inbox');
    return;
  }
  if (el.dataset.act === 'tune' || id === 'filters' || /^filters$/i.test(label)) {
    rt.openSheet('filters');
    return;
  }

  const grade = gradeKey(el, label);
  if (grade && (el.dataset.grade || el.dataset.plugGrade || /e-?10|ulsd|diesel/i.test(label))) {
    rememberGrade(grade, el);
    return;
  }

  if (el.dataset.make) {
    sessionStorage.setItem('plug-make', el.dataset.make);
    const button = document.getElementById('btn-text');
    if (button) button.textContent = `Continue with ${el.dataset.make}`;
    return;
  }
  if (/^\d{4}$/.test(label) && path.includes('/garage/add')) {
    sessionStorage.setItem('plug-year', label);
    rt.toast(`${label} selected`);
    return;
  }

  if (id === 'get-started-btn' || label === 'Get Started') return goPath('/how');
  if (id === 'explore-btn' || /explore without/i.test(blob) || /as guest/i.test(blob)) return goPath('/explore');
  if (id === 'login-btn' || /^log in$/i.test(label) || blob.includes('log in')) return goPath('/login');
  if (path === '/how' && (id === 'nextBtn' || id === 'skipBtn' || /let's go|ready to roll|create account/i.test(blob))) return goPath('/signup');

  if ((path === '/signup' || path === '/login') && (id === 'submit-btn' || /send code|continue|next/i.test(label))) {
    const fields = screenFields(el);
    const phone = phoneFrom(String(fields['phone-input'] || ''));
    try {
      sessionStorage.setItem('plug-phone', phone);
      await rt.sendCode(phone);
      rt.toast('Code sent');
      rt.go(`/otp`);
    } catch (err) {
      rt.toast(err instanceof Error ? err.message : 'Could not send the code');
    }
    return;
  }
  if (path === '/otp' && /resend/i.test(blob)) {
    try {
      await rt.sendCode(sessionStorage.getItem('plug-phone') || '');
      rt.toast('Code sent again');
    } catch (err) {
      rt.toast(err instanceof Error ? err.message : 'Could not send the code');
    }
    return;
  }
  if (path === '/otp' && /change number|edit number/i.test(blob)) return rt.go('/signup');
  if (path === '/otp' && /^\d/.test(label)) {
    const input = document.getElementById('otp-code') as HTMLInputElement | null;
    if (input && input.value.length < 6) input.value = `${input.value}${label.replace(/\D/g, '').slice(0, 1)}`;
    return;
  }
  if (path === '/otp' && /delete/i.test(label)) {
    const input = document.getElementById('otp-code') as HTMLInputElement | null;
    if (input) input.value = input.value.slice(0, -1);
    return;
  }
  if (path === '/otp' && /verify/i.test(blob)) {
    const fields = screenFields(el);
    const code = [0, 1, 2, 3, 4, 5].map((index) => String(fields[`otp-${index}`] || '')).join('')
      || String(fields['otp-code'] || fields['otp-input'] || fields.code || '');
    try {
      await rt.verifyCode(sessionStorage.getItem('plug-phone') || '', code.replace(/\D/g, ''));
      rt.go(sessionStorage.getItem('plug-profile-done') === '1' ? '/explore' : '/profile');
    } catch (err) {
      rt.toast(err instanceof Error ? err.message : 'That code did not work');
    }
    return;
  }
  if (path === '/profile' && (id === 'submit-btn' || /continue|next|save/i.test(label))) {
    const fields = screenFields(el);
    const name = String(fields['first-name-input'] || fields['display-name-input'] || label);
    sessionStorage.setItem('plug-name', name);
    rt.go('/consent');
    return;
  }
  if (id === 'agree-btn' || (path === '/consent' && /agree|continue|accept/i.test(blob))) {
    void plugSend('/profile', 'POST', { displayName: sessionStorage.getItem('plug-name'), consent: true }).catch(() => undefined);
    rt.go('/permissions');
    return;
  }
  if (path === '/permissions' && (id === 'btn-continue' || id === 'btn-skip' || /not now|continue|allow|next/i.test(blob))) {
    rt.go('/garage/add');
    return;
  }
  if (path === '/garage/add' && /can't find|cannot find|enter manually/i.test(blob)) return rt.go('/garage/add/missing');
  if (path === '/garage/add' && /skip for now/i.test(blob)) return rt.go('/explore');
  if (path === '/garage/add' && /continue/i.test(blob)) {
    const fields = screenFields(el);
    const typed = String(fields['make-search-input'] || '');
    if (typed) sessionStorage.setItem('plug-make', typed);
    if (!sessionStorage.getItem('plug-make')) {
      rt.toast('Choose a make');
      return;
    }
    rt.go('/garage/add/model');
    return;
  }
  if (path === '/garage/add/missing' && /continue|save|next/i.test(blob)) {
    const fields = screenFields(el);
    sessionStorage.setItem('plug-make', String(fields.make || fields['make-input'] || sessionStorage.getItem('plug-make') || 'Car'));
    sessionStorage.setItem('plug-model', String(fields.model || fields['model-input'] || 'Custom'));
    rt.go('/garage/add/odometer');
    return;
  }
  if (path === '/garage/add/model' && /can't find|cannot find/i.test(blob)) return rt.go('/garage/add/missing');
  if (path === '/garage/add/model' && /continue|next|save/i.test(blob)) {
    const fields = screenFields(el);
    const model = String(fields['model-input'] || fields.model || sessionStorage.getItem('plug-model') || '');
    if (!model) {
      rt.toast('Choose a model');
      return;
    }
    sessionStorage.setItem('plug-model', model);
    if (!sessionStorage.getItem('plug-year')) {
      rt.toast('Choose a year');
      return;
    }
    rt.go('/garage/add/odometer');
    return;
  }
  if (path === '/garage/add/model' && label && !/back|skip|search/i.test(label)) {
    sessionStorage.setItem('plug-model', label);
    rt.toast(`${label} selected`);
    return;
  }
  if (path === '/garage/add/odometer' && (id === 'finishBtn' || /save|continue|add car|finish/i.test(blob))) {
    const fields = screenFields(el);
    const reading = Number(String(fields.odometerDisplay || fields.odometer || fields['odometer-input'] || fields.reading || 0).replace(/,/g, ''));
    const warning = odometerWarning(reading);
    if (warning && sessionStorage.getItem('plug-odo-confirmed') !== String(reading)) {
      sessionStorage.setItem('plug-odo-confirmed', String(reading));
      rt.toast(warning);
      return;
    }
    const make = sessionStorage.getItem('plug-make') || '';
    const model = sessionStorage.getItem('plug-model') || '';
    const year = sessionStorage.getItem('plug-year') || '';
    if (!make || !model || !year) {
      rt.toast('Choose the make, model, and year');
      return;
    }
    let catalogVariantId = sessionStorage.getItem('plug-catalog');
    if (!catalogVariantId) {
      try {
        const catalog = await publicGet<{ vehicles: CatalogVehicle[] }>(
          `/vehicle-catalog?q=${encodeURIComponent(`${make} ${model}`)}`,
        );
        const chosenYear = Number(year);
        const match = catalog.vehicles.find((row) => (
          (row.make || '').toLowerCase() === make.toLowerCase()
          && (row.model || '').toLowerCase() === model.toLowerCase()
          && catalogCoversYear(row, chosenYear)
        )) || catalog.vehicles.find((row) => (row.model || '').toLowerCase() === model.toLowerCase());
        catalogVariantId = match?.id || '';
        if (catalogVariantId) sessionStorage.setItem('plug-catalog', catalogVariantId);
      } catch {
        catalogVariantId = '';
      }
    }
    try {
      const saved = await plugSend<{ vehicle: { id: string } }>('/vehicles', 'POST', {
        make,
        model,
        year: Number(year),
        nickname: `${year} ${make} ${model}`,
        startingOdometer: reading || null,
        catalogVariantId: catalogVariantId || null,
      });
      sessionStorage.setItem('plug-vehicle', saved.vehicle.id);
      sessionStorage.setItem('plug-last-odo', String(reading || 0));
      sessionStorage.setItem('plug-profile-done', '1');
      const next = sessionStorage.getItem('plug-after-vehicle');
      sessionStorage.removeItem('plug-after-vehicle');
      rt.go(next || '/garage/added');
    } catch (err) {
      rt.toast(err instanceof Error ? err.message : 'Could not add that car');
    }
    return;
  }
  if (path === '/garage/added' && /home|explore/i.test(blob)) return rt.go('/explore');
  if (path === '/garage/added' && /garage/i.test(blob)) return rt.go('/garage');

  if (path === '/fuel' && (id === 'capture-shutter-btn' || /capture|shutter|take photo|upload/i.test(blob))) {
    const input = document.getElementById('plug-odo-file') as HTMLInputElement | null;
    if (input && /upload|gallery|capture|shutter|photo/i.test(blob)) {
      input.click();
      return;
    }
  }
  if (path === '/fuel' && /type|enter manually|type it/i.test(blob)) return rt.go('/fuel/confirm');
  if (path === '/fuel/confirm' && /continue|looks right|confirm|next/i.test(blob)) {
    const fields = screenFields(el);
    const reading = Number(String(fields.odometerInput || fields.odometerDisplay || 0).replace(/,/g, ''));
    const warning = odometerWarning(reading);
    if (warning && sessionStorage.getItem('plug-odo-confirmed') !== String(reading)) {
      sessionStorage.setItem('plug-odo-confirmed', String(reading));
      rt.toast(warning);
      return;
    }
    sessionStorage.setItem('plug-odometer', String(reading));
    rt.go('/fuel/details');
    return;
  }
  if (id === 'save-log-btn' || (path === '/fuel/details' && /save/i.test(label))) {
    await saveFuel(el);
    return;
  }
  if (id === 'toggle-station-btn' || /not here|change station/i.test(blob)) {
    rt.openSheet('stations');
    return;
  }
  if ((path === '/fuel/saved' || path === '/fuel/offline') && /see my car|fuel history|my car|garage/i.test(blob)) {
    rt.go(garagePath());
    return;
  }
  if ((path === '/fuel/saved' || path === '/fuel/offline') && /done/i.test(label)) {
    rt.go(sessionStorage.getItem('plug-fuel-from') || '/explore');
    return;
  }

  if (path.startsWith('/explore') && /^fuel$/i.test(label)) {
    sessionStorage.setItem('plug-chip', 'fuel');
    window.dispatchEvent(new Event('plug-refresh'));
    if (path !== '/explore') rt.go('/explore');
    return;
  }
  if (path.startsWith('/explore') && /tolls/i.test(label)) return goPath('/tolls');
  if (path.startsWith('/explore') && /mechanics/i.test(label)) {
    sessionStorage.setItem('plug-chip', 'mechanic');
    window.dispatchEvent(new Event('plug-refresh'));
    rt.go('/explore');
    return;
  }
  if (path.startsWith('/explore') && /parts stores|parts/i.test(label) && path === '/explore') {
    sessionStorage.setItem('plug-chip', 'parts_store');
    window.dispatchEvent(new Event('plug-refresh'));
    return;
  }
  if (path.startsWith('/explore') && /air|restroom|car wash/i.test(label)) {
    sessionStorage.setItem('plug-chip', /car wash/i.test(label) ? 'car_wash' : 'restroom');
    window.dispatchEvent(new Event('plug-refresh'));
    rt.go('/explore');
    return;
  }
  if (/see all|list/i.test(label) && path.startsWith('/explore')) return rt.go('/explore/list');
  if (/map spot|map it|\+ map/i.test(blob)) return goPath('/map');
  if (/drive now|directions/i.test(blob) && !path.startsWith('/parts')) {
    await openDirections(el.dataset.stationId || sessionStorage.getItem('plug-station') || undefined);
    return;
  }
  if (/log fill|log fuel here/i.test(blob)) {
    if (el.dataset.stationId) sessionStorage.setItem('plug-station', el.dataset.stationId);
    return goPath('/fuel');
  }
  if (/waze/i.test(blob)) return launchDirections('waze');
  if (/google maps/i.test(blob)) return launchDirections('google');
  if (/is this wrong/i.test(blob)) {
    sessionStorage.setItem('plug-place-prefill', sessionStorage.getItem('plug-station') || '');
    return goPath('/map');
  }
  if (/my car|garage/i.test(label) && path === '/explore') return goPath(garagePath());

  if (path === '/search' && el.dataset.stationId) {
    sessionStorage.setItem('plug-station', el.dataset.stationId);
    rt.go(`/stations/${el.dataset.stationId}`);
    return;
  }
  if ((id === 'search-input' || /search stations/i.test(el.getAttribute('placeholder') || '')) && path === '/explore') {
    rt.go('/search');
    return;
  }

  if (path === '/garage' && /add vehicle|add a car|add car|\+/i.test(blob)) return goPath('/garage/add');
  if (path === '/garage' && !/add /i.test(blob)) return goPath(garagePath());

  if (/^\/garage\/[^/]+$/.test(path)) {
    if (el.dataset.act === 'find-parts' || /find parts|parts for/i.test(blob)) return goPath('/parts');
    if (el.dataset.act === 'log-service' || /^log service$/i.test(label)) return rt.go(garagePath('log-service'));
    if (el.dataset.act === 'service' || el.dataset.act === 'view-all-8' || /maintenance|schedule|view all/i.test(blob)) return rt.go(garagePath('schedule'));
    if (el.dataset.act === 'docs' || /documents/i.test(blob)) return rt.go(garagePath('documents'));
    if (el.dataset.act === 'fuel' || /fuel spend|spend/i.test(blob)) return rt.go(garagePath('spend'));
    if (el.dataset.act === 'history') return rt.go(garagePath('history'));
  }

  if (/maintenance/i.test(blob) && path.startsWith('/garage/')) return rt.go(garagePath('schedule'));
  if (/^history$/i.test(label) || icon === 'history') return rt.go(garagePath('history'));
  if (/fuel spend|spend/i.test(blob) && path.includes('/garage/')) return rt.go(garagePath('spend'));
  if (/documents/i.test(blob) && path.includes('/garage/') && !path.endsWith('/documents')) return rt.go(garagePath('documents'));
  if (/find parts|parts for/i.test(blob)) return goPath('/parts');
  if (/remove vehicle|remove car/i.test(blob) || el.dataset.act === 'delete-vehicle' || el.dataset.act === 'more-vert') {
    if (el.dataset.act === 'delete-vehicle') {
      const id = vehicleId();
      if (!id) return;
      try {
        await plugSend(`/vehicles/${id}`, 'DELETE');
        sessionStorage.removeItem('plug-vehicle');
        rt.toast('Vehicle removed');
        rt.go('/garage');
      } catch (err) {
        rt.toast(err instanceof Error ? err.message : 'Could not remove that vehicle');
      }
      return;
    }
    rt.go(`${garagePath()}/remove`);
    return;
  }
  if (path.endsWith('/schedule') && /history/i.test(blob)) return rt.go(garagePath('history'));
  if (path.endsWith('/schedule') && !/back/i.test(blob)) {
    const service = (el.dataset.op || label || '').trim();
    if (!service) return;
    sessionStorage.setItem('plug-service', service);
    rt.go(garagePath('service'));
    return;
  }
  if (path.endsWith('/log-service') && (id === 'saveBtn' || /save/i.test(label))) {
    const fields = screenFields(el);
    try {
      await plugSend('/services', 'POST', {
        vehicleId: vehicleId(),
        opCode: sessionStorage.getItem('plug-service') || label,
        odometer: Number(fields.odometer || sessionStorage.getItem('plug-last-odo') || 0) || null,
        doneOn: new Date().toISOString().slice(0, 10),
      });
      rt.toast(`${sessionStorage.getItem('plug-service') || 'Service'} saved`);
      rt.finish(garagePath('schedule'));
    } catch (err) {
      rt.toast(err instanceof Error ? err.message : 'Could not save that service');
    }
    return;
  }
  if (path.endsWith('/service') && /log this service|log service|mark as done/i.test(blob)) {
    rt.go(garagePath('log-service'));
    return;
  }
  if (path.endsWith('/documents') && !/back/i.test(blob)) {
    const docKind = (el.dataset.kind || label || '').trim();
    if (!docKind) return;
    sessionStorage.setItem('plug-doc', docKind);
    rt.go(garagePath('documents/edit'));
    return;
  }
  if (path.endsWith('/documents/edit') && /save|set|remind/i.test(blob)) {
    const fields = screenFields(el);
    const due = String(fields['expiry-date-input'] || fields.date || fields['due-input'] || fields.due || '');
    try {
      await plugSend('/reminders', 'POST', {
        vehicleId: vehicleId(),
        kind: sessionStorage.getItem('plug-doc') || label,
        dueOn: due || null,
      });
      rt.toast('Reminder saved');
      rt.finish(garagePath('documents'));
    } catch (err) {
      rt.toast(err instanceof Error ? err.message : 'Could not save that reminder');
    }
    return;
  }

  if (path.startsWith('/parts') && /add a car/i.test(blob)) return rt.go('/garage/add');
  if (act === 'copy') {
    const number = (el.closest('[data-plug-screen]')?.querySelector('[data-slot="part-number"]')?.textContent || '').trim();
    if (!number) return;
    try {
      await navigator.clipboard.writeText(number);
      rt.toast('Part number copied');
    } catch {
      rt.toast(number);
    }
    return;
  }
  if (path.startsWith('/parts') && /find store|find nearby|parts map|nearby parts|parts stores/i.test(blob)) {
    sessionStorage.setItem('plug-chip', 'parts_store');
    rt.go('/explore');
    return;
  }
  if (path === '/parts' && /brakes/i.test(blob)) return rt.go('/parts/results?cat=Brakes');
  if (path === '/parts' && label && !/back|search/i.test(blob)) return rt.go(`/parts/results?cat=${encodeURIComponent(label)}`);
  if (path.startsWith('/parts/results')) {
    const screen = el.closest('[data-plug-screen]') as HTMLElement | null;
    const partId = el.dataset.partId || (el.dataset.act?.startsWith('tier-') ? screen?.dataset.firstPart : '');
    if (!partId) return;
    rt.go(`/parts/${partId}`);
    return;
  }
  if (path.startsWith('/parts/') && /find nearby|parts stores|directions/i.test(blob)) {
    sessionStorage.setItem('plug-chip', 'parts_store');
    rt.go('/explore');
    return;
  }
  if (/coming soon/i.test(blob)) return rt.go('/parts/soon');

  if (path === '/map' && (id === 'continueBtn' || /^continue$/i.test(label))) {
    if (!sessionStorage.getItem('plug-place-kind')) sessionStorage.setItem('plug-place-kind', 'mechanic');
    rt.go('/map/pin');
    return;
  }
  if (path === '/map' && /mechanic|parts|station|restroom|facility|wash|tyre|tire/i.test(blob)) {
    const kind = /mechanic/i.test(blob) ? 'mechanic'
      : /part/i.test(blob) ? 'parts_store'
        : /restroom|facility/i.test(blob) ? 'restroom'
          : /wash/i.test(blob) ? 'car_wash'
            : 'mechanic';
    sessionStorage.setItem('plug-place-kind', kind);
    rt.go('/map/pin');
    return;
  }
  if (path === '/map' && /my pins/i.test(blob)) return goPath('/contributions');
  if (path === '/map/pin' && (el.dataset.act === 'confirm-pin-location' || /confirm pin location|confirm location|use this|this spot/i.test(blob))) {
    const fix = pinFix();
    if (!fix) {
      rt.go('/map/pin/poor');
      return;
    }
    rt.go('/map/details');
    return;
  }
  if (path === '/gps' && /try again|back to map|got it|continue/i.test(blob)) return rt.go('/map/pin');
  if (path === '/map/details' && el.dataset.brand) {
    sessionStorage.setItem('plug-place-brand', el.dataset.brand);
    rt.toast(`${el.dataset.brand} selected`);
    return;
  }
  if (path === '/map/details' && /snap|photo|camera/i.test(blob)) {
    sessionStorage.setItem('plug-pin-photo', '1');
    rt.toast('Photo added');
    return;
  }
  if (path === '/map/details' && (id === 'submit-btn' || /submit|send/i.test(label))) {
    const fields = screenFields(el);
    const ticks = Object.entries(fields).filter(([, value]) => value === true).map(([key]) => key);
    const fix = pinFix();
    const name = String(fields.name || fields['place-name'] || '').trim();
    if (!name || !fix) {
      rt.toast(name ? 'GPS is not accurate enough yet' : 'Add a place name');
      if (!fix) rt.go('/map/pin/poor');
      return;
    }
    try {
      const saved = await plugSend<{ placeId?: string; id?: string }>('/pins', 'POST', {
        name,
        kind: sessionStorage.getItem('plug-place-kind') || 'mechanic',
        lat: fix.lat,
        lng: fix.lng,
        accuracyM: fix.accuracyM,
        note: ticks.join(', '),
      });
      if (saved.placeId || saved.id) sessionStorage.setItem('plug-pin', String(saved.placeId || saved.id));
      rt.go('/map/submitted-toast');
    } catch (err) {
      rt.toast(err instanceof Error ? err.message : 'Could not submit that pin');
    }
    return;
  }
  if ((path === '/map/submitted' || path === '/map/submitted-toast') && /map another/i.test(blob)) return rt.go('/map');
  if ((path === '/map/submitted' || path === '/map/submitted-toast') && /back to (map|island)/i.test(blob)) return rt.go('/map');
  if ((path === '/map/submitted' || path === '/map/submitted-toast') && /my pins|see my pins|submitted places|my contributions/i.test(blob)) return goPath('/contributions');
  if (path === '/contributions/approved' && /map another/i.test(blob)) return rt.go('/map');
  if (path === '/contributions/approved' && /view on island|explore/i.test(blob)) return rt.go('/explore');
  if (path === '/contributions' && /help map|parish/i.test(blob)) return rt.go('/parish');
  if (path === '/contributions' && /approved/i.test(blob) && !/not approved|awaiting/i.test(blob)) return rt.go('/contributions/approved');
  if (path === '/contributions') return rt.go('/pending');
  if ((path === '/pending' || path === '/map/withdraw') && /withdraw/i.test(blob)) {
    if (path === '/pending' && el.dataset.act !== 'confirmWithdrawBtn' && el.dataset.act !== 'withdraw-pin') {
      rt.go('/map/withdraw');
      return;
    }
    const pinId = el.dataset.pinId || sessionStorage.getItem('plug-pin') || '';
    if (!pinId) {
      rt.toast('Choose a pin to withdraw');
      return;
    }
    try {
      await plugSend(`/pins/${pinId}/withdraw`, 'POST');
      rt.toast('Pin withdrawn');
      rt.go('/contributions');
    } catch (err) {
      rt.toast(err instanceof Error ? err.message : 'Could not withdraw that pin');
    }
    return;
  }
  if (path === '/parish') return rt.go('/map');

  if (id === 'sign-out-btn' || /^sign out$/i.test(label)) {
    await rt.signOut();
    sessionStorage.removeItem('plug-profile-done');
    rt.go('/welcome');
    return;
  }
  if (/my pins/i.test(blob)) return goPath('/contributions');
  if (/notification settings|notifications/i.test(blob) && path === '/account') return rt.go('/account/notifications');
  if (/privacy/i.test(blob)) return goPath('/account/privacy');
  if (path === '/account' && /settings/i.test(blob)) return rt.go('/settings');
  if (path === '/account' && /help/i.test(blob)) return rt.go('/help');
  if (/^settings$/i.test(label) || icon === 'settings') return rt.go('/settings');
  if (/^help$/i.test(label) || icon === 'help') return rt.go('/help');
  if (path === '/account/privacy' && /download/i.test(blob)) {
    try {
      const data = await plugSend<unknown>('/me/export', 'GET');
      const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'roam-plug-data.json';
      link.click();
      URL.revokeObjectURL(url);
      rt.toast('Download started');
    } catch (err) {
      rt.toast(err instanceof Error ? err.message : 'Could not download your data');
    }
    return;
  }
  if (path === '/account/privacy' && /delete account/i.test(blob)) {
    const ok = await rt.confirm('Delete your account? This number will not open the old garage.');
    if (!ok) return;
    try {
      await plugSend('/me', 'DELETE');
      await rt.signOut();
      sessionStorage.removeItem('plug-profile-done');
      rt.go('/welcome');
    } catch (err) {
      rt.toast(err instanceof Error ? err.message : 'Could not delete the account');
    }
    return;
  }
  if ((/apply/i.test(label) || /show \d+ stations/i.test(blob)) && (path === '/filters' || path === '/explore')) {
    rt.closeSheet();
    rt.toast('Filters applied');
    rt.go('/explore/list');
    return;
  }
  if (/offline|waiting/i.test(blob)) {
    rt.openSheet('queue');
    return;
  }
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
    if (path !== '/search' && /search/i.test(el.getAttribute('placeholder') || '')) rt.go('/search');
    return;
  }

  if (icon === 'search' && path !== '/search') {
    rt.go('/search');
    return;
  }

  if (el.dataset.stationId && !path.startsWith('/map') && !path.startsWith('/parts') && !path.startsWith('/garage') && !path.startsWith('/account') && !path.startsWith('/fuel')) {
    sessionStorage.setItem('plug-station', el.dataset.stationId);
    rt.go(`/stations/${el.dataset.stationId}`);
    return;
  }
  if (path.startsWith('/stations') && /log fuel/i.test(blob)) return goPath('/fuel');
}

export function queueCount(): number {
  return readQueue().length;
}

export async function nearestStationName(): Promise<string> {
  try {
    const body = await publicGet<{ stations: { id: string; name: string; lat: number; lng: number }[] }>('/stations');
    const first = body.stations[0];
    if (first) {
      sessionStorage.setItem('plug-station', first.id);
      sessionStorage.setItem('plug-station-lat', String(first.lat));
      sessionStorage.setItem('plug-station-lng', String(first.lng));
      return first.name;
    }
  } catch {
    return '';
  }
  return '';
}
