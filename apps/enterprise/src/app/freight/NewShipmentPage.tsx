import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import {
  useCreateShipment,
  useFreightCarriers,
  useFreightClients,
  useFreightRateCards,
} from '@/app/hooks/useFreight';

const formSchema = z.object({
  originLabel: z.string().min(2),
  destinationLabel: z.string().min(2),
  mode: z.enum(['own', '3pl', 'mixed']),
  clientId: z.string().optional(),
  rateCardId: z.string().optional(),
  consignmentDescription: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  carrierId: z.string().optional(),
  book: z.boolean(),
});

export function NewShipmentPage() {
  const navigate = useNavigate();
  const create = useCreateShipment();
  const clients = useFreightClients();
  const carriers = useFreightCarriers();
  const rateCards = useFreightRateCards();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const parsed = formSchema.safeParse({
      originLabel: fd.get('originLabel'),
      destinationLabel: fd.get('destinationLabel'),
      mode: fd.get('mode'),
      clientId: fd.get('clientId') || undefined,
      rateCardId: fd.get('rateCardId') || undefined,
      consignmentDescription: fd.get('consignmentDescription'),
      quantity: fd.get('quantity'),
      carrierId: fd.get('carrierId') || undefined,
      book: fd.get('book') === 'on',
    });
    if (!parsed.success) {
      setError('Check required fields.');
      return;
    }
    const v = parsed.data;
    try {
      const res = await create.mutateAsync({
        originLabel: v.originLabel,
        destinationLabel: v.destinationLabel,
        mode: v.mode,
        clientId: v.clientId || null,
        rateCardId: v.rateCardId || null,
        currency: 'JMD',
        book: v.book,
        consignments: [
          {
            description: v.consignmentDescription,
            quantity: v.quantity,
            currency: 'JMD',
            hazmat: false,
          },
        ],
        legs: [
          {
            sequence: 1,
            carrierId: v.carrierId || null,
          },
        ],
      });
      navigate(`/app/shipments/${res.shipment.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/app/domestic" className="text-sm text-slate-500 hover:underline">
          ← Shipments
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New shipment</h1>
        <p className="mt-1 text-sm text-slate-500">
          Domestic Jamaica booking — origin, destination, cargo, and carrier.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <label className="block text-sm">
          Origin
          <input
            name="originLabel"
            required
            placeholder="Kingston"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Destination
          <input
            name="destinationLabel"
            required
            placeholder="Montego Bay"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Mode
          <select name="mode" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="own">Own fleet</option>
            <option value="3pl">3PL</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <label className="block text-sm">
          Client
          <select name="clientId" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">— Optional —</option>
            {(clients.data?.clients ?? []).map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {String(c.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Rate card
          <select name="rateCardId" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">— Optional —</option>
            {(rateCards.data?.rateCards ?? []).map((r) => (
              <option key={String(r.id)} value={String(r.id)}>
                {String(r.name)} ({Number(r.amount_minor) / 100} {String(r.currency)})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Cargo description
          <input
            name="consignmentDescription"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Quantity
          <input
            name="quantity"
            type="number"
            min={1}
            defaultValue={1}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Carrier (leg 1)
          <select name="carrierId" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">— Assign later —</option>
            {(carriers.data?.carriers ?? []).map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {String(c.name)} {c.is_own_fleet ? '(own)' : '(3PL)'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="book" className="h-4 w-4" />
          Book immediately (skip draft)
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {create.isPending ? 'Saving…' : 'Create shipment'}
        </button>
      </form>
    </div>
  );
}
