import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/auth/AuthProvider';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/**
 * Non-enterprise sessions are cleared with a generic login error — never reveal
 * which product an account belongs to.
 */
export function WrongProductLineGate({ children }: { children: React.ReactNode }) {
  const { productLine, loading, session, signOut } = useAuth();

  useEffect(() => {
    if (loading || !session) return;
    if (productLine && productLine !== 'enterprise') {
      void signOut();
    }
  }, [loading, session, productLine, signOut]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ authError: 'Invalid email or password' }}
      />
    );
  }

  if (productLine && productLine !== 'enterprise') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Signing out…
      </div>
    );
  }

  return <>{children}</>;
}
