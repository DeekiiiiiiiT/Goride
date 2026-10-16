import type { SupportContact } from '@roam/rush-settings';

const EMPTY: SupportContact = { phone: '', whatsapp: '', email: '', hours: '' };

export function ContactsEditor({
  value,
  onChange,
  readOnly,
}: {
  value: unknown;
  onChange: (next: SupportContact) => void;
  readOnly?: boolean;
}) {
  const v: SupportContact = {
    ...EMPTY,
    ...(typeof value === 'object' && value ? (value as SupportContact) : {}),
  };

  function set<K extends keyof SupportContact>(key: K, next: SupportContact[K]) {
    onChange({ ...v, [key]: next });
  }

  const field = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white';

  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="text-slate-400">Phone</span>
        <input className={field} value={v.phone} disabled={readOnly} onChange={(e) => set('phone', e.target.value)} placeholder="+1876…" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-400">WhatsApp</span>
        <input className={field} value={v.whatsapp} disabled={readOnly} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+1876…" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-400">Email</span>
        <input className={field} type="email" value={v.email} disabled={readOnly} onChange={(e) => set('email', e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-400">Hours</span>
        <input className={field} value={v.hours} disabled={readOnly} onChange={(e) => set('hours', e.target.value)} placeholder="8am–10pm" />
      </label>
    </div>
  );
}
