import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import { hideReview, listReviews } from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function ReviewsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);
  const [reviews, setReviews] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    void listReviews(session.access_token)
      .then((res) => setReviews((res as { reviews: Array<Record<string, unknown>> }).reviews))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [session.access_token]);

  if (loading) return <Loader2 className="w-8 h-8 animate-spin text-amber-400" />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Reviews</h2>
      <div className="space-y-3">
        {reviews.map((r) => (
          <div key={String(r.id)} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex justify-between gap-2">
              <span className="text-white text-sm">{String(r.order_number)}</span>
              <span className="text-amber-400 text-sm">{'★'.repeat(Number(r.customer_rating || 0))}</span>
            </div>
            <p className="text-sm text-slate-400 mt-2">{String(r.customer_review || '')}</p>
            {canWrite && (
              <button
                type="button"
                onClick={async () => {
                  await hideReview(session.access_token, String(r.id), !r.review_hidden);
                  load();
                }}
                className="mt-2 text-xs text-slate-500 hover:text-white"
              >
                {r.review_hidden ? 'Unhide' : 'Hide'} review
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
