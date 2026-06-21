import { useEffect, useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface AddCategorySheetProps {
  open: boolean;
  initialName?: string;
  title?: string;
  onClose: () => void;
  onSave: (name: string) => void;
  isSubmitting?: boolean;
}

export default function AddCategorySheet({
  open,
  initialName = '',
  title = 'Add Category',
  onClose,
  onSave,
  isSubmitting = false,
}: AddCategorySheetProps) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="partner-modal-fade fixed inset-0 z-[60] flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="partner-modal-slide w-full max-w-md rounded-t-2xl border-t border-outline-variant bg-surface-container-lowest p-margin-mobile shadow-xl sm:rounded-2xl sm:border"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-headline-md font-semibold text-on-surface">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low"
          >
            <MaterialIcon name="close" />
          </button>
        </div>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Category name (e.g., Chicken, Sides)"
          className="mb-4 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 text-body-lg text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          autoFocus
        />
        <div className="flex gap-sm">
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 flex-1 items-center justify-center rounded-lg border border-outline-variant text-label-md font-semibold text-on-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || isSubmitting}
            onClick={() => onSave(name.trim())}
            className="flex h-12 flex-1 items-center justify-center rounded-lg bg-primary-container text-label-md font-semibold text-on-primary disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
