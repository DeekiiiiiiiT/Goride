type ActivityList = { items: Array<Record<string, unknown>>; total: number };

export type PartsActivity = {
  requests: ActivityList;
  quotes: ActivityList;
  repeatAlerts: ActivityList;
  warrantyClaims: ActivityList;
  cores: ActivityList;
};

function newestLine(list: ActivityList | undefined) {
  const row = list?.items?.[0];
  if (!row) return "";
  return String(row.need_text || row.note || row.detail || "");
}

export function PartsActivityPanel({
  activity,
  onSeeAll,
  onAsk,
}: {
  activity: PartsActivity | null;
  onSeeAll: () => void;
  onAsk: () => void;
}) {
  const requests = activity?.requests;
  const alerts = activity?.repeatAlerts;
  const claims = activity?.warrantyClaims;
  const cores = activity?.cores;
  const owed = (cores?.items || []).reduce((sum, row) => sum + Number(row.core_charge || 0), 0);
  return (
    <div className="lg:col-span-4 flex flex-col gap-space-lg">
      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col">
        <div className="flex items-center justify-between pb-space-md mb-space-md">
          <div className="font-headline-sm text-headline-sm text-on-surface">Your parts activity</div>
          <button type="button" className="font-body-sm text-caption font-semibold text-on-surface hover:text-secondary underline underline-offset-4" onClick={onSeeAll}>
            See all
          </button>
        </div>
        <div className="flex flex-col divide-y divide-surface-container-high">
          <Row title="Requests" badge={`${requests?.total ?? 0} open`} body={newestLine(requests) || "None open."} />
          <Row title="Repeat-part alerts" badge={String(alerts?.total ?? 0)} body={newestLine(alerts) || "None open."} />
          <Row title="Warranty claims" badge={String(claims?.total ?? 0)} body={claims?.total ? newestLine(claims) : "None open. Crediting a claim is done by Roam."} />
          <Row title="Core returns" badge={`J$ ${owed.toLocaleString()}`} body={cores?.total ? `${cores.total} cores owed` : "None open."} />
        </div>
        <div className="mt-space-lg pt-space-md bg-surface-container-low p-space-md rounded-lg flex flex-col">
          <div className="flex items-center gap-space-xs text-on-surface font-headline-sm text-body-sm">
            <span className="material-symbols-outlined text-[18px]">manage_search</span>
            <span>Need a part not in inventory?</span>
          </div>
          <p className="font-body-sm text-caption text-on-surface-variant mt-1 leading-relaxed">
            Our team finds the part and gets you a price.
          </p>
          <button type="button" className="mt-space-md w-full py-2 px-space-md bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold rounded shadow-sm flex items-center justify-center gap-space-xs" onClick={onAsk}>
            <span className="material-symbols-outlined text-[16px]">support_agent</span>
            <span>Ask Roam to find it</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ title, badge, body }: { title: string; badge: string; body: string }) {
  return (
    <div className="py-space-md flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">{title}</span>
        <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-highest font-label-code text-caption text-on-surface font-semibold">
          {badge}
        </span>
      </div>
      <p className="font-body-sm text-caption text-on-surface-variant">{body}</p>
    </div>
  );
}
