import React, { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getIdentityDetail, type IdentityDetail } from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { IdentityDetailPanel } from './components/IdentityDetailOverlay';

/** Deep-link / bookmark route — same content as the directory overlay. */
export function IdentityDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { session } = useOutletContext<AdminOutletContext>();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<IdentityDetail | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await getIdentityDetail(session.access_token, userId);
      setDetail(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load person');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [session.access_token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!detail || !userId) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p>Person not found.</p>
        <Link to="/users" className="text-emerald-400 text-sm mt-2 inline-block">
          Back to directory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/users" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Users
      </Link>
      <IdentityDetailPanel
        userId={userId}
        accessToken={session.access_token}
        detail={detail}
        actionsAsMenu
        onReload={() => void load()}
      />
    </div>
  );
}
