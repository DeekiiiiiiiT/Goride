/**
 * Matching Brain Control Panel
 *
 * Central configuration for the platform matching engine.
 * Manages policies and product profiles for all Roam apps.
 */

import { useState, useEffect, useCallback } from "react";
import { useSupabase } from "../../../utils/supabase/useSupabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import { Badge } from "../../ui/badge";
import { Slider } from "../../ui/slider";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Loader2, AlertCircle, CheckCircle2, Settings, Users, Zap } from "lucide-react";

interface MatchingPolicy {
  id: string;
  name: string;
  max_match_waves: number;
  wave_radius_km: number[];
  max_offers_per_wave: number;
  default_driver_offer_timeout_seconds: number;
  driver_location_max_age_minutes: number;
  max_matching_duration_minutes: number;
  serial_dispatch_enabled: boolean;
  h3_resolution: number;
  h3_supply_enabled: boolean;
  h3_surge_enabled: boolean;
  wave_h3_k_rings: number[];
  is_default: boolean;
  updated_at: string;
}

interface ProductProfile {
  id: string;
  product_key: string;
  surface_key: string;
  policy_id: string;
  is_active: boolean;
  policy?: MatchingPolicy;
}

interface BrainStatus {
  brain_enabled: boolean;
  flags: Record<string, string>;
}

