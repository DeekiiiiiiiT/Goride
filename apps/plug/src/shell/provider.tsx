import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { currentPath, fallbackFor, showsTabs, tabFor, TAB_ROOT, type PlugTab } from '../nav';
import { readQueue } from '../offline';
import { setPlugRuntime, type PlugRuntime } from './click';
import { PlugChrome, TabBar } from './chrome';
import { useKeyboardInset } from './viewport';

export function PlugShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const path = location.pathname || '/';
  const scrollRef = useRef<HTMLDivElement>(null);
  const keyboard = useKeyboardInset();
  const [ownBar, setOwnBar] = useState(false);
  const routeTabs = showsTabs(path);
  const tabsOn = routeTabs && !ownBar && keyboard === 0;
  const mapHome = path === '/explore';
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
  const confirmRef = useRef(confirm);
  const overlayRef = useRef(false);
  const releaseGate = useRef<Promise<void> | null>(null);
  const releaseRef = useRef<() => Promise<void>>(async () => {});
  confirmRef.current = confirm;
  releaseRef.current = () => {
    if (releaseGate.current) return releaseGate.current;
    if (!history.state?.plugOverlay) {
      overlayRef.current = false;
      return Promise.resolve();
    }
    overlayRef.current = false;
    releaseGate.current = new Promise<void>((resolve) => {
      const done = () => {
        window.removeEventListener('popstate', done);
        releaseGate.current = null;
        resolve();
      };
      window.addEventListener('popstate', done);
      history.back();
    });
    return releaseGate.current;
  };

  const active = tabFor(path, null);

  const scrollTop = () => {
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const runtime = useMemo<PlugRuntime>(() => ({
    go: (next) => {
      void releaseRef.current().then(() => {
        const from = currentPath();
        const tab = tabFor(next, tabFor(from, null));
        const key = tab || 'flow';
        setStacks((prev) => {
          const stack = prev[key] || [];
          const trimmed = next === TAB_ROOT[tab as PlugTab] ? [next] : [...stack.filter((item) => item !== next), next];
          return { ...prev, [key]: trimmed };
        });
        navigate(next);
      });
    },
    finish: (next) => {
      void releaseRef.current().then(() => {
        const from = currentPath();
        const tab = tabFor(next, tabFor(from, null));
        const key = tab || 'flow';
        setStacks((prev) => {
          const stack = (prev[key] || []).filter((item) => item !== from && item !== next);
          return { ...prev, [key]: [...stack, next] };
        });
        navigate(next, { replace: true });
      });
    },
    back: () => {
      void releaseRef.current().then(() => {
        const here = currentPath();
        const tab = tabFor(here, null);
        const key = tab || 'flow';
        setStacks((prev) => {
          const stack = prev[key] || [];
          const nextStack = stack.length > 1 ? stack.slice(0, -1) : stack;
          const stacked = nextStack[nextStack.length - 1];
          const dest = stacked && stacked !== here ? stacked : fallbackFor(here);
          if (dest !== here) navigate(dest, { replace: true });
          return { ...prev, [key]: nextStack.length ? nextStack : [dest] };
        });
      });
    },
    tab: (next) => {
      void releaseRef.current().then(() => {
        const tab = tabFor(next, null);
        if (!tab) {
          navigate(next);
          return;
        }
        if (active === tab) {
          setStacks((prev) => ({ ...prev, [tab]: [TAB_ROOT[tab]] }));
          navigate(TAB_ROOT[tab]);
          scrollTop();
          return;
        }
        setStacks((prev) => {
          const stack = prev[tab] || [TAB_ROOT[tab]];
          navigate(stack[stack.length - 1] || TAB_ROOT[tab]);
          return prev;
        });
      });
    },
    toast: (text) => {
      setToast(text);
      window.setTimeout(() => setToast((current) => (current === text ? null : current)), 3000);
    },
    confirm: (message) => new Promise<boolean>((resolve) => {
      const settle = (accepted: boolean) => {
        void releaseRef.current().then(() => {
          setConfirm(null);
          resolve(accepted);
        });
      };
      setConfirm({
        message,
        yes: () => settle(true),
        no: () => settle(false),
      });
    }),
    signIn: (returnTo) => {
      if (auth.signedIn) return;
      setSignReturn(returnTo);
    },
    openSheet: (name) => setSheet(name),
    closeSheet: () => {
      void releaseRef.current().then(() => setSheet(null));
    },
    signedIn: () => auth.signedIn,
    flagOn: (flag) => auth.flagOn(flag as never),
    sendCode: auth.sendCode,
    verifyCode: auth.verifyCode,
    signOut: auth.signOut,
    continueWithGoogle: auth.continueWithGoogle,
  }), [active, auth.continueWithGoogle, auth.flagOn, auth.sendCode, auth.signOut, auth.signedIn, auth.verifyCode, navigate]);

  useEffect(() => {
    setPlugRuntime(runtime);
    return () => setPlugRuntime(null);
  }, [runtime]);

  useEffect(() => {
    document.body.dataset.signedIn = auth.signedIn ? '1' : '';
    window.dispatchEvent(new Event('plug-refresh'));
  }, [auth.signedIn]);

  useEffect(() => {
    const session = auth.session;
    if (!session || !auth.joined) return;
    const user = session.user;
    const meta = (user.app_metadata || {}) as { provider?: string; providers?: string[] };
    const google = meta.provider === 'google' || (meta.providers || []).includes('google');
    if (!google) return;
    const name = String(user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.display_name || '').trim();
    const here = currentPath();
    if (['/', '/welcome', '/signup', '/otp', '/login'].includes(here)) navigate(name ? '/explore' : '/profile');
  }, [auth.joined, auth.session, navigate]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      sessionStorage.setItem('plug-lat', String(pos.coords.latitude));
      sessionStorage.setItem('plug-lng', String(pos.coords.longitude));
      sessionStorage.setItem('plug-accuracy', String(pos.coords.accuracy));
    }, () => sessionStorage.setItem('plug-accuracy', '999'), { enableHighAccuracy: true });
  }, []);

  useEffect(() => {
    if (path !== '/') return;
    if (!auth.ready) return;
    if (auth.signedIn && !auth.joined && !auth.joinError) return;
    const timer = window.setTimeout(() => {
      if (auth.joinError) return;
      navigate(auth.signedIn ? '/explore' : '/welcome');
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [auth.ready, auth.signedIn, auth.joined, auth.joinError, navigate, path]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const check = () => {
      const found = Array.from(root.querySelectorAll('nav')).some((nav) => /\bbottom-0\b/.test(nav.className));
      setOwnBar(found);
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [path]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const locked = Boolean(sheet || confirm || signReturn);
    root.style.overflow = locked ? 'hidden' : '';
    root.style.overscrollBehavior = locked ? 'none' : '';
  }, [sheet, confirm, signReturn]);

  const overlayOpen = Boolean(sheet || confirm || signReturn);

  const dismissTop = () => {
    void releaseRef.current().then(() => {
      confirmRef.current?.no();
      setSheet(null);
      setSignReturn(null);
    });
  };
  const dismissRef = useRef(dismissTop);
  dismissRef.current = dismissTop;

  useEffect(() => {
    if (overlayOpen && !overlayRef.current) {
      history.pushState({ plugOverlay: 1 }, '');
      overlayRef.current = true;
    }
  }, [overlayOpen]);

  useEffect(() => {
    const onPop = () => {
      if (!overlayRef.current) return;
      overlayRef.current = false;
      confirmRef.current?.no();
      setSheet(null);
      setSignReturn(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && overlayRef.current) {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Enter') return;
      const el = event.target as HTMLElement | null;
      if (!el || !el.matches('input')) return;
      const field = el as HTMLInputElement;
      if (field.enterKeyHint === 'done' || field.enterKeyHint === 'send' || field.enterKeyHint === 'search' || field.enterKeyHint === 'go') return;
      const scope = field.closest('form, [data-plug-screen]') || document;
      const fields = Array.from(scope.querySelectorAll<HTMLElement>('input, textarea, select')).filter((node) => {
        const input = node as HTMLInputElement;
        return !input.disabled && input.type !== 'hidden' && input.tabIndex !== -1;
      });
      const next = fields[fields.indexOf(field) + 1];
      if (!next) return;
      event.preventDefault();
      next.focus();
    };
    const onFocus = (event: FocusEvent) => {
      const el = event.target as HTMLElement | null;
      if (!el?.matches('input, textarea, select')) return;
      window.setTimeout(() => el.scrollIntoView({ block: 'center' }), 60);
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
    };
  }, []);

  return (
    <div className="h-dvh overflow-hidden bg-surface-dim text-on-surface" style={{ ['--keyboard' as string]: `${keyboard}px` }}>
      <div
        data-plug-frame
        data-tabs={tabsOn ? 'on' : 'off'}
        className="relative mx-auto h-dvh w-full max-w-[430px] overflow-hidden bg-surface shadow-xl"
        style={{ transform: 'translateZ(0)' }}
      >
        <OfflineBanner onOpen={() => setSheet('queue')} />
        <div ref={scrollRef} data-plug-scroll className={`h-full overflow-x-hidden overscroll-none ${overlayOpen || mapHome ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={tabsOn && !mapHome ? 'pb-tabbar' : ''}>{children}</div>
        </div>
        {auth.joinError ? (
          <div role="alert" className="absolute inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
            <p className="font-headline-sm text-headline-sm text-on-surface">{auth.joinError}</p>
            <button type="button" className="pressable min-h-12 rounded-xl bg-primary px-6 font-bold text-on-primary" onClick={() => { void auth.signOut(); }}>
              Sign out
            </button>
          </div>
        ) : null}
        {tabsOn ? <TabBar active={active} signedIn={auth.signedIn} flagOn={(flag) => auth.flagOn(flag as never)} /> : null}
        <PlugChrome
          toast={toast}
          confirm={confirm}
          sheet={sheet}
          signReturn={signReturn}
          tabsOn={tabsOn}
          keyboard={keyboard}
          onCloseSheet={dismissTop}
          onCloseSign={dismissTop}
          onSignedIn={(dest) => {
            void releaseRef.current().then(() => {
              setSignReturn(null);
              navigate(dest);
            });
          }}
        />
      </div>
    </div>
  );
}

function OfflineBanner({ onOpen }: { onOpen: () => void }) {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [waiting, setWaiting] = useState(() => readQueue().length);
  useEffect(() => {
    const sync = () => {
      setOffline(!navigator.onLine);
      setWaiting(readQueue().length);
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    window.addEventListener('plug-refresh', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      window.removeEventListener('plug-refresh', sync);
    };
  }, []);
  if (!offline && waiting === 0) return null;
  const top = 'calc(var(--safe-top) + 0.5rem)';
  return (
    <button type="button" onClick={onOpen} className="pressable absolute left-1/2 z-[60] flex min-h-11 -translate-x-1/2 items-center gap-1 rounded-full bg-tertiary-fixed px-3 text-[12px] font-bold text-on-tertiary-fixed shadow-sm" style={{ top }}>
      <span className="material-symbols-outlined text-[16px]">sync</span>
      <span>{offline ? 'Offline' : `${waiting} log${waiting === 1 ? '' : 's'} waiting`}</span>
    </button>
  );
}
