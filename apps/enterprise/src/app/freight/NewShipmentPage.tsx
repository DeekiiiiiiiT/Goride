import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useCreateShipment,
  useFreightCarriers,
  useFreightClients,
  useFreightRateCards,
  useSuites,
} from '@/app/hooks/useFreight';
import {
  DomesticBookDefaults,
  LAST_DOMESTIC_BOOK_KEY,
  OpsWizard,
  readLastJob,
  writeLastJob,
} from '@/app/freight/os/wizard';

const STEPS = ['Who', 'Where', 'When', 'Confirm'] as const;

export function NewShipmentPage() {
  const navigate = useNavigate();
  const create = useCreateShipment();
  const clients = useFreightClients();
  const carriers = useFreightCarriers();
  const rateCards = useFreightRateCards();
  const suites = useSuites();
  const last = useMemo(
    () => readLastJob<DomesticBookDefaults>(LAST_DOMESTIC_BOOK_KEY),
    [],
  );

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(last.clientId ?? '');
  const [suiteId, setSuiteId] = useState(last.suiteId ?? '');
  const [originLabel, setOriginLabel] = useState(last.originLabel ?? '');
  const [destinationLabel, setDestinationLabel] = useState(last.destinationLabel ?? '');
  const [mode, setMode] = useState<'own' | '3pl' | 'mixed'>(last.mode ?? 'own');
  const [rateCardId, setRateCardId] = useState(last.rateCardId ?? '');
  const [carrierId, setCarrierId] = useState(last.carrierId ?? '');
  const [consignmentDescription, setConsignmentDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [book, setBook] = useState(true);

  const suiteList = suites.data?.suites ?? [];

  function applySuite(id: string) {
    setSuiteId(id);
    if (!id) return;
    const suite = suiteList.find((s) => String(s.id) === id);
    if (!suite) return;
    const suiteClient =
      suite.client_id != null
        ? String(suite.client_id)
        : suite.clientId != null
          ? String(suite.clientId)
          : '';
    if (suiteClient) setClientId(suiteClient);
    const addrRaw = suite.delivery_address ?? suite.deliveryAddress;
    const addr = addrRaw != null ? String(addrRaw).trim() : '';
    if (addr) setDestinationLabel(addr);
  }

  function validateStep(at = step): boolean {
    setError(null);
    if (at >= 1) {
      if (originLabel.trim().length < 2 || destinationLabel.trim().length < 2) {
        setError('Origin and destination need at least 2 characters.');
        return false;
      }
    }
    if (at >= 2) {
      if (!consignmentDescription.trim() || quantity < 1) {
        setError('Add cargo description and a quantity of at least 1.');
        return false;
      }
    }
    return true;
  }

  function onContinue() {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function onConfirm() {
    if (!validateStep(3)) return;
    setError(null);
    try {
      const res = await create.mutateAsync({
        originLabel: originLabel.trim(),
        destinationLabel: destinationLabel.trim(),
        mode,
        clientId: clientId || null,
        rateCardId: rateCardId || null,
        currency: 'JMD',
        book,
        consignments: [
          {
            description: consignmentDescription.trim(),
            quantity,
            currency: 'JMD',
            hazmat: false,
          },
        ],
        legs: [{ sequence: 1, carrierId: carrierId || null }],
      });
      writeLastJob(LAST_DOMESTIC_BOOK_KEY, {
        originLabel: originLabel.trim(),
        destinationLabel: destinationLabel.trim(),
        mode,
        clientId: clientId || undefined,
        carrierId: carrierId || undefined,
        rateCardId: rateCardId || undefined,
        suiteId: suiteId || undefined,
      } satisfies DomesticBookDefaults);
      navigate(`/app/shipments/${res.shipment.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const clientName =
    (clients.data?.clients ?? []).find((c) => String(c.id) === clientId)?.name ??
    '—';
  const suiteCode =
    suiteList.find((s) => String(s.id) === suiteId)?.suite_code ?? '—';
  const carrierName =
    (carriers.data?.carriers ?? []).find((c) => String(c.id) === carrierId)?.name ??
    'Assign later';
  const rateName =
    (rateCards.data?.rateCards ?? []).find((r) => String(r.id) === rateCardId)?.name ??
    '—';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/app/domestic" className="text-sm text-slate-500 hover:underline">
          ← Shipments
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New shipment</h1>
        <p className="mt-1 text-sm text-slate-500">
          Who → where → when → confirm. Defaults remember your last job.
        </p>
      </div>

      <OpsWizard
        steps={[...STEPS]}
        stepIndex={step}
        onBack={() => {
          setError(null);
          setStep((s) => Math.max(0, s - 1));
        }}
        onContinue={onContinue}
        error={error}
        confirmSlot={
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => void onConfirm()}
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
          >
            {create.isPending ? 'Saving…' : 'Create shipment'}
          </button>
        }
      >
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-800">Who is this for?</p>
            <label className="block text-sm">
              Client
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">— Optional —</option>
                {(clients.data?.clients ?? []).map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {String(c.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Suite
              <select
                value={suiteId}
                onChange={(e) => applySuite(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
              >
                <option value="">— Optional —</option>
                {suiteList.map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {String(s.suite_code)} · {String(s.contact_name || '')}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Picking a suite fills client and destination when available.
              </span>
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-800">Where is it going?</p>
            <label className="block text-sm">
              Origin
              <input
                value={originLabel}
                onChange={(e) => setOriginLabel(e.target.value)}
                required
                placeholder="Kingston"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Destination
              <input
                value={destinationLabel}
                onChange={(e) => setDestinationLabel(e.target.value)}
                required
                placeholder="Montego Bay"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-800">What and how for this run?</p>
            <label className="block text-sm">
              Cargo description
              <input
                value={consignmentDescription}
                onChange={(e) => setConsignmentDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Quantity
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Mode
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'own' | '3pl' | 'mixed')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="own">Own fleet</option>
                <option value="3pl">3PL</option>
                <option value="mixed">Mixed</option>
              </select>
            </label>
            <label className="block text-sm">
              Carrier (leg 1)
              <select
                value={carrierId}
                onChange={(e) => setCarrierId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">— Assign later —</option>
                {(carriers.data?.carriers ?? []).map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {String(c.name)} {c.is_own_fleet ? '(own)' : '(3PL)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Rate card
              <select
                value={rateCardId}
                onChange={(e) => setRateCardId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">— Optional —</option>
                {(rateCards.data?.rateCards ?? []).map((r) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {String(r.name)} ({Number(r.amount_minor) / 100} {String(r.currency)})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-slate-800">Confirm booking</p>
            <dl className="space-y-2 rounded-lg bg-slate-50 px-3 py-3 text-slate-700">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Client</dt>
                <dd>{String(clientName)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Suite</dt>
                <dd className="font-mono">{String(suiteCode)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Route</dt>
                <dd className="text-right">
                  {originLabel} → {destinationLabel}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Cargo</dt>
                <dd className="text-right">
                  {consignmentDescription} × {quantity}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Mode</dt>
                <dd>{mode}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Carrier</dt>
                <dd>{String(carrierName)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Rate card</dt>
                <dd>{String(rateName)}</dd>
              </div>
            </dl>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={book}
                onChange={(e) => setBook(e.target.checked)}
                className="h-4 w-4"
              />
              Book immediately (skip draft)
            </label>
          </div>
        )}
      </OpsWizard>
    </div>
  );
}
