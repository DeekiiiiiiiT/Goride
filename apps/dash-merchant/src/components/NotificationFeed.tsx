import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, XCircle, FileQuestion, Eye, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';

interface MerchantNotification {
  id: string;
  merchant_id: string;
  type: string;
  title: string;
  body: string;
  email_sent_at: string | null;
  read_at: string | null;
  created_at: string;
}

interface NotificationFeedProps {
  merchantId: string;
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function iconForTitle(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes('approved') || lower.includes('live')) return CheckCircle2;
  if (lower.includes('reject') || lower.includes("couldn")) return XCircle;
  if (lower.includes('info') || lower.includes('docs')) return FileQuestion;
  if (lower.includes('review')) return Eye;
  return Bell;
}

function colorForTitle(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('approved') || lower.includes('live')) return 'text-emerald-600 bg-emerald-50';
  if (lower.includes('reject') || lower.includes("couldn")) return 'text-rose-600 bg-rose-50';
  if (lower.includes('info') || lower.includes('docs')) return 'text-orange-600 bg-orange-50';
  if (lower.includes('review')) return 'text-blue-600 bg-blue-50';
  return 'text-slate-600 bg-slate-100';
}

export function NotificationFeed({ merchantId }: NotificationFeedProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, refetch } = useQuery<{ notifications: MerchantNotification[] }>({
    queryKey: ['merchant-notifications', merchantId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/notifications`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to load notifications');
      return res.json();
    },
    refetchInterval: 30_000,
    enabled: !!merchantId,
  });

  const notifications = data?.notifications || [];
  const unread = notifications.filter((n) => !n.read_at).length;

  // Realtime subscription so we get instant updates when an admin acts.
  useEffect(() => {
    if (!merchantId) return;
    const channel = supabase
      .channel(`merchant-notifications-${merchantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'delivery',
          table: 'merchant_notifications',
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          const note = payload.new as MerchantNotification;
          toast(note.title, {
            description: note.body,
            duration: 8000,
          });
          queryClient.invalidateQueries({ queryKey: ['merchant-notifications', merchantId] });
          queryClient.invalidateQueries({ queryKey: ['my-merchant'] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [merchantId, queryClient]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const markRead = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${API_ENDPOINTS.delivery}/merchant/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      void refetch();
    } catch {
      // non-fatal
    }
  };

  const markAllRead = async () => {
    await Promise.all(
      notifications.filter((n) => !n.read_at).map((n) => markRead(n.id)),
    );
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-700" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={() => void markAllRead()}
                  className="text-xs text-emerald-600 hover:text-emerald-500"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-gray-500 hover:text-gray-900"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No notifications yet
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((n) => {
                  const Icon = iconForTitle(n.title);
                  const color = colorForTitle(n.title);
                  return (
                    <li
                      key={n.id}
                      onClick={() => void markRead(n.id)}
                      className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                        !n.read_at ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <div className="flex gap-3">
                        <div className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-gray-900 text-sm truncate">{n.title}</p>
                            {!n.read_at && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.body}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{fmtRelative(n.created_at)}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