export function MatchingBrainPage() {
  const { supabase, session } = useSupabase();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [policies, setPolicies] = useState<MatchingPolicy[]>([]);
  const [profiles, setProfiles] = useState<ProductProfile[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<MatchingPolicy | null>(null);
  const [editedPolicy, setEditedPolicy] = useState<Partial<MatchingPolicy>>({});

  const fetchData = useCallback(async () => {
    if (!supabase || !session) return;

    setLoading(true);
    setError(null);

    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL || "";
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
          setEditedPolicy(defaultPolicy);
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
  }, [supabase, session]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const savePolicy = async () => {
    if (!supabase || !session || !selectedPolicy) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL || "";
      const res = await fetch(`${baseUrl}/functions/v1/matching/admin/policies/${selectedPolicy.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editedPolicy),
      });

      if (res.ok) {
        const data = await res.json();
        setSelectedPolicy(data.policy);
        setEditedPolicy(data.policy);
        setPolicies((prev) =>
          prev.map((p) => (p.id === data.policy.id ? data.policy : p))
        );
        setSuccess("Policy saved successfully");
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || "Failed to save policy");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save policy");
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof MatchingPolicy>(field: K, value: MatchingPolicy[K]) => {
    setEditedPolicy((prev) => ({ ...prev, [field]: value }));
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
          <h1 className="text-2xl font-bold">Matching Brain</h1>
          <p className="text-muted-foreground">
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
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertTitle className="text-green-700">Success</AlertTitle>
          <AlertDescription className="text-green-600">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="policy" className="space-y-4">
        <TabsList>
          <TabsTrigger value="policy">
            <Settings className="h-4 w-4 mr-2" />
            Policy
          </TabsTrigger>
          <TabsTrigger value="products">
            <Users className="h-4 w-4 mr-2" />
            Products
          </TabsTrigger>
          <TabsTrigger value="flags">
            <Zap className="h-4 w-4 mr-2" />
            Flags
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policy" className="space-y-4">
          {selectedPolicy && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Wave Dispatch</CardTitle>
                  <CardDescription>Configure matching wave behavior</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Max Waves</Label>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={editedPolicy.max_match_waves ?? selectedPolicy.max_match_waves}
                        onChange={(e) => updateField("max_match_waves", parseInt(e.target.value, 10))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Offers Per Wave</Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={editedPolicy.max_offers_per_wave ?? selectedPolicy.max_offers_per_wave}
                        onChange={(e) => updateField("max_offers_per_wave", parseInt(e.target.value, 10))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Wave Radii (km)</Label>
                    <Input
                      value={(editedPolicy.wave_radius_km ?? selectedPolicy.wave_radius_km).join(", ")}
                      onChange={(e) => {
                        const radii = e.target.value
                          .split(",")
                          .map((s) => parseFloat(s.trim()))
                          .filter((n) => !isNaN(n) && n > 0);
                        updateField("wave_radius_km", radii);
                      }}
                      placeholder="5, 15, 35"
                    />
                    <p className="text-xs text-muted-foreground">Comma-separated radius values</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Offer Timeout (seconds)</Label>
                      <Input
                        type="number"
                        min={5}
                        max={120}
                        value={editedPolicy.default_driver_offer_timeout_seconds ?? selectedPolicy.default_driver_offer_timeout_seconds}
                        onChange={(e) => updateField("default_driver_offer_timeout_seconds", parseInt(e.target.value, 10))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Matching Duration (minutes)</Label>
                      <Input
                        type="number"
                        min={2}
                        max={120}
                        value={editedPolicy.max_matching_duration_minutes ?? selectedPolicy.max_matching_duration_minutes}
                        onChange={(e) => updateField("max_matching_duration_minutes", parseInt(e.target.value, 10))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Serial Dispatch</CardTitle>
                  <CardDescription>Offer to one driver at a time</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Serial Dispatch</Label>
                      <p className="text-xs text-muted-foreground">
                        Reduces driver churn by offering sequentially
                      </p>
                    </div>
                    <Switch
                      checked={editedPolicy.serial_dispatch_enabled ?? selectedPolicy.serial_dispatch_enabled}
                      onCheckedChange={(checked) => updateField("serial_dispatch_enabled", checked)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>H3 Spatial Indexing</CardTitle>
                  <CardDescription>Hexagonal indexing for efficient lookups</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                      <Label>H3 Supply Index</Label>
                      <Switch
                        checked={editedPolicy.h3_supply_enabled ?? selectedPolicy.h3_supply_enabled}
                        onCheckedChange={(checked) => updateField("h3_supply_enabled", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>H3 Surge Index</Label>
                      <Switch
                        checked={editedPolicy.h3_surge_enabled ?? selectedPolicy.h3_surge_enabled}
                        onCheckedChange={(checked) => updateField("h3_surge_enabled", checked)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>H3 Resolution: {editedPolicy.h3_resolution ?? selectedPolicy.h3_resolution}</Label>
                    <Slider
                      min={4}
                      max={10}
                      step={1}
                      value={[editedPolicy.h3_resolution ?? selectedPolicy.h3_resolution]}
                      onValueChange={([v]) => updateField("h3_resolution", v)}
                    />
                    <p className="text-xs text-muted-foreground">
                      7 = ~1.2km edge (urban), 8 = ~460m edge (dense urban)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Wave K-Rings</Label>
                    <Input
                      value={(editedPolicy.wave_h3_k_rings ?? selectedPolicy.wave_h3_k_rings).join(", ")}
                      onChange={(e) => {
                        const kRings = e.target.value
                          .split(",")
                          .map((s) => parseInt(s.trim(), 10))
                          .filter((n) => !isNaN(n) && n >= 0);
                        updateField("wave_h3_k_rings", kRings);
                      }}
                      placeholder="4, 13, 29"
                    />
                    <p className="text-xs text-muted-foreground">
                      K-ring values per wave (calibrate per market)
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={savePolicy} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Product Profiles</CardTitle>
              <CardDescription>
                Each product can have its own policy or share the default
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium capitalize">{profile.product_key}</p>
                      <p className="text-sm text-muted-foreground">
                        Surface: {profile.surface_key}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={profile.is_active ? "default" : "secondary"}>
                        {profile.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {profile.policy && (
                        <Badge variant="outline">{profile.policy.name}</Badge>
                      )}
                    </div>
                  </div>
                ))}
                {profiles.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No product profiles configured
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flags" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>
                Environment variables controlling brain behavior
              </CardDescription>
            </CardHeader>
            <CardContent>
              {status?.flags && (
                <div className="space-y-2">
                  {Object.entries(status.flags).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <code className="text-sm">{key}</code>
                      <Badge variant={value === "1" ? "default" : "secondary"}>
                        {value || "0"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-4">
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
