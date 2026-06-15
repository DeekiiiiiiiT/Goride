/**
 * SettingsSection Component
 * 
 * A reusable card-based settings section with edit/cancel/save controls.
 * Used across the Matching Brain UI for consistent settings management.
 */

import React from 'react';
import { Pencil, X, Loader2, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';

export interface SettingsSectionProps {
  /** Section title */
  title: string;
  /** Section description */
  description: string;
  /** Whether user has write permissions */
  canEdit: boolean;
  /** Whether section is in edit mode */
  isEditing: boolean;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Called when Edit button is clicked */
  onEdit: () => void;
  /** Called when Cancel button is clicked */
  onCancel: () => void;
  /** Called when Save button is clicked */
  onSave: () => void;
  /** Section content (form fields) */
  children: React.ReactNode;
  /** Optional error message to display */
  error?: string | null;
  /** Optional className for the card */
  className?: string;
}

export function SettingsSection({
  title,
  description,
  canEdit,
  isEditing,
  isSaving,
  onEdit,
  onCancel,
  onSave,
  children,
  error,
  className,
}: SettingsSectionProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle className="text-base font-medium text-white">{title}</CardTitle>
          <CardDescription className="text-sm text-slate-400 mt-1">
            {description}
          </CardDescription>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            {!isEditing ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onEdit}
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCancel}
                  disabled={isSaving}
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onSave}
                  disabled={isSaving}
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save
                </Button>
              </>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * SettingLabel Component
 * 
 * A label with an optional tooltip for field descriptions.
 */
export interface SettingLabelProps {
  /** Label text */
  label: string;
  /** Tooltip text (optional) */
  tooltip?: string;
  /** Label variant */
  variant?: 'field' | 'inline';
  /** Additional className */
  className?: string;
}

export function SettingLabel({
  label,
  tooltip,
  variant = 'field',
  className,
}: SettingLabelProps) {
  const labelClass = variant === 'field'
    ? 'text-xs text-slate-400 uppercase tracking-wide'
    : 'text-sm text-slate-300';

  return (
    <span className={`inline-flex items-center gap-1.5 ${className || ''}`}>
      <span className={labelClass}>{label}</span>
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-slate-500 hover:text-slate-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 rounded"
              aria-label={`About ${label}`}
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-xs bg-slate-800 text-slate-100 border border-slate-700 text-left leading-snug"
          >
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

/**
 * Helper function to determine if a section field should be disabled.
 * Fields are disabled when not in edit mode or when user doesn't have write access.
 */
export function isSectionDisabled(canEdit: boolean, isEditing: boolean): boolean {
  return !canEdit || !isEditing;
}

/**
 * Common input className for settings forms.
 * Matches the dark theme styling used across the admin portal.
 */
export const settingsInputClass = 
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white text-sm ' +
  'disabled:opacity-60 disabled:cursor-not-allowed ' +
  'focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500';

/**
 * Common toggle row container className.
 */
export const toggleRowClass = 
  'flex items-center justify-between py-2';
