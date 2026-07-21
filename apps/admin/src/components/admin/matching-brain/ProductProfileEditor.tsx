/**
 * Product Profile Editor
 * 
 * Allows editing product profiles and their JSONB overrides.
 * Overrides let per-product customization without creating new policies.
 */

import { useState, useCallback } from 'react';
import { projectId } from '../../../utils/supabase/info';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Switch } from '../../ui/switch';
import { Loader2, Pencil, X, ChevronDown, ChevronUp } from 'lucide-react';
import {
  SettingLabel,
  settingsInputClass,
  toggleRowClass,
} from '../shared/SettingsSection';
import type { MatchingPolicy, ProductProfile } from './types';
import { TOOLTIPS } from './types';

interface ProductProfileEditorProps {
  profiles: ProductProfile[];
  policies: MatchingPolicy[];
  canEdit: boolean;
  session: { access_token: string } | null;
  onUpdate: () => void;
}

const OVERRIDABLE_FIELDS: Array<{
  key: keyof MatchingPolicy;
  label: string;
  type: 'number' | 'boolean' | 'select';
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
}> = [
  { key: 'max_match_waves', label: 'Max Waves', type: 'number', min: 1, max: 5 },
  { key: 'max_offers_per_wave', label: 'Offers per Wave', type: 'number', min: 1, max: 20 },
  { key: 'default_driver_offer_timeout_seconds', label: 'Offer Timeout (sec)', type: 'number', min: 5, max: 120 },
  { key: 'driver_location_max_age_minutes', label: 'Location Max Age (min)', type: 'number', min: 1, max: 30 },
  { key: 'quote_driver_radius_km', label: 'Quote Radius (km)', type: 'number', min: 1, max: 50 },
  { key: 'serial_dispatch_enabled', label: 'Serial Dispatch', type: 'boolean' },
  { key: 'body_type_filtering_enabled', label: 'Body Type Filtering', type: 'boolean' },
  { key: 'independent_only_matching', label: 'Independent Only', type: 'boolean' },
  { key: 'wait_time_charge_enabled', label: 'Wait Time Billing', type: 'boolean' },
  { key: 'wait_time_grace_minutes', label: 'Wait Grace (min)', type: 'number', min: 0, max: 15 },
  { key: 'pin_verification_enabled', label: 'PIN Enabled', type: 'boolean' },
  { key: 'pin_verification_required_for_start', label: 'PIN Required for Start', type: 'boolean' },
];

const PRODUCT_LABELS: Record<string, string> = {
  rides: 'Rideshare',
  fleet: 'Fleet',
  dash: 'Roam Dash',
  enterprise: 'Enterprise',
};

const SURFACE_LABELS: Record<string, string> = {
  default: 'Default',
  rider: 'Rider App',
  driver: 'Driver App',
};

