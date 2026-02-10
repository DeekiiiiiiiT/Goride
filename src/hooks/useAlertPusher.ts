import { useEffect, useRef } from 'react';
import { toast } from "sonner@2.0.3";
import { api } from '../services/api';

/**
 * Phase 1: Real-Time Subscription Hook
 * Monitors the server for persistent alerts and triggers UI notifications.
 */
export function useAlertPusher() {
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const alerts = await api.getPersistentAlerts();
        
        alerts.forEach(alert => {
          // Only show toasts for unread alerts that we haven't seen in this session
          if (!alert.read && !seenIds.current.has(alert.id)) {
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
        console.warn("Failed to fetch persistent alerts from server:", e);
      }
    };

    // Polling mechanism (Step 1.3)
    const interval = setInterval(fetchAlerts, 30000); // Check every 30s
    const initialTimeout = setTimeout(fetchAlerts, 2000); // Quick check after load

    return () => {
        clearInterval(interval);
        clearTimeout(initialTimeout);
    };
  }, []);
}
