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
  };
}) {
  if (!funnel || funnel.hidden) return null;
  const stages = [
    ['Requested', funnel.requested],
    ['Offered', funnel.offered],
    ['Accepted', funnel.accepted],
    ['Arrived', funnel.arrived],
    ['Started', funnel.started],
    ['Completed', funnel.completed],
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
        {stages.map(([label, count]) => (
          <li key={label} className="flex items-center justify-between text-sm">
            <span>{label}</span>
            <span>{Number(count || 0).toLocaleString()}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-slate-400">Stage minutes are not exported, so they are left blank.</p>
    </section>
  );
}
