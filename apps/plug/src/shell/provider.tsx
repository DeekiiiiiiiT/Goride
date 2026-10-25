import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { demoOn } from '../demo/mode';
import { currentPath, fallbackFor, showsTabs, tabFor, TAB_ROOT, type PlugTab } from '../nav';
import { readQueue } from '../offline';
import { setPlugRuntime, type PlugRuntime } from './click';
import { PlugChrome, TabBar } from './chrome';

export function PlugShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const path = location.pathname || '/';
  const tabsOn = showsTabs(path);
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; yes: () => void; no: () => void } | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [signReturn, setSignReturn] = useState<string | null>(null);
  const [stacks, setStacks] = useState<Record<string, string[]>>({
    explore: ['/explore'],
    garage: ['/garage'],
    map: ['/map'],
    account: ['/account'],
    flow: ['/'],
  });

  const active = tabFor(path, null);

  const runtime = useMemo<PlugRuntime>(() => ({
    go: (next) => {
      const from = currentPath();
      const tab = tabFor(next, tabFor(from, null));
      const key = tab || 'flow';
      setStacks((prev) => {
        const stack = prev[key] || [];
        const trimmed = next === TAB_ROOT[tab as PlugTab] ? [next] : [...stack.filter((item) => item !== next), next];
        return { ...prev, [key]: trimmed };
      });
      navigate(next);
    },
    finish: (next) => {
      const from = currentPath();
      const tab = tabFor(next, tabFor(from, null));
      const key = tab || 'flow';
      setStacks((prev) => {
        const stack = (prev[key] || []).filter((item) => item !== from && item !== next);
        return { ...prev, [key]: [...stack, next] };
      });
      navigate(next);
    },
    back: () => {
      const here = currentPath();
      const tab = tabFor(here, null);
      const key = tab || 'flow';
      setStacks((prev) => {
        const stack = prev[key] || [];
        const nextStack = stack.length > 1 ? stack.slice(0, -1) : stack;
        const dest = nextStack[nextStack.length - 1];
        navigate(dest && dest !== here ? dest : fallbackFor(here));
        return { ...prev, [key]: nextStack.length ? nextStack : [fallbackFor(here)] };
      });
    },
    tab: (next) => {
      const tab = tabFor(next, null);
      if (!tab) {
        navigate(next);
        return;
      }
      if (active === tab) {
        setStacks((prev) => ({ ...prev, [tab]: [TAB_ROOT[tab]] }));
        navigate(TAB_ROOT[tab]);
        return;
      }
      setStacks((prev) => {
        const stack = prev[tab] || [TAB_ROOT[tab]];
        navigate(stack[stack.length - 1] || TAB_ROOT[tab]);
        return prev;
      });
    },
    toast: (text) => {
      setToast(text);
      window.setTimeout(() => setToast((current) => (current === text ? null : current)), 2800);
    },
    confirm: (message) => new Promise<boolean>((resolve) => {
      setConfirm({
        message,
        yes: () => { setConfirm(null); resolve(true); },
        no: () => { setConfirm(null); resolve(false); },
      });
    }),
    signIn: (returnTo) => setSignReturn(returnTo),
    openSheet: (name) => setSheet(name),
    closeSheet: () => setSheet(null),
    signedIn: () => auth.signedIn,
    flagOn: (flag) => demoOn() || auth.flagOn(flag as never),
    sendCode: auth.sendCode,
    verifyCode: auth.verifyCode,
    signOut: auth.signOut,
  }), [active, auth.flagOn, auth.sendCode, auth.signOut, auth.signedIn, auth.verifyCode, navigate]);

  useEffect(() => {
    setPlugRuntime(runtime);
    return () => setPlugRuntime(null);
  }, [runtime]);

  useEffect(() => {
    document.body.dataset.signedIn = auth.signedIn ? '1' : '';
    window.dispatchEvent(new Event('plug-refresh'));
  }, [auth.signedIn]);

  useEffect(() => {
    if (demoOn() || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      sessionStorage.setItem('plug-lat', String(pos.coords.latitude));
      sessionStorage.setItem('plug-lng', String(pos.coords.longitude));
      sessionStorage.setItem('plug-accuracy', String(pos.coords.accuracy));
    }, () => sessionStorage.setItem('plug-accuracy', '999'), { enableHighAccuracy: true });
  }, []);

  useEffect(() => {
    if (path !== '/') return;
    if (!auth.ready) return;
    const timer = window.setTimeout(() => navigate(auth.signedIn ? '/explore' : '/welcome'), 1500);
    return () => window.clearTimeout(timer);
  }, [auth.ready, auth.signedIn, navigate, path]);

  return (
    <div className="min-h-dvh bg-surface-dim text-on-surface">
      <div className="relative mx-auto min-h-dvh w-full max-w-[430px] bg-surface shadow-xl" style={{ transform: 'translateZ(0)' }}>
        {demoOn() ? (
          <div className="pointer-events-none fixed top-2 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-tertiary-fixed px-3 py-1 text-[11px] font-bold tracking-wide text-on-tertiary-fixed">
            DEMO
          </div>
        ) : null}
        <OfflineBanner onOpen={() => setSheet('queue')} waiting={readQueue().length} />
        <div className={tabsOn ? 'pb-24' : ''}>{children}</div>
        {tabsOn ? <TabBar active={active} signedIn={auth.signedIn} flagOn={(flag) => demoOn() || auth.flagOn(flag as never)} /> : null}
        <PlugChrome
          toast={toast}
          confirm={confirm}
          sheet={sheet}
          signReturn={signReturn}
          onCloseSheet={() => setSheet(null)}
          onCloseSign={() => setSignReturn(null)}
          onSignedIn={(dest) => { setSignReturn(null); navigate(dest); }}
        />
      </div>
    </div>
  );
}

function OfflineBanner({ waiting, onOpen }: { waiting: number; onOpen: () => void }) {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (!offline && waiting === 0) return null;
  return (
    <button type="button" onClick={onOpen} className="sticky top-0 z-[60] mx-auto flex w-fit items-center gap-1 rounded-full bg-tertiary-fixed px-2.5 py-1 text-on-tertiary-fixed shadow-sm">
      <span className="material-symbols-outlined text-[13px]">sync</span>
      <span className="text-[10px] font-bold tracking-tight">
        {offline ? 'Offline' : `${waiting} log${waiting === 1 ? '' : 's'} waiting`}
      </span>
    </button>
  );
}
