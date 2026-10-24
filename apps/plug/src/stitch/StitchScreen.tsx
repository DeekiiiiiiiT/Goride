import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { plugSend } from '../api';
import { useAuth } from '../auth';
import { presentStitch, stitchHtml } from './catalog';

type StitchMessage = {
  source?: string;
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
  const { sendCode, verifyCode, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const srcDoc = useMemo(() => presentStitch(file, stitchHtml(file)), [file]);

  useEffect(() => {
    if (file !== '01-splash.html') return;
    const timer = window.setTimeout(() => navigate('/welcome'), 1600);
    return () => window.clearTimeout(timer);
  }, [file, navigate]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<StitchMessage>) => {
      const message = event.data;
      if (!message || message.source !== 'roam-plug-stitch') return;
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
        title={file}
        srcDoc={srcDoc}
        style={{ width: '100%', maxWidth: 430, height: '100dvh', border: 0, background: '#fff8f2' }}
      />
    </div>
  );
}
