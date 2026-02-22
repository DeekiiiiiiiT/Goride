import { useEffect, useRef } from 'react';
import { toast } from "sonner@2.0.3";
import { api } from '../services/api';

/**
 * Phase 1: Real-Time Subscription Hook
 * Monitors the server for persistent alerts and triggers UI notifications.
 */
export function useAlertPusher() {
  const seenIds = useRef<Set<string>>(new Set());
  const failCount = useRef(0);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const alerts = await api.getPersistentAlerts();
        failCount.current = 0; // Reset on success

        if (!Array.isArray(alerts)) return;
        
        alerts.forEach(alert => {
          if (!alert || !alert.id) return;
          // Only show toasts for unread alerts that we haven't seen in this session
          const isRead = alert.read || alert.isRead;
          if (!isRead && !seenIds.current.has(alert.id)) {
            const toastFn = alert.severity === 'critical' ? toast.error : 
                          alert.severity === 'high' ? toast.warning : 
                          toast.info;

            toastFn(alert.title || "New Fleet Alert", {
              description: alert.message || alert.description,
              duration: alert.severity === 'critical' ? 15000 : 5000,
              action: alert.severity === 'critical' ? {
                label: "View",
                onClick: () => {
                   window.dispatchEvent(new CustomEvent('open-alert-center', { detail: alert.id }));
                }
              } : undefined
            });
            
            seenIds.current.add(alert.id);
          }
        });
      } catch (e) {
        failCount.current += 1;
        // Only warn once on first failure; suppress repeated poll failures
        if (failCount.current <= 1) {
          console.warn("Alert polling: initial fetch failed, will retry silently:", e);
        }
      }
    };

    // Polling mechanism (Step 1.3)
    const interval = setInterval(fetchAlerts, 30000); // Check every 30s
    const initialTimeout = setTimeout(fetchAlerts, 3000); // First check after 3s (allow server warm-up)

    return () => {
        clearInterval(interval);
        clearTimeout(initialTimeout);
    };
  }, []);
}
