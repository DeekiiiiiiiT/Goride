import { useState, useEffect } from 'react';
import { useAuth } from '../components/auth/AuthContext';
import { api } from '../services/api';

export function useCurrentDriver() {
  const { user } = useAuth();
  const [driverRecord, setDriverRecord] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
        setLoading(false);
        return;
    }

    const resolveDriver = async () => {
        try {
            setLoading(true);
            const drivers = await api.getDrivers();
            
            // 1. Try to find match by ID (Auth ID = Driver ID)
            let match = drivers.find((d: any) => d.id === user.id);
            
            // 2. If not found, try to match by Email
            if (!match && user.email) {
                match = drivers.find((d: any) => d.email?.toLowerCase() === user.email?.toLowerCase());
            }

            // 3. If still not found, try to match by Name (Case insensitive)
            if (!match && user.user_metadata?.name) {
                const userName = user.user_metadata.name.trim().toLowerCase();
                if (userName) {
                    // A. Exact Name Match
                    match = drivers.find((d: any) => {
                        const dName = (d.driverName || d.name || '').trim().toLowerCase();
                        return dName === userName;
                    });

                    // B. Partial Name Match (Fallback) - "Kenny" matches "Kenny Smith"
                    if (!match) {
                        match = drivers.find((d: any) => {
                            const dName = (d.driverName || d.name || '').trim().toLowerCase();
                            // Only match if one name is at least 3 chars to avoid "Ed" matching "Eddie" too aggressively
                            if (dName.length < 3 || userName.length < 3) return false;
                            return dName.includes(userName) || userName.includes(dName);
                        });
                    }
                }
            }

            if (match) {
                console.log(`[DriverSync] Resolved Identity: ${user.email} -> ${match.driverName} (${match.id})`);
            } else {
                console.warn(`[DriverSync] Could not link '${user.email}' to any driver record.`);
            }

            setDriverRecord(match || { id: user.id, email: user.email, name: user.user_metadata?.name });
        } catch (e) {
            console.error("Failed to resolve driver identity", e);
            // Fallback
            setDriverRecord({ id: user.id });
        } finally {
            setLoading(false);
        }
    };

    resolveDriver();
  }, [user?.id, user?.email, user?.user_metadata?.name]);

  return { driverRecord, loading };
}
