/** Ported from Stitch gap screen — panel only (audit R16-01, wired R20). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapVendorEditorForm } from './useGapVendorEditorForm';
import { useInventoryShell } from '../InventoryShellContext';

export function GapVendorEditor(p: { vendorId?: string | null; onClose?: () => void }) {
  const shell = useInventoryShell();
  const form = useGapVendorEditorForm(p.vendorId, p.onClose);
  const hubLabel = shell.overview?.hub_code ? String(shell.overview.hub_code) : '—';
  const drawerVendor = form.existing;
  const drawerTitle = drawerVendor ? String(drawerVendor.name ?? 'Vendor') : 'New vendor';
  const drawerCode = form.existingId ? form.vendorCode(form.existingId) : '—';

  return (
    <GapModalShell onClose={p.onClose} ariaLabel="VendorEditor">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
        <div className="fleet-inventory-stitch inventory-stitch-root">
          <div className="inventory-stitch-main">
            <div className="flex flex-col w-full">
              <div className="relative w-full overflow-hidden bg-surface pb-16">
                <div className="max-w-[1440px] mx-auto px-margin-desktop pt-8">
                  <div className="flex items-center justify-between pb-4">
                    <span className="inline-flex items-center gap-space-xs text-on-surface-variant font-body-sm text-body-sm">
                      <span>Purchasing</span>
                      <span className="text-outline-variant">/</span>
                      <span className="text-on-surface font-medium">Vendors & Suppliers</span>
                    </span>
                    <div className="flex items-center gap-space-sm bg-surface-container px-space-md py-1 rounded text-on-surface-variant font-label-code text-caption">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span>
                        {hubLabel} · Procurement
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg pb-6">
                    <div>
                      <div className="flex items-center gap-space-sm">
                        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                          Vendors & Suppliers
                        </h1>
                        <span className="bg-surface-container-high px-2 py-0.5 rounded text-on-surface font-label-code text-caption font-semibold">
                          {form.vendorCount} Registered
                        </span>
                      </div>
                      <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                        Approved parts vendors, service shops, and logistics partners for {hubLabel} operations.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-6">
                    <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between">
                      <div>
                        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider block">
                          Active Accounts
                        </span>
                        <span className="font-headline-sm text-headline-sm text-on-surface font-label-price">
                          {form.activeCount}
                        </span>
                      </div>
                    </div>
                    <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between">
                      <div>
                        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider block">
                          Live Open POs
                        </span>
                        <span className="font-headline-sm text-headline-sm text-on-surface font-label-price">
                          {form.openPoTotal}
                        </span>
                      </div>
                    </div>
                    <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between">
                      <div>
                        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider block">
                          Avg Lead Window
                        </span>
                        <span className="font-headline-sm text-headline-sm text-on-surface font-label-code">
                          {form.avgLeadDays != null ? `${form.avgLeadDays.toFixed(1)} Days` : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between">
                      <div>
                        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider block">
                          Landed YTD Volume
                        </span>
                        <span className="font-headline-sm text-headline-sm text-on-surface font-label-price">—</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface-container-lowest rounded shadow-sm overflow-hidden">
                    {form.vendors.length === 0 ? (
                      <p className="p-space-lg font-body-sm text-body-sm text-on-surface-variant">
                        No vendors yet. Use the drawer to add your first supplier.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-container-low text-on-surface-variant font-caption text-caption uppercase tracking-wider">
                              <th className="py-3 px-space-lg font-semibold">Name & Code</th>
                              <th className="py-3 px-space-md font-semibold">Phone</th>
                              <th className="py-3 px-space-md font-semibold">What they supply</th>
                              <th className="py-3 px-space-md font-semibold text-center">Delivers in</th>
                              <th className="py-3 px-space-md font-semibold text-center">Open POs</th>
                              <th className="py-3 px-space-md font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-container-low text-body-sm font-body-sm text-on-surface">
                            {form.vendors.map((v) => {
                              const id = String(v.id ?? '');
                              const st = form.statsByVendor.get(id);
                              const openPo = Number(st?.open_po_count ?? 0);
                              const lead =
                                v.lead_time_days != null ? `${v.lead_time_days} days` : '—';
                              return (
                                <tr key={id} className="hover:bg-surface-container/60 transition-colors">
                                  <td className="py-3.5 px-space-lg">
                                    <div className="flex items-center gap-space-sm">
                                      <div className="w-8 h-8 rounded bg-primary-container text-on-primary flex items-center justify-center font-label-code text-caption font-bold">
                                        {form.vendorInitials(String(v.name ?? ''))}
                                      </div>
                                      <div>
                                        <div className="font-semibold text-on-surface">{String(v.name ?? '—')}</div>
                                        <span className="font-label-code text-caption text-on-surface-variant">
                                          {form.vendorCode(id)}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-space-md font-label-code">{String(v.phone ?? '—')}</td>
                                  <td className="py-3.5 px-space-md max-w-xs truncate" title={String(v.description ?? '')}>
                                    {String(v.description ?? '—')}
                                  </td>
                                  <td className="py-3.5 px-space-md text-center font-label-code">{lead}</td>
                                  <td className="py-3.5 px-space-md text-center font-label-price">{openPo}</td>
                                  <td className="py-3.5 px-space-md">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container font-caption text-caption">
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${v.is_active !== false ? 'bg-primary' : 'bg-outline-variant'}`}
                                      />
                                      {v.is_active !== false ? 'Active' : 'Archived'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="fixed inset-0 z-50 overflow-hidden pointer-events-auto">
                <div className="absolute inset-0 bg-primary-container/40 backdrop-blur-[2px]" />
                <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
                  <div className="w-screen max-w-[560px] bg-surface-container-lowest shadow-2xl flex flex-col justify-between">
                    <div className="px-6 py-5 bg-surface-container-low flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">
                            Edit vendor
                          </span>
                          <span className="font-label-code text-caption px-2 py-0.5 rounded-full bg-primary text-on-primary font-semibold">
                            {form.isActive ? 'Active' : 'Archived'}
                          </span>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                          {drawerTitle} ({drawerCode})
                        </p>
                      </div>
                      <button
                        type="button"
                        className="p-1.5 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                        aria-label="Close drawer"
                        onClick={p.onClose}
                      >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                      {form.existingId ? (
                        <div className="p-4 rounded-xl bg-surface-container flex flex-col gap-3">
                          <div className="grid grid-cols-3 gap-2 py-1">
                            <div>
                              <span className="block font-caption text-caption text-on-surface-variant">Open POs</span>
                              <span className="font-body-lg font-bold font-label-price">{form.openPoCount}</span>
                            </div>
                            <div>
                              <span className="block font-caption text-caption text-on-surface-variant">Catalog SKUs</span>
                              <span className="font-body-lg font-bold font-label-price">{form.catalogSkuCount}</span>
                            </div>
                            <div>
                              <span className="block font-caption text-caption text-on-surface-variant">Dispatches</span>
                              <span className="font-body-lg font-bold font-label-code">{form.dispatchCount}</span>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-4">
                        <div>
                          <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">
                            Vendor Legal Name
                          </label>
                          <input
                            className="w-full px-3 py-2 bg-surface-container-low rounded text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest"
                            type="text"
                            value={form.name}
                            onChange={(e) => form.setName(e.target.value)}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">
                              Phone Contact
                            </label>
                            <input
                              className="w-full px-3 py-2 bg-surface-container-low rounded font-label-code text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest"
                              type="text"
                              value={form.phone}
                              onChange={(e) => form.setPhone(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">
                              PO Direct Email
                            </label>
                            <input
                              className="w-full px-3 py-2 bg-surface-container-low rounded font-label-code text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest"
                              type="email"
                              value={form.email}
                              onChange={(e) => form.setEmail(e.target.value)}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">
                            Supply Specialization & Scope
                          </label>
                          <textarea
                            className="w-full px-3 py-2 bg-surface-container-low rounded text-body-sm resize-none"
                            rows={2}
                            value={form.description}
                            onChange={(e) => form.setDescription(e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1.5 font-semibold">
                            Category Tags
                          </label>
                          <div className="flex items-center flex-wrap gap-2">
                            {form.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-on-primary font-caption text-caption font-medium"
                              >
                                <span>{tag}</span>
                                <button type="button" aria-label={`Remove ${tag}`} onClick={() => form.removeTag(tag)}>
                                  <span className="material-symbols-outlined text-[14px]">close</span>
                                </button>
                              </span>
                            ))}
                            <input
                              className="min-w-[100px] flex-1 px-2 py-1 rounded bg-surface-container font-caption text-caption"
                              placeholder="Add tag"
                              value={form.tagDraft}
                              onChange={(e) => form.setTagDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  form.addTag();
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container text-on-surface font-caption text-caption"
                              onClick={() => form.addTag()}
                            >
                              <span className="material-symbols-outlined text-[14px]">add</span>
                              Add tag
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                          <div>
                            <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">
                              Average Lead Window
                            </label>
                            <div className="flex items-center rounded bg-surface-container-low overflow-hidden">
                              <input
                                className="w-full px-3 py-2 bg-transparent font-label-code text-on-surface focus:outline-none"
                                type="number"
                                min={1}
                                max={90}
                                value={form.leadTimeDays}
                                onChange={(e) => form.setLeadTimeDays(e.target.value)}
                              />
                              <span className="px-3 text-caption text-on-surface-variant select-none">Days</span>
                            </div>
                          </div>
                          <label className="flex items-center gap-space-sm p-2 rounded bg-surface-container cursor-pointer select-none">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={form.isActive}
                              onChange={(e) => form.setIsActive(e.target.checked)}
                            />
                            <div className="w-8 h-4.5 bg-surface-container-highest rounded-full peer-checked:bg-primary relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-primary after:rounded-full after:h-3.5 after:w-3.5 peer-checked:after:translate-x-full after:transition-all" />
                            <span className="font-body-sm text-body-sm text-on-surface font-medium">Vendor Active</span>
                          </label>
                        </div>

                        {form.catalogSkuCount > 0 || form.tierLabel ? (
                          <div className="mt-4 p-4 rounded-xl bg-surface-container-low flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <span className="font-body-sm text-body-sm font-semibold text-on-surface">
                                Roam Fleet Catalog EPC
                              </span>
                              <span className="px-2 py-0.5 rounded text-[11px] font-label-code bg-surface-container-highest text-on-surface font-semibold">
                                {form.tierLabel}
                              </span>
                            </div>
                            <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
                              {form.catalogSkuCount} catalog SKUs linked · {form.dispatchCount} open dispatches
                            </p>
                            {form.ratingAvg != null ? (
                              <span className="font-label-price text-caption font-bold">
                                {Number(form.ratingAvg).toFixed(1)} / 5.0
                                {form.ratingCount > 0 ? ` (${form.ratingCount} ratings)` : ''}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="p-6 bg-surface-container-low space-y-4">
                      {form.openPoCount > 0 ? (
                        <div className="p-3 rounded-lg bg-surface-container flex items-start gap-2.5">
                          <span className="material-symbols-outlined text-[18px] text-error shrink-0">lock</span>
                          <p className="font-body-sm text-body-sm text-on-surface-variant text-[12px]">
                            Cannot archive this vendor while {form.openPoCount} open PO
                            {form.openPoCount === 1 ? '' : 's'} remain. Complete or void orders first.
                          </p>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-end gap-space-sm">
                        <button
                          type="button"
                          className="px-space-md py-2 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container font-body-sm text-body-sm"
                          onClick={p.onClose}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!form.canSave || form.submit.saving}
                          onClick={() => void form.save()}
                          className="px-space-lg py-2 rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold disabled:opacity-50"
                        >
                          {form.submit.saving ? 'Saving…' : 'Save vendor'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </GapLoadState>
    </GapModalShell>
  );
}
