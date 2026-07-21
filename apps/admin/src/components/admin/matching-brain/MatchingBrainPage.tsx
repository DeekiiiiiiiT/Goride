/**
 * Matching Brain Control Panel
 *
 * Central configuration for the platform matching engine.
 * Manages policies and product profiles for all Roam apps.
 */

import { useState, useEffect, useCallback } from "react";
import { projectId } from "../../../utils/supabase/info";
import { useAuth } from "../../auth/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Badge } from "../../ui/badge";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Loader2, AlertCircle, CheckCircle2, Settings, Users, Zap, Cog } from "lucide-react";
import { useFeatureFlags } from "../../../utils/featureFlags";
import type { MatchingPolicy, ProductProfile, BrainStatus } from "./types";

// Settings Sections
import {
  WaveDispatchSection,
  SerialDispatchSection,
  DriverPresenceSection,
  BodyTypePolicySection,
  DriverRolloutSection,
  QuotesSection,
  H3IndexingSection,
  InTripAutomationSection,
  WaitTimeBillingSection,
  PinVerificationSection,
} from "./sections";
import { ProductProfileEditor } from "./ProductProfileEditor";
import { SyncStatusCard } from "./SyncStatusCard";

const ADMIN_WRITE_ROLES = ["platform_owner", "superadmin", "rides_admin", "super_admin", "super admin"];

function hasWriteAccess(role: string | undefined | null): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().replace(/[\s_-]+/g, '_');
  return ADMIN_WRITE_ROLES.some(r => 
    r.toLowerCase().replace(/[\s_-]+/g, '_') === normalized
  );
}

