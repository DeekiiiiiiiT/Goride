/**
 * useSettingsSection Hook
 * 
 * Manages form state for a settings section with edit/cancel/save functionality.
 * Provides snapshot-based cancel, dirty tracking, and save handling.
 */

import { useState, useCallback, useMemo } from 'react';

export interface UseSettingsSectionOptions<T extends Record<string, unknown>> {
  /** Initial data for the section */
  initialData: T | null;
  /** Keys belonging to this section (for partial updates) */
  sectionKeys: (keyof T)[];
  /** Async save handler - receives only the section's fields */
  onSave: (patch: Partial<T>) => Promise<T>;
  /** Optional validation before save */
  validate?: (data: Partial<T>) => string | null;
}

export interface UseSettingsSectionResult<T extends Record<string, unknown>> {
  /** Current form data (full object) */
  formData: T | null;
  /** Whether this section is in edit mode */
  isEditing: boolean;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Validation error message (if any) */
  error: string | null;
  /** Whether section has unsaved changes */
  isDirty: boolean;
  /** Start editing (takes snapshot) */
  startEdit: () => void;
  /** Cancel editing (restores snapshot) */
  cancelEdit: () => void;
  /** Save changes */
  saveChanges: () => Promise<boolean>;
  /** Update a single field */
  updateField: <K extends keyof T>(key: K, value: T[K]) => void;
  /** Update multiple fields at once */
  updateFields: (updates: Partial<T>) => void;
  /** Reset form data (e.g., after parent refresh) */
  resetData: (newData: T | null) => void;
}

export function useSettingsSection<T extends Record<string, unknown>>({
  initialData,
  sectionKeys,
  onSave,
  validate,
}: UseSettingsSectionOptions<T>): UseSettingsSectionResult<T> {
  const [formData, setFormData] = useState<T | null>(initialData);
  const [snapshot, setSnapshot] = useState<Partial<T> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate if section has unsaved changes
  const isDirty = useMemo(() => {
    if (!isEditing || !formData || !snapshot) return false;
    return sectionKeys.some((key) => formData[key] !== snapshot[key]);
  }, [isEditing, formData, snapshot, sectionKeys]);

  // Take snapshot of current section values
  const takeSnapshot = useCallback((): Partial<T> => {
    if (!formData) return {};
    const snap: Partial<T> = {};
    for (const key of sectionKeys) {
      snap[key] = formData[key];
    }
    return snap;
  }, [formData, sectionKeys]);

  // Build patch with only section keys
  const buildPatch = useCallback((): Partial<T> => {
    if (!formData) return {};
    const patch: Partial<T> = {};
    for (const key of sectionKeys) {
      patch[key] = formData[key];
    }
    return patch;
  }, [formData, sectionKeys]);

  const startEdit = useCallback(() => {
    if (!formData) return;
    setSnapshot(takeSnapshot());
    setIsEditing(true);
    setError(null);
  }, [formData, takeSnapshot]);

  const cancelEdit = useCallback(() => {
    if (snapshot && formData) {
      setFormData({ ...formData, ...snapshot });
    }
    setSnapshot(null);
    setIsEditing(false);
    setError(null);
  }, [snapshot, formData]);

  const saveChanges = useCallback(async (): Promise<boolean> => {
    if (!formData) return false;

    const patch = buildPatch();

    // Run validation if provided
    if (validate) {
      const validationError = validate(patch);
      if (validationError) {
        setError(validationError);
        return false;
      }
    }

    setIsSaving(true);
    setError(null);

    try {
      const updated = await onSave(patch);
      setFormData(updated);
      setSnapshot(null);
      setIsEditing(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [formData, buildPatch, validate, onSave]);

  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFormData((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const updateFields = useCallback((updates: Partial<T>) => {
    setFormData((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const resetData = useCallback((newData: T | null) => {
    setFormData(newData);
    setSnapshot(null);
    setIsEditing(false);
    setError(null);
  }, []);

  return {
    formData,
    isEditing,
    isSaving,
    error,
    isDirty,
    startEdit,
    cancelEdit,
    saveChanges,
    updateField,
    updateFields,
    resetData,
  };
}
