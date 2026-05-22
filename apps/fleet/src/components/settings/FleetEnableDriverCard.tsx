import React, { useEffect, useState } from 'react';
import { Car, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { useAuth } from '../auth/AuthContext';
import { enableFleetOwnerDriver, fetchFleetOwnerStatus } from '../../services/fleetOwnerAuth';
import { supabase } from '../../utils/supabase/client';
import { toast } from 'sonner@2.0.3';

export function FleetEnableDriverCard() {
  const { session, refreshSession } = useAuth();
  const [canDrive, setCanDrive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) {
      setChecking(false);
      return;
    }
    void fetchFleetOwnerStatus(token).then(s => {
      setCanDrive(s.canDrive);
      setChecking(false);
    });
  }, [session?.access_token]);

  if (checking || canDrive) return null;

  const handleEnable = async () => {
    const token = session?.access_token;
    if (!token) return;
    setLoading(true);
    try {
      const result = await enableFleetOwnerDriver(token);
      if (!result.success) throw new Error(result.error);
      await refreshSession();
      await supabase.auth.refreshSession();
      setCanDrive(true);
      toast.success('Driver access enabled. You can sign in at roamdriver.co with this account.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not enable driver access.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Car className="h-5 w-5 text-indigo-600" />
          Drive with Roam Driver
        </CardTitle>
        <CardDescription>
          Fleet owners can also take trips on the driver app using the same email or phone — like Uber Fleet partners who drive.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          className="bg-indigo-600 hover:bg-indigo-700"
          disabled={loading}
          onClick={() => void handleEnable()}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enable my driver account'}
        </Button>
        <a
          href="https://roamdriver.co"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300"
        >
          Open Roam Driver
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardContent>
    </Card>
  );
}
