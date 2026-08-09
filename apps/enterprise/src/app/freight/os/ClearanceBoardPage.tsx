import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';

/** Customs & Clearance Board — lane cards + clearance events. */
export function ClearanceBoardPage({ embedded = false }: { embedded?: boolean }) {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const [scan, setScan] = useState('');

  const pkgs = useQuery({
    queryKey: ['freight', 'packages-clearance', organizationId],
    queryFn: async () => {
      const [hold, cleared, transit] = await Promise.all([
        freightService.listPackages(organizationId, 'customs_hold'),
        freightService.listPackages(organizationId, 'customs_cleared'),
        freightService.listPackages(organizationId, 'in_transit_intl'),
      ]);
      return {
        green: [...(cleared.packages ?? [])],
        yellowHold: [...(hold.packages ?? [])],
        inbound: [...(transit.packages ?? [])],
      };
    },
    enabled: Boolean(session),
  });

  const events = useQuery({
    queryKey: ['freight', 'clearance-events', organizationId],
    queryFn: () => freightService.listClearanceEvents(undefined, organizationId),
    enabled: Boolean(session),
  });

  const latestChannelByPkg = useMemo(() => {
    const map = new Map<string, string>();
    for (const ev of events.data?.events ?? []) {
      const pid = String(ev.package_id ?? '');
      if (pid && !map.has(pid)) map.set(pid, String(ev.channel));
    }
    return map;
  }, [events.data]);

  const yellow = useMemo(
    () =>
      (pkgs.data?.yellowHold ?? []).filter(
        (p) => (latestChannelByPkg.get(String(p.id)) ?? 'yellow') !== 'red',
      ),
    [pkgs.data, latestChannelByPkg],
  );
  const red = useMemo(
    () =>
      (pkgs.data?.yellowHold ?? []).filter(
        (p) => latestChannelByPkg.get(String(p.id)) === 'red',
      ),
    [pkgs.data, latestChannelByPkg],
  );

  const postLane = useMutation({
    mutationFn: (input: {
      packageId: string;
      channel: 'green' | 'yellow' | 'red';
    }) => freightService.postClearanceEvent(input, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'packages-clearance'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'clearance-events'] });
    },
  });

  const byTracking = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const p of [
      ...(pkgs.data?.green ?? []),
      ...(pkgs.data?.yellowHold ?? []),
      ...(pkgs.data?.inbound ?? []),
    ]) {
      if (p.courier_tracking_number) {
        map.set(String(p.courier_tracking_number).toUpperCase(), p);
      }
    }
    return map;
  }, [pkgs.data]);

  function applyScan(channel: 'green' | 'yellow' | 'red') {
    const pkg = byTracking.get(scan.trim().toUpperCase());
    if (!pkg) return;
    postLane.mutate({ packageId: String(pkg.id), channel });
    setScan('');
  }

  function Lane({
    title,
    tone,
    items,
  }: {
    title: string;
    tone: 'green' | 'amber' | 'red';
    items: Record<string, unknown>[];
  }) {
    return (
      <section
        className={`rounded-xl border p-3 ${
          tone === 'green'
            ? 'border-green-200 bg-green-50/40'
            : tone === 'amber'
              ? 'border-amber-200 bg-amber-50/40'
              : 'border-red-200 bg-red-50/40'
        }`}
      >
        <h2 className="px-1 text-sm font-semibold text-slate-900">
          {title} ({items.length})
        </h2>
        <div className="mt-3 space-y-3">
          {items.map((c) => (
            <article
              key={String(c.id)}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            >
              <p className="font-mono text-sm font-semibold">
                {String(c.courier_tracking_number ?? c.id)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{String(c.status)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    postLane.mutate({ packageId: String(c.id), channel: 'yellow' })
                  }
                  className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium"
                >
                  Hold
                </button>
                <button
                  type="button"
                  onClick={() =>
                    postLane.mutate({ packageId: String(c.id), channel: 'green' })
                  }
                  className="rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-slate-950"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() =>
                    postLane.mutate({ packageId: String(c.id), channel: 'red' })
                  }
                  className="rounded border border-red-300 px-2 py-1 text-[11px] font-medium text-red-800"
                >
                  Inspect
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded ? (
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Customs &amp; Clearance</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lane board · de-consolidation scan · filing status
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Lane board · de-consolidation scan · filing status
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          De-consolidation scanner
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyScan('green');
            }}
            placeholder="Scan tracking → Enter to clear"
            className="min-w-[240px] flex-1 rounded-xl border-2 border-slate-300 px-4 py-4 font-mono text-lg outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
          />
          <button
            type="button"
            onClick={() => applyScan('green')}
            className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950"
          >
            Clear scanned
          </button>
        </div>
      </div>

      {pkgs.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(pkgs.error as Error).message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Lane title="Green · Cleared" tone="green" items={pkgs.data?.green ?? []} />
        <Lane title="Yellow · Hold" tone="amber" items={yellow} />
        <Lane
          title="Red · Inspect / Inbound"
          tone="red"
          items={[...red, ...(pkgs.data?.inbound ?? [])]}
        />
      </div>
    </div>
  );
}
