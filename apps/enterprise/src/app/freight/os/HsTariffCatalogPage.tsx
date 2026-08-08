import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';

/** HS Tariff Catalog — live CRUD. */
export function HsTariffCatalogPage() {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [cetPct, setCetPct] = useState('20');

  const q = useQuery({
    queryKey: ['freight', 'hs-tariffs', organizationId],
    queryFn: () => freightService.listHsTariffs(organizationId),
    enabled: Boolean(session),
  });

  const create = useMutation({
    mutationFn: () =>
      freightService.createHsTariff(
        {
          code,
          description,
          category,
          cetRate: Number(cetPct) / 100,
          active: true,
        },
        organizationId,
      ),
    onSuccess: () => {
      setCode('');
      setDescription('');
      void qc.invalidateQueries({ queryKey: ['freight', 'hs-tariffs'] });
    },
  });

  const rows = q.data?.tariffs ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">HS Tariff Catalog</h1>
          <p className="mt-1 text-sm text-slate-500">
            CARICOM CET rates for the Landed Cost engine
          </p>
        </div>
      </div>

      <form
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="HS code"
          className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={cetPct}
            onChange={(e) => setCetPct(e.target.value)}
            type="number"
            min={0}
            max={100}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={create.isPending}
            className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950"
          >
            Add
          </button>
        </div>
      </form>

      {q.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(q.error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">CET %</th>
              <th className="px-4 py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-mono text-xs">{String(row.code)}</td>
                <td className="px-4 py-2.5">{String(row.description ?? '')}</td>
                <td className="px-4 py-2.5 text-slate-600">{String(row.category ?? '')}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {(Number(row.cet_rate ?? 0) * 100).toFixed(0)}%
                </td>
                <td className="px-4 py-2.5">{row.active ? 'Yes' : 'No'}</td>
              </tr>
            ))}
            {!q.isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No tariffs yet — add your first CET rate.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
