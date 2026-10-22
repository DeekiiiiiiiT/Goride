function formatStageMinutes(value: unknown): string | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} min`;
}

export function RoamRideFunnel({
  funnel,
}: {
  funnel?: {
    hidden?: boolean;
    empty?: boolean;
    requested?: number;
    offered?: number;
    accepted?: number;
    arrived?: number;
    started?: number;
    completed?: number;
    stageMinutes?: {
      offered?: number | null;
      accepted?: number | null;
      arrived?: number | null;
      started?: number | null;
      completed?: number | null;
    };
  };
}) {
  if (!funnel || funnel.hidden) return null;
  const minutes = funnel.stageMinutes;
  const stages = [
    ['Requested', funnel.requested, null],
    ['Offered', funnel.offered, formatStageMinutes(minutes?.offered)],
    ['Accepted', funnel.accepted, formatStageMinutes(minutes?.accepted)],
    ['Arrived', funnel.arrived, formatStageMinutes(minutes?.arrived)],
    ['Started', funnel.started, formatStageMinutes(minutes?.started)],
    ['Completed', funnel.completed, formatStageMinutes(minutes?.completed)],
  ] as const;
  if (funnel.empty || !funnel.completed) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-lg font-semibold text-slate-900">Roam rider app</h3>
        <p className="mt-2 text-sm text-slate-500">Roam rider app requests will appear here. Uber and InDrive don't share request or matching data.</p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-semibold text-slate-900">Roam rider app</h3>
      <ol className="mt-3 space-y-2">
        {stages.map(([label, count, stageMin]) => (
          <li key={label} className="flex items-center justify-between gap-3 text-sm">
            <span>{label}</span>
            <span className="text-right">
              <span>{Number(count || 0).toLocaleString()}</span>
              {stageMin ? <span className="ml-2 text-slate-400">{stageMin}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
