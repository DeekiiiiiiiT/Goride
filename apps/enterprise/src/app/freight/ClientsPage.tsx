import { FormEvent, useState } from 'react';
import { useCreateClient, useFreightClients } from '@/app/hooks/useFreight';

export function ClientsPage() {
  const { data, isLoading, error } = useFreightClients();
  const create = useCreateClient();
  const [formError, setFormError] = useState<string | null>(null);
  const rows = data?.clients ?? [];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await create.mutateAsync({
        name: String(fd.get('name') || ''),
        email: String(fd.get('email') || '') || null,
        phone: String(fd.get('phone') || '') || null,
      });
      form.reset();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="mt-1 text-sm text-slate-500">Bill-to parties for freight jobs.</p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <input name="name" required placeholder="Client name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="email" type="email" placeholder="Email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="phone" placeholder="Phone" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 sm:col-span-3">
          Add client
        </button>
        {formError && <p className="text-sm text-red-600 sm:col-span-3">{formError}</p>}
      </form>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {!isLoading && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          No clients yet.
        </p>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {rows.map((c) => (
          <li key={String(c.id)} className="px-4 py-3 text-sm">
            <p className="font-medium">{String(c.name)}</p>
            <p className="text-slate-500">{c.email ? String(c.email) : '—'}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
