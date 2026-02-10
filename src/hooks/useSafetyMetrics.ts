import { useState, useEffect } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

export function useSafetyMetrics() {
  const [efficiencyData, setEfficiencyData] = useState<any>(null);
  const [fatigueData, setFatigueData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386`;
      const headers = {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json'
      };

      const [effRes, fatRes] = await Promise.all([
        fetch(`${baseUrl}/fleet/efficiency-baseline`, { headers }),
        fetch(`${baseUrl}/safety/fatigue-analysis`, { headers })
      ]);

      if (!effRes.ok || !fatRes.ok) throw new Error('Failed to fetch safety metrics');

      const effJson = await effRes.json();
      const fatJson = await fatRes.json();

      setEfficiencyData(effJson);
      setFatigueData(fatJson);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { efficiencyData, fatigueData, loading, error, refresh: fetchData };
}
