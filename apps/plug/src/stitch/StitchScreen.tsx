import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { googleDirections, plugSend, publicGet, wazeDirections } from '../api';
import { useAuth } from '../auth';
import { readQueue } from '../offline';
import { presentStitch, stitchHtml } from './catalog';

type StationCard = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  prices?: Record<string, number | null>;
};

type StitchMessage = {
  source?: string;
  kind?: string;
  app?: string;
  grade?: string;
  stationId?: string;
  id?: string;
  path?: string;
  label?: string;
  fields?: Record<string, string | boolean>;
};

const TAB: Record<string, string> = {
  explore: '/explore',
  'home-explore': '/explore',
  garage: '/garage',
  'garage---my-vehicles': '/garage',
  'log-fuel': '/fuel',
  'map-it': '/map',
  account: '/account',
};

function phoneFrom(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('1876')) return `+${digits}`;
  if (digits.startsWith('876')) return `+1${digits}`;
  return `+1876${digits}`;
}

export function StitchScreen({ file }: { file: string }) {
  const navigate = useNavigate();
  const params = useParams();
  const { sendCode, verifyCode, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stationsRef = useRef<StationCard[]>([]);
  const stationsReady = useRef(false);
  const srcDoc = useMemo(() => presentStitch(file, stitchHtml(file)), [file]);

  function tell(payload: Record<string, unknown>) {
    frameRef.current?.contentWindow?.postMessage({ source: 'roam-plug-parent', ...payload }, '*');
  }

  function paintLive() {
    const grade = sessionStorage.getItem('plug-grade') || 'e10_87';
    if (file === '15-home-explore.html' || file === '17-station-list.html') {
      tell(stationsReady.current
        ? { kind: 'stations', stations: stationsRef.current, grade }
        : { kind: 'loading' });
    }
    const waiting = readQueue().length;
    if (waiting) tell({ kind: 'queue', count: waiting });
  }

  useEffect(() => {
    if (file !== '01-splash.html') return;
    const timer = window.setTimeout(() => navigate('/welcome'), 1600);
    return () => window.clearTimeout(timer);
  }, [file, navigate]);

  useEffect(() => {
    void publicGet<{ stations: StationCard[] }>('/stations')
      .then((body) => { stationsRef.current = body.stations || []; stationsReady.current = true; paintLive(); })
      .catch(() => { stationsReady.current = true; paintLive(); });
  }, [file]);

  useEffect(() => {
    const pin = file === '43-place-pin.html' || file.includes('poor-gps');
    if (!pin || !navigator.geolocation) {
      if (pin) tell({ kind: 'gps', accuracy: null });
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (position) => tell({ kind: 'gps', accuracy: position.coords.accuracy }),
      () => tell({ kind: 'gps', accuracy: null }),
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [file]);

  useEffect(() => {
    if (file !== '27-saved.html' && file !== '27b-first-save.html' && file !== '46b-approved.html') return;
    if (sessionStorage.getItem('plug-celebrated')) return;
    sessionStorage.setItem('plug-celebrated', '1');
    if (navigator.vibrate) navigator.vibrate(20);
  }, [file]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<StitchMessage>) => {
      const message = event.data;
      if (!message || message.source !== 'roam-plug-stitch') return;
      if (message.kind === 'grade' && message.grade) {
        sessionStorage.setItem('plug-grade', message.grade);
        tell({ kind: 'stations', stations: stationsRef.current, grade: message.grade });
        return;
      }
      if (message.kind === 'open-station' && message.stationId) {
        navigate(`/stations/${message.stationId}`);
        return;
      }
      if (message.kind === 'directions' || message.kind === 'directions-sheet') {
        const wanted = message.stationId || params.id;
        const station = stationsRef.current.find((item) => item.id === wanted) || stationsRef.current[0];
        if (!station) {
          navigate('/stations/sample/directions');
          return;
        }
        const app = message.app || (message.kind === 'directions-sheet' ? '' : 'google');
        if (app === 'waze') window.open(wazeDirections(station.lat, station.lng), '_blank', 'noopener');
        else if (app === 'google') window.open(googleDirections(station.lat, station.lng), '_blank', 'noopener');
        else navigate(`/stations/${station.id}/directions`);
        if (navigator.vibrate) navigator.vibrate(10);
        return;
      }
      void act(message);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });

  async function act(message: StitchMessage) {
    const id = message.id || '';
    const label = message.label || '';
    const path = message.path || '';
    const fields = message.fields || {};
    setError(null);

    if (path && TAB[path]) {
      navigate(TAB[path]);
      return;
    }
    if (label === 'arrow_back') {
      navigate(-1);
      return;
    }
    if (file === '01-splash.html') {
      navigate('/welcome');
      return;
    }
    if (id === 'get-started-btn') {
      navigate('/how');
      return;
    }
    if (label === "Let's Go!" || label === 'Ready to Roll!') {
      navigate('/signup');
      return;
    }
    if (id === 'explore-btn' || label.startsWith('near_me')) {
      navigate('/explore');
      return;
    }
    if (id === 'login-btn' || label.includes('Log in')) {
      navigate('/login');
      return;
    }
    if (label === 'Sign up') {
      navigate('/signup');
      return;
    }
    if ((file === '04-signup-phone.html' || file === '14-login.html') && id === 'submit-btn') {
      try {
        const phone = phoneFrom(String(fields['phone-input'] || ''));
        sessionStorage.setItem('plug-phone', phone);
        await sendCode(phone);
        navigate(`/otp?phone=${encodeURIComponent(phone)}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send the code');
      }
      return;
    }
    if (file === '05-otp.html' && label.includes('Verify')) {
      const phone = sessionStorage.getItem('plug-phone') || '';
      const code = [0, 1, 2, 3, 4, 5].map((index) => String(fields[`otp-${index}`] || '')).join('');
      try {
        if (phone && code.length === 6) await verifyCode(phone, code);
        navigate('/profile');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That code did not work');
      }
      return;
    }
    if (file === '06-profile.html' && id === 'submit-btn') {
      sessionStorage.setItem('plug-name', String(fields['first-name-input'] || fields['display-name-input'] || ''));
      navigate('/consent');
      return;
    }
    if (id === 'agree-btn') {
      void plugSend('/profile', 'POST', { displayName: sessionStorage.getItem('plug-name'), consent: true }).catch(() => undefined);
      navigate('/permissions');
      return;
    }
    if (id === 'btn-continue' || id === 'btn-skip') {
      navigate('/garage/add');
      return;
    }
    if (id === 'submit-make-btn') {
      navigate('/garage/add/model');
      return;
    }
    if (file === '10-model-year.html' && label.includes('Continue')) {
      navigate('/garage/add/odometer');
      return;
    }
    if (id === 'submit-car-btn') {
      navigate('/garage/add/odometer');
      return;
    }
    if (id === 'finishBtn') {
      navigate('/garage/added');
      return;
    }
    if (label.includes('Go to Home')) {
      navigate('/explore');
      return;
    }
    if (label.includes('Vehicle Garage')) {
      navigate('/garage');
      return;
    }
    if (id === 'continueBtn') {
      navigate('/map/pin');
      return;
    }
    if (id === 'submit-btn' && file === '44-place-details.html') {
      navigate('/map/submitted');
      return;
    }
    if (label.includes('Map Another')) {
      navigate('/map');
      return;
    }
    if (label.includes('Back to Map')) {
      navigate('/explore');
      return;
    }
    if (label === 'tune' || label.includes('Filters')) {
      navigate('/filters');
      return;
    }
    if (label.endsWith('Mechanics')) {
      navigate('/places/mechanic');
      return;
    }
    if (label.endsWith('Fuel') && !label.includes('Log')) {
      navigate('/explore/list');
      return;
    }
    if (label.includes('Log Fuel')) {
      navigate('/fuel');
      return;
    }
    if (id === 'save-log-btn') {
      navigate('/fuel/saved');
      return;
    }
    if (id === 'done-btn' || label === 'Done check' || label === 'Done') {
      navigate('/explore');
      return;
    }
    if (id === 'sign-out-btn') {
      await signOut();
      navigate('/welcome');
    }
  }

  if (!srcDoc) {
    return <p style={{ padding: 24 }}>That screen was not in the Stitch set.</p>;
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f4ede6', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {error ? <p role="alert" style={{ margin: 12, color: '#9d4300' }}>{error}</p> : null}
      <iframe
        ref={frameRef}
        title={file}
        srcDoc={srcDoc}
        onLoad={paintLive}
        style={{ width: '100%', maxWidth: 430, height: '100dvh', border: 0, background: '#fff8f2' }}
      />
    </div>
  );
}