export function MatchingBrainPage() {
  const { session, profile } = useAuth();
  const flags = useFeatureFlags();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [policies, setPolicies] = useState<MatchingPolicy[]>([]);
  const [profiles, setProfiles] = useState<ProductProfile[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<MatchingPolicy | null>(null);
  const [activeTab, setActiveTab] = useState("dispatch");

  const canEdit = hasWriteAccess(profile?.role);

  const fetchData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    setError(null);

    try {
      const baseUrl = `https://${projectId}.supabase.co`;
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      };

      // Fetch brain status
      const statusRes = await fetch(`${baseUrl}/functions/v1/matching/health`, { headers });
      if (statusRes.ok) {
        setStatus(await statusRes.json());
      }

      // Fetch policies
      const policiesRes = await fetch(`${baseUrl}/functions/v1/matching/admin/policies`, { headers });
      if (policiesRes.ok) {
        const data = await policiesRes.json();
        setPolicies(data.policies || []);
        if (data.policies?.length > 0) {
          const defaultPolicy = data.policies.find((p: MatchingPolicy) => p.is_default) || data.policies[0];
          setSelectedPolicy(defaultPolicy);
        }
      } else {
        const err = await policiesRes.json().catch(() => ({}));
        setError(err.message || "Failed to load policies");
      }

      // Fetch profiles
      const profilesRes = await fetch(`${baseUrl}/functions/v1/matching/admin/product-profiles`, { headers });
      if (profilesRes.ok) {
        const data = await profilesRes.json();
        setProfiles(data.profiles || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load matching brain data");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (patch: Partial<MatchingPolicy>): Promise<MatchingPolicy> => {
    if (!session || !selectedPolicy) {
      throw new Error("No session or policy selected");
    }

    setError(null);
    setSuccess(null);

    const baseUrl = `https://${projectId}.supabase.co`;
    const res = await fetch(`${baseUrl}/functions/v1/matching/admin/policies/${selectedPolicy.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to save policy");
    }

    const data = await res.json();
    const updated = data.policy as MatchingPolicy;

    // Update local state
    setSelectedPolicy(updated);
    setPolicies((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSuccess("Changes saved successfully");

    // Clear success message after 3 seconds
    setTimeout(() => setSuccess(null), 3000);

    return updated;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Matching Brain</h1>
          <p className="text-slate-400">
            Central dispatch configuration for all Roam products
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status?.brain_enabled ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Brain Enabled
            </Badge>
          ) : (
            <Badge variant="secondary">
              <AlertCircle className="h-3 w-3 mr-1" />
              Brain Disabled
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50 dark:border-green-500 dark:bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
          <AlertTitle className="text-green-800 dark:text-green-400">Success</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
          <TabsTrigger value="dispatch">
            <Settings className="h-4 w-4 mr-2" />
            Dispatch
          </TabsTrigger>
          <TabsTrigger value="driver">
            <Users className="h-4 w-4 mr-2" />
            Driver
          </TabsTrigger>
          <TabsTrigger value="automation">
            <Cog className="h-4 w-4 mr-2" />
            Automation
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <Zap className="h-4 w-4 mr-2" />
            Advanced
          </TabsTrigger>
          <TabsTrigger value="products">
            Products
          </TabsTrigger>
          <TabsTrigger value="flags">
            Flags
          </TabsTrigger>
        </TabsList>

        {/* Dispatch Tab */}
        <TabsContent value="dispatch" className="space-y-4">
          {selectedPolicy && (
            <>
              <WaveDispatchSection
                policy={selectedPolicy}
                canEdit={canEdit}
                onSave={handleSave}
              />
              <SerialDispatchSection
                policy={selectedPolicy}
                canEdit={canEdit}
                onSave={handleSave}
              />
              <QuotesSection
                policy={selectedPolicy}
                canEdit={canEdit}
                onSave={handleSave}
              />
            </>
          )}
        </TabsContent>

        {/* Driver Tab */}
        <TabsContent value="driver" className="space-y-4">
          {selectedPolicy && (
            <>
              <DriverPresenceSection
                policy={selectedPolicy}
                canEdit={canEdit}
                onSave={handleSave}
              />
              <BodyTypePolicySection
                policy={selectedPolicy}
                canEdit={canEdit}
                onSave={handleSave}
              />
              <DriverRolloutSection
                policy={selectedPolicy}
                canEdit={canEdit}
                onSave={handleSave}
              />
            </>
          )}
        </TabsContent>

        {/* Advanced Tab - H3 Indexing */}
        <TabsContent value="advanced" className="space-y-4">
          {selectedPolicy && (
            <H3IndexingSection
              policy={selectedPolicy}
              canEdit={canEdit}
              onSave={handleSave}
            />
          )}
        </TabsContent>

        {/* Automation Tab */}
        <TabsContent value="automation" className="space-y-4">
          {selectedPolicy && (
            <>
              <InTripAutomationSection
                policy={selectedPolicy}
                canEdit={canEdit}
                onSave={handleSave}
              />
              <WaitTimeBillingSection
                policy={selectedPolicy}
                canEdit={canEdit}
                onSave={handleSave}
              />
              <PinVerificationSection
                policy={selectedPolicy}
                canEdit={canEdit}
                onSave={handleSave}
              />
            </>
          )}
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <ProductProfileEditor
            profiles={profiles}
            policies={policies}
            canEdit={canEdit}
            session={session}
            onUpdate={fetchData}
          />
        </TabsContent>

        {/* Flags Tab */}
        <TabsContent value="flags" className="space-y-4">
          <SyncStatusCard
            policyId={selectedPolicy?.id || null}
            canEdit={canEdit}
            session={session}
          />
          
          <Card>
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-white">Feature Flags</CardTitle>
              <CardDescription className="text-slate-400">
                Environment variables controlling brain behavior
              </CardDescription>
            </CardHeader>
            <CardContent>
              {status?.flags && (
                <div className="space-y-2">
                  {Object.entries(status.flags).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-2 border border-slate-200 rounded bg-white dark:border-slate-700 dark:bg-slate-900/50"
                    >
                      <code className="text-sm text-slate-700 dark:text-slate-300">{key}</code>
                      <Badge variant={value === "1" ? "default" : "secondary"}>
                        {value || "0"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-500 mt-4">
                Flags are set via environment variables and cannot be changed from the UI.
                Contact platform team to modify.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
