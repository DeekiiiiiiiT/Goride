export function FinancePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Finance</h1>
      <p className="text-sm text-slate-500">
        Freight billing posts to the unified ledger under product key{' '}
        <code className="rounded bg-slate-100 px-1">roam_enterprise</code>. Full business-finance
        P&amp;L desks will mount here; shipment billing is available on each shipment detail.
      </p>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
        Open a delivered or in-progress shipment and use <strong>Bill shipment</strong> to invoice
        against the attached rate card.
      </div>
    </div>
  );
}

export function ClaimsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Cargo claims</h1>
      <p className="text-sm text-slate-500">
        Claim / dispute workflow for cargo loss and damage (pattern ported from Fleet claimable-loss).
      </p>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
        No open claims. Mark a shipment as exception and file a claim from shipment detail in a
        follow-up release.
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-slate-500">
        Tenant settings share the Dominion <code className="rounded bg-slate-100 px-1">enterprise</code>{' '}
        segment schema (currency JMD, timezone America/Jamaica by default).
      </p>
      <dl className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <div className="flex justify-between border-b border-slate-100 py-2">
          <dt className="text-slate-500">Product line</dt>
          <dd className="font-medium">enterprise</dd>
        </div>
        <div className="flex justify-between border-b border-slate-100 py-2">
          <dt className="text-slate-500">Default currency</dt>
          <dd className="font-medium">JMD</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-slate-500">Timezone</dt>
          <dd className="font-medium">America/Jamaica</dd>
        </div>
      </dl>
    </div>
  );
}
