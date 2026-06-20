import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { EDIT_PROFILE_PHOTO, MOCK_EDIT_PROFILE_DRAFT } from '@/lib/mockProfile';

type EditProfilePageProps = {
  onBack: () => void;
  onSave: () => void;
};

type FieldConfig = {
  id: keyof typeof MOCK_EDIT_PROFILE_DRAFT;
  label: string;
  icon: string;
  type: string;
  placeholder: string;
};

const FIELDS: FieldConfig[] = [
  { id: 'fullName', label: 'Full Name', icon: 'person', type: 'text', placeholder: 'Enter your full name' },
  { id: 'displayName', label: 'Display Name', icon: 'badge', type: 'text', placeholder: 'How customers see you' },
  { id: 'phone', label: 'Phone Number', icon: 'call', type: 'tel', placeholder: 'Phone number' },
  { id: 'email', label: 'Email Address', icon: 'mail', type: 'email', placeholder: 'Email address' },
];

export function EditProfilePage({ onBack, onSave }: EditProfilePageProps) {
  const [form, setForm] = useState(MOCK_EDIT_PROFILE_DRAFT);

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col">
      <SubPageHeader title="Edit Profile" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-32">
        <section className="flex flex-col items-center mb-8">
          <div className="relative group cursor-pointer mb-2">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-surface shadow-soft bg-surface-container">
              <img src={EDIT_PROFILE_PHOTO} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <MaterialIcon name="photo_camera" className="text-white" filled />
              </div>
            </div>
            <button
              type="button"
              aria-label="Change photo"
              className="absolute bottom-0 right-0 w-8 h-8 bg-surface rounded-full flex items-center justify-center shadow-primary text-primary hover:bg-surface-container-low active:scale-90"
            >
              <MaterialIcon name="edit" className="text-lg" filled />
            </button>
          </div>
          <button
            type="button"
            className="text-primary text-xs font-semibold uppercase tracking-wide py-2 px-4 rounded-full hover:bg-surface-container-low active:scale-95"
          >
            Change Photo
          </button>
        </section>

        <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
          {FIELDS.map((field) => (
            <div key={field.id} className="flex flex-col gap-1">
              <label htmlFor={field.id} className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant ml-1">
                {field.label}
              </label>
              <div className="rounded-xl bg-surface border border-outline-variant shadow-soft flex items-center px-4 h-14 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-shadow">
                <MaterialIcon name={field.icon} className="text-muted mr-2" />
                <input
                  id={field.id}
                  type={field.type}
                  value={form[field.id]}
                  placeholder={field.placeholder}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full bg-transparent border-none p-0 text-base text-on-surface focus:ring-0 placeholder:text-muted"
                />
              </div>
            </div>
          ))}
        </form>
      </main>

      <div className="fixed bottom-0 w-full bg-surface/90 backdrop-blur-md px-[var(--spacing-edge)] py-4 pb-safe shadow-[0_-6px_12px_rgba(0,108,73,0.1)] border-t border-surface-container-low">
        <button
          type="button"
          onClick={onSave}
          className="w-full h-14 bg-primary text-on-primary rounded-xl text-xs font-semibold uppercase tracking-wide flex items-center justify-center shadow-primary active:scale-[0.98] transition-transform"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
