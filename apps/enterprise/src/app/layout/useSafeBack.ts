import { useLocation, useNavigate } from 'react-router-dom';

/** Prefer the screen you came from; never leave the product. */
export function useSafeBack(opts: {
  homePath: string;
  labelFor: (path: string) => string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const fromUsable = Boolean(from && from !== location.pathname);
  const label = fromUsable ? opts.labelFor(String(from)) : 'Back';

  function back() {
    if (fromUsable) {
      navigate(String(from));
      return;
    }
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
      return;
    }
    navigate(opts.homePath);
  }

  return { back, label, from: fromUsable ? from : undefined };
}

export function navStateFrom(pathname: string, target: string) {
  return pathname === target ? undefined : { from: pathname };
}
