import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AdminConfirmVariant } from './AdminConfirmDialog';

export type AdminFormField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  /** When set, value must match (case-insensitive, trimmed). */
  matchValue?: string;
};

export interface AdminFormDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  fields: AdminFormField[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: AdminConfirmVariant;
  loading?: boolean;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

function fieldError(field: AdminFormField, value: string): string | null {
  const trimmed = value.trim();
  if (field.required && !trimmed) {
    return 'This field is required';
  }
  if (field.matchValue && trimmed.toLowerCase() !== field.matchValue.trim().toLowerCase()) {
    return `Type "${field.matchValue}" to confirm`;
  }
  return null;
}

export function AdminFormDialog({
  open,
  title,
  description,
  fields,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onSubmit,
  onCancel,
}: AdminFormDialogProps) {
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, string> = {};
    for (const field of fields) initial[field.key] = '';
    setValues(initial);
    setTouched({});
    const t = window.setTimeout(() => firstInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, fields]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  const errors = useMemo(() => {
    const next: Record<string, string | null> = {};
    for (const field of fields) {
      next[field.key] = fieldError(field, values[field.key] ?? '');
    }
    return next;
  }, [fields, values]);

  const canSubmit = fields.every((field) => !fieldError(field, values[field.key] ?? ''));

  if (!open) return null;

  const confirmClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-500 text-white'
      : 'bg-amber-600 hover:bg-amber-500 text-white';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(fields.map((f) => [f.key, true])));
    if (!canSubmit || loading) return;
    const trimmed: Record<string, string> = {};
    for (const field of fields) {
      trimmed[field.key] = (values[field.key] ?? '').trim();
    }
    onSubmit(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label="Close dialog"
        disabled={loading}
        onClick={onCancel}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-form-title"
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <div className="px-5 pt-5 pb-4 space-y-4">
          <div>
            <h2 id="admin-form-title" className="text-base font-semibold text-white">
              {title}
            </h2>
            {description ? (
              <div className="mt-2 text-sm text-slate-400 leading-relaxed [&_p+p]:mt-2">
                {description}
              </div>
            ) : null}
          </div>

          {fields.map((field, index) => {
            const value = values[field.key] ?? '';
            const showError = touched[field.key] && errors[field.key];
            const inputClass =
              'w-full px-3 py-2 bg-slate-800 border rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 ' +
              (showError ? 'border-red-500/60' : 'border-slate-700');

            return (
              <div key={field.key} className="space-y-1.5">
                <label htmlFor={`admin-form-${field.key}`} className="block text-sm font-medium text-slate-300">
                  {field.label}
                  {field.required ? <span className="text-red-400 ml-1">*</span> : null}
                </label>
                {field.multiline ? (
                  <textarea
                    ref={index === 0 ? (firstInputRef as React.RefObject<HTMLTextAreaElement>) : undefined}
                    id={`admin-form-${field.key}`}
                    value={value}
                    rows={3}
                    placeholder={field.placeholder}
                    disabled={loading}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    onBlur={() => setTouched((prev) => ({ ...prev, [field.key]: true }))}
                    className={`${inputClass} resize-y`}
                  />
                ) : (
                  <input
                    ref={index === 0 ? (firstInputRef as React.RefObject<HTMLInputElement>) : undefined}
                    id={`admin-form-${field.key}`}
                    type="text"
                    value={value}
                    placeholder={field.placeholder}
                    disabled={loading}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    onBlur={() => setTouched((prev) => ({ ...prev, [field.key]: true }))}
                    className={inputClass}
                  />
                )}
                {showError ? <p className="text-xs text-red-400">{errors[field.key]}</p> : null}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-800 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={loading || !canSubmit}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${confirmClass}`}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