export function ProductProfileEditor({
  profiles,
  policies,
  canEdit,
  session,
  onUpdate,
}: ProductProfileEditorProps) {
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [editedOverrides, setEditedOverrides] = useState<Partial<MatchingPolicy>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEdit = (profile: ProductProfile) => {
    setEditingProfile(profile.id);
    setEditedOverrides(profile.overrides || {});
    setError(null);
  };

  const handleCancel = () => {
    setEditingProfile(null);
    setEditedOverrides({});
    setError(null);
  };

  const handleSave = async (profileId: string) => {
    if (!session) return;

    setSaving(true);
    setError(null);

    try {
      const baseUrl = `https://${projectId}.supabase.co`;
      const res = await fetch(`${baseUrl}/functions/v1/matching/admin/product-profiles/${profileId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          overrides: Object.keys(editedOverrides).length > 0 ? editedOverrides : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to save profile');
      }

      setEditingProfile(null);
      setEditedOverrides({});
      onUpdate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (profile: ProductProfile) => {
    if (!session || !canEdit) return;

    try {
      const baseUrl = `https://${projectId}.supabase.co`;
      await fetch(`${baseUrl}/functions/v1/matching/admin/product-profiles/${profile.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: !profile.is_active }),
      });
      onUpdate();
    } catch (e) {
      console.error('Failed to toggle profile:', e);
    }
  };

  const updateOverride = <K extends keyof MatchingPolicy>(key: K, value: MatchingPolicy[K] | undefined) => {
    setEditedOverrides((prev) => {
      if (value === undefined) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: value };
    });
  };

  const getEffectiveValue = (profile: ProductProfile, key: keyof MatchingPolicy): unknown => {
    if (editingProfile === profile.id && key in editedOverrides) {
      return editedOverrides[key];
    }
    if (profile.overrides && key in profile.overrides) {
      return profile.overrides[key];
    }
    if (profile.policy) {
      return profile.policy[key];
    }
    return undefined;
  };

  const hasOverride = (profile: ProductProfile, key: keyof MatchingPolicy): boolean => {
    if (editingProfile === profile.id) {
      return key in editedOverrides;
    }
    return profile.overrides ? key in profile.overrides : false;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-900 dark:text-white">Product Profiles</CardTitle>
        <CardDescription className="text-slate-400">
          Each product inherits from a base policy. Use overrides for per-product customization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {profiles.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            No product profiles configured
          </p>
        ) : (
          <div className="space-y-3">
            {profiles.map((profile) => {
              const isExpanded = expandedProfile === profile.id;
              const isEditing = editingProfile === profile.id;

              return (
                <div
                  key={profile.id}
                  className="border border-slate-200 rounded-lg bg-white dark:border-slate-700 dark:bg-slate-900/50 overflow-hidden"
                >
                  {/* Header */}
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => setExpandedProfile(isExpanded ? null : profile.id)}
                  >
                    <div className="flex items-center gap-3">
                      <button type="button" className="text-slate-400">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {PRODUCT_LABELS[profile.product_key] || profile.product_key}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {SURFACE_LABELS[profile.surface_key] || profile.surface_key}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {profile.overrides && Object.keys(profile.overrides).length > 0 && (
                        <Badge variant="outline" className="text-amber-400 border-amber-400/50">
                          {Object.keys(profile.overrides).length} override{Object.keys(profile.overrides).length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      <Badge variant={profile.is_active ? 'default' : 'secondary'}>
                        {profile.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {profile.policy && (
                        <Badge variant="outline">{profile.policy.name}</Badge>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-700 p-4">
                      {error && isEditing && (
                        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                          {error}
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-4">
                        <label className={`${toggleRowClass} flex-1`}>
                          <span className="text-sm text-slate-700 dark:text-slate-300">Profile Active</span>
                          <Switch
                            checked={profile.is_active}
                            onCheckedChange={() => handleToggleActive(profile)}
                          />
                        </label>
                        
                        <div className="flex items-center gap-2 ml-4">
                          {!isEditing ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(profile)}
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              Edit Overrides
                            </Button>
                          ) : (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleCancel}
                                disabled={saving}
                              >
                                <X className="w-3.5 h-3.5 mr-1" />
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleSave(profile.id)}
                                disabled={saving}
                              >
                                {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                                Save
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Overridable Settings</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {OVERRIDABLE_FIELDS.map((field) => {
                            const effectiveValue = getEffectiveValue(profile, field.key);
                            const isOverridden = hasOverride(profile, field.key);
                            const disabled = !isEditing;

                            return (
                              <div
                                key={field.key}
                                className={`p-2 rounded border ${
                                  isOverridden
                                    ? 'border-amber-500/50 bg-amber-500/5'
                                    : 'border-slate-700 bg-slate-50 dark:bg-slate-50 dark:bg-slate-50 dark:bg-slate-50 dark:bg-slate-950/50'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <SettingLabel
                                    label={field.label}
                                    tooltip={TOOLTIPS[field.key]}
                                    variant="inline"
                                    className="text-xs"
                                  />
                                  {isEditing && isOverridden && (
                                    <button
                                      type="button"
                                      className="text-xs text-slate-500 hover:text-red-400"
                                      onClick={() => updateOverride(field.key, undefined)}
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>

                                {field.type === 'boolean' ? (
                                  <Switch
                                    disabled={disabled}
                                    checked={Boolean(effectiveValue)}
                                    onCheckedChange={(checked) =>
                                      updateOverride(field.key, checked as MatchingPolicy[typeof field.key])
                                    }
                                  />
                                ) : field.type === 'select' ? (
                                  <select
                                    disabled={disabled}
                                    value={String(effectiveValue ?? '')}
                                    onChange={(e) =>
                                      updateOverride(field.key, e.target.value as MatchingPolicy[typeof field.key])
                                    }
                                    className={`${settingsInputClass} text-xs py-1`}
                                  >
                                    {field.options?.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="number"
                                    disabled={disabled}
                                    min={field.min}
                                    max={field.max}
                                    value={effectiveValue as number ?? ''}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      if (!isNaN(val)) {
                                        updateOverride(field.key, val as MatchingPolicy[typeof field.key]);
                                      }
                                    }}
                                    className={`${settingsInputClass} text-xs py-1`}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
