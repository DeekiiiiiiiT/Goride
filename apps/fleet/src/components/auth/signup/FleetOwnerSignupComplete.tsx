import React, { useState } from 'react';
import { Car, Check, Loader2 } from 'lucide-react';
import { Button, Input, Label } from '@roam/ui';
import { useAuth } from '../AuthContext';
import { provisionFleetOwnerAccount } from '../../../services/fleetOwnerAuth';
import { supabase } from '../../../utils/supabase/client';
import type { ServiceLine } from '../BusinessConfigContext';

type WizardStep = 'company' | 'service-lines' | 'plan' | 'owner';

const SERVICE_LINE_OPTIONS: { id: ServiceLine; label: string; description: string }[] = [
  {
    id: 'rideshare',
    label: 'Rideshare',
    description: 'Uber, Lyft, and driver settlements — standard Roam Fleet.',
  },
  {
    id: 'rush_delivery',
    label: 'Deliveries',
    description: 'Couriers and delivery ops in the same RoamFleet portal — included when you select this line.',
  },
];

export function FleetOwnerSignupComplete({ fromRoamdriver }: { fromRoamdriver?: boolean }) {
  const { user, refreshSession } = useAuth();
  const [step, setStep] = useState<WizardStep>('company');
  const [companyName, setCompanyName] = useState('');
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>(['rideshare']);
  const [name, setName] = useState(
    (user?.user_metadata?.name as string) ||
      user?.email?.split('@')[0] ||
      '',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rushAddonAck, setRushAddonAck] = useState(false);

  const toggleServiceLine = (line: ServiceLine) => {
    setServiceLines((prev) => {
      if (prev.includes(line)) {
        const next = prev.filter((l) => l !== line);
        return next.length ? next : prev;
      }
      return [...prev, line];
    });
  };

  const businessType =
    serviceLines.includes('rush_delivery') && !serviceLines.includes('rideshare')
      ? 'delivery'
      : 'rideshare';

  const finish = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session expired. Please sign in again.');

      const trimmedCompany = companyName.trim();
      const trimmedName = name.trim();

      await supabase.auth.updateUser({
        data: {
          name: trimmedName || undefined,
          companyName: trimmedCompany || undefined,
          serviceLines,
          businessType,
        },
      });

      if (trimmedCompany) {
        localStorage.setItem('roam_fleet_name', trimmedCompany);
        window.dispatchEvent(new Event('fleetNameUpdated'));
      }

      const result = await provisionFleetOwnerAccount(token, {
        name: trimmedName || undefined,
        companyName: trimmedCompany || undefined,
        serviceLines,
        alsoDrive: true,
      });
      if (!result.success) throw new Error(result.error || 'Could not create fleet.');

      await refreshSession();
      window.history.replaceState({}, '', '/');
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const stepIndex =
    step === 'company' ? 0 : step === 'service-lines' ? 1 : step === 'plan' ? 2 : 3;
  const needsPlanStep = serviceLines.includes('rush_delivery');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-900">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-600">
            <Car className="h-7 w-7 text-white" />
          </div>
        </div>
        <h1 className="text-center text-2xl font-bold text-slate-900 dark:text-white">Create your fleet</h1>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
          {fromRoamdriver
            ? 'Finish setting up your Roam Fleet portal. You can keep using Roam Driver with the same account.'
            : 'Set up your fleet — choose which service lines you operate.'}
        </p>

        <div className="mt-6 flex justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                i <= stepIndex ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}

        {step === 'company' && (
          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="fleet-company-name">Company / fleet name</Label>
              <Input
                id="fleet-company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Transport Ltd."
                className="mt-1.5"
              />
            </div>
            <Button
              type="button"
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={!companyName.trim()}
              onClick={() => setStep('service-lines')}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 'service-lines' && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Select every service line this fleet will manage. You can run rideshare, deliveries, or both in one portal.
            </p>
            <div className="space-y-2">
              {SERVICE_LINE_OPTIONS.map((opt) => {
                const selected = serviceLines.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleServiceLine(opt.id)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        selected
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {selected ? <Check className="h-3 w-3" /> : null}
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{opt.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{opt.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {serviceLines.includes('rush_delivery') && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Delivery features roll out gradually — Roam enables them for your account during pilot.
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep('company')}>
                Back
              </Button>
              <Button
                type="button"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                onClick={() => setStep(needsPlanStep ? 'plan' : 'owner')}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'plan' && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Deliveries is a paid add-on module. Roam enables features during pilot; billing follows your commercial agreement.
            </p>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={rushAddonAck}
                onChange={(e) => setRushAddonAck(e.target.checked)}
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                I understand delivery modules may be billed separately and roll out per org during pilot.
              </span>
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep('service-lines')}>
                Back
              </Button>
              <Button
                type="button"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                disabled={!rushAddonAck}
                onClick={() => setStep('owner')}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'owner' && (
          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="fleet-owner-name">Your full name</Label>
              <Input
                id="fleet-owner-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Fleet owner name"
                className="mt-1.5"
              />
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900/50 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">{companyName.trim()}</span>
              {' · '}
              {serviceLines.map((l) => (l === 'rideshare' ? 'Rideshare' : 'Deliveries')).join(' + ')}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(needsPlanStep ? 'plan' : 'service-lines')}>
                Back
              </Button>
              <Button
                type="button"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                disabled={loading}
                onClick={() => void finish()}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create fleet account'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
