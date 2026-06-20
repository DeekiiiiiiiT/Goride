import React, { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Bike, MapPin, ShieldCheck, Users, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { getCourierStats } from '../services/courierAdminService';
import type { CourierStats } from '@roam/types/courier';

interface OutletContext {
  session: Session;
}

const CARDS: Array<{
  key: keyof CourierStats;
  title: string;
  subtitle: string;
  href: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'total_couriers',
    title: 'Total Couriers',
    subtitle: 'Registered couriers',
    href: '/users',
    icon: <Bike className="w-5 h-5 text-emerald-400" />,
  },
  {
    key: 'online_now',
    title: 'Online Now',
    subtitle: 'Available for dispatch',
    href: '/presence',
    icon: <MapPin className="w-5 h-5 text-sky-400" />,
  },
  {
    key: 'on_delivery_now',
    title: 'On Delivery',
    subtitle: 'Active deliveries',
    href: '/presence',
    icon: <Package className="w-5 h-5 text-amber-400" />,
  },
  {
    key: 'active_couriers',
    title: 'Active Couriers',
    subtitle: 'Approved & onboarded',
    href: '/users?status=active',
    icon: <Users className="w-5 h-5 text-emerald-300" />,
  },
  {
    key: 'pending_compliance',
    title: 'Compliance Queue',
    subtitle: 'Needs review',
    href: '/compliance',
    icon: <ShieldCheck className="w-5 h-5 text-blue-400" />,
  },
];

export function CourierAdminDashboard() {
  const { session } = useOutletContext<OutletContext>();
  const [stats, setStats] = useState<CourierStats>({
    total_couriers: 0,
    active_couriers: 0,
    pending_compliance: 0,
    online_now: 0,
    on_delivery_now: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session.access_token) return;
    void getCourierStats(session.access_token)
      .then(setStats)
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Failed to load stats');
      })
      .finally(() => setLoading(false));
  }, [session.access_token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">Dashboard</h2>
        <p className="text-sm text-slate-400 mt-1">
          Roam Dash Courier admin overview. Click a card to drill down.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {CARDS.map((card) => (
          <Link
            key={card.key}
            to={card.href}
            className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 hover:border-emerald-500/40 hover:bg-slate-900/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 uppercase tracking-wide">{card.title}</p>
              {card.icon}
            </div>
            <p className="text-2xl font-semibold text-white">{stats[card.key]}</p>
            <p className="text-xs text-slate-500 mt-1">{card.subtitle}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
