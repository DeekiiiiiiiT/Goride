import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

type Props = {
  value: string[];
  disabled?: boolean;
  onChange: (tags: string[]) => void;
};

const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 80;

export function CategoryTagsEditor({ value, disabled, onChange }: Props) {
  const [draft, setDraft] = useState('');

  const addTag = () => {
    const label = draft.trim();
    if (!label || label.length > MAX_TAG_LENGTH) return;
    const exists = value.some((tag) => tag.toLowerCase() === label.toLowerCase());
    if (exists || value.length >= MAX_TAGS) return;
    onChange([...value, label]);
    setDraft('');
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((item) => item !== tag));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Tags shown to partners on the categories step. Add or remove anytime — changes apply immediately.
      </p>

      <div className="flex flex-wrap gap-2 min-h-[2rem]">
        {value.length === 0 ? (
          <span className="text-xs text-slate-500">No tags yet.</span>
        ) : (
          value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-xs text-slate-200"
            >
              {tag}
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeTag(tag)}
                className="rounded-full p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          disabled={disabled || value.length >= MAX_TAGS}
          value={draft}
          maxLength={MAX_TAG_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a tag…"
          className="flex-1 px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm"
        />
        <button
          type="button"
          disabled={disabled || !draft.trim() || value.length >= MAX_TAGS}
          onClick={addTag}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        {value.length}/{MAX_TAGS} tags · {MAX_TAG_LENGTH} characters max per tag
      </p>
    </div>
  );
}
