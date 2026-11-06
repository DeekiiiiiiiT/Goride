/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn7KitTemplateForm } from './hooks/useIn7KitTemplateForm';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import { GapSubmitError } from '../gap/GapLoadState';
export function In7KitTemplateEditor() {
  const form = useIn7KitTemplateForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <GapSubmitError message={form.submit.error} />
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="w-full bg-surface-container-lowest px-margin-desktop py-space-md shadow-sm">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-space-md">

      <div className="flex flex-wrap items-center justify-between gap-space-md">
      <div>
      <div className="flex items-center gap-space-sm">
      <span className="font-label-code text-caption uppercase tracking-wider text-secondary">Asset Governance // KGN-01</span>
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-on-surface"></span>
      <span className="font-label-code text-caption text-secondary">Standard Spec v3.0</span>
      </div>
      <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">Inventory & Asset Management</h1>
      <p className="font-body-sm text-body-sm text-on-surface-variant">What you have, where it is, and what every car is missing.</p>
      </div>
      <div className="flex items-center gap-space-md">
      <div className="flex items-center gap-space-xs bg-surface-container px-space-md py-1.5 rounded-lg">
      <span className="material-symbols-outlined text-[16px] text-secondary">verified_user</span>
      <span className="font-label-code text-body-sm font-semibold text-on-surface">{form.editorAuthorLabel}</span>
      <span className="font-caption text-caption text-secondary uppercase tracking-tight">(platform_owner)</span>
      </div>
      <button type="button" className="bg-primary text-on-primary font-body-sm px-space-md py-1.5 rounded-lg flex items-center gap-space-xs shadow-sm hover:opacity-90 transition-opacity" onClick={() => form.newTemplate()}>
      <span className="material-symbols-outlined text-[16px]">add</span>
      <span>New kit template</span>
      </button>
      </div>
      </div>

      <div className="flex items-center gap-space-xs overflow-x-auto py-1">
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors" onClick={() => form.goTab('overview')}>Overview</button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors" onClick={() => form.goTab('stock')}>Stock</button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm font-semibold text-on-primary bg-primary shadow-sm flex items-center gap-space-xs" onClick={() => form.goTab('vehicle-kits')}>
      <span className="material-symbols-outlined text-[16px]">inventory_2</span>
      <span>Vehicle kits</span>
      </button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors" onClick={() => form.goTab('assets')}>Assets</button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors" onClick={() => form.goTab('movements')}>Movements</button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors flex items-center gap-space-xs" onClick={() => form.goTab('alerts')}>
      <span>Alerts</span>
      <span className="bg-error text-on-error font-label-code text-[10px] font-bold px-1.5 py-0.2 rounded-full">5</span>
      </button>
      </div>

      <div className="flex items-center gap-space-sm pt-space-xs">
      <div className="inline-flex p-1 bg-surface-container rounded-lg">
      <button type="button" className="px-space-md py-1 rounded font-body-sm text-secondary hover:text-on-surface transition-colors" onClick={() => form.goTab('vehicle-kits')}>Cars</button>
      <button type="button" className="px-space-md py-1 rounded bg-surface-container-lowest font-body-sm font-semibold text-on-surface shadow-sm" onClick={() => form.goTab('vehicle-kits')}>Kit templates</button>
      </div>
      <span className="font-caption text-caption text-secondary">Editing Master Specifications</span>
      </div>
      </div>
      </div>

      <div className="w-full px-margin-desktop py-space-xl">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-space-xl">

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-wrap items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md">
      <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[26px]">cases</span>
      </div>
      <div>
      <div className="flex items-center gap-space-sm">
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Rideshare car kit</h2>
      <span className="font-label-code text-[11px] bg-surface-container px-2 py-0.5 rounded font-bold text-on-surface">Editing v3</span>
      <span className="font-label-code text-[11px] bg-secondary-container text-on-secondary-fixed font-semibold px-2 py-0.5 rounded">Active Standard</span>
      </div>
      <p className="font-label-code text-caption text-secondary mt-0.5">
                    Rideshare car kit · 10 items + 1 optional · used by 2 cars · version 3 (drafting changes)
                  </p>
      </div>
      </div>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm px-space-md py-2 rounded-lg flex items-center gap-space-xs transition-colors" onClick={() => form.compare()}>
      <span className="material-symbols-outlined text-[16px]">history</span>
      <span>Compare with v{form.versionLabel}</span>
      </button>
      <button type="button" className="bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm px-space-md py-2 rounded-lg flex items-center gap-space-xs transition-colors" onClick={() => form.exportSpec()}>
      <span className="material-symbols-outlined text-[16px]">file_download</span>
      <span>Export Spec (PDF)</span>
      </button>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">

      <div className="lg:col-span-8 flex flex-col gap-space-xl">

      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Template Parameters</h3>
      <span className="font-caption text-caption text-secondary uppercase font-semibold">UUID: TPL-RSH-003</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">

      <div className="flex flex-col gap-1.5">
      <label className="font-caption text-caption uppercase text-secondary font-bold tracking-wider" htmlFor="tpl-name">Template Name</label>
      <div className="relative">
      <input className="w-full bg-surface-container-low text-on-surface font-body-md px-space-md py-2 rounded-lg focus:outline-none focus:bg-surface-container-lowest" data-stitch-data-stitch-id="tpl-name" type="text" readOnly value={form.strField(form.selectedTemplate ?? {}, 'name', '')}/>
      <span className="material-symbols-outlined absolute right-3 top-2.5 text-[16px] text-secondary">edit</span>
      </div>
      </div>

      <div className="flex flex-col gap-1.5">
      <label className="font-caption text-caption uppercase text-secondary font-bold tracking-wider" htmlFor="body-type">Target Body Type</label>
      <div className="relative">
      <select className="w-full appearance-none bg-surface-container-low text-on-surface font-body-md px-space-md py-2 rounded-lg focus:outline-none focus:bg-surface-container-lowest cursor-pointer" data-stitch-data-stitch-id="body-type" value={form.strField(form.selectedTemplate ?? {}, 'body_type', 'any')} onChange={(e) => form.selectTemplate(form.selectedTemplateId)}>
      <option>Any body type</option>
      <option>Hatchback (5-Door)</option>
      <option>Sedan (Compact / Midsize)</option>
      <option>Minivan / Small MPV</option>
      <option>Utility Van</option>
      </select>
      <span className="material-symbols-outlined absolute right-3 top-2.5 text-[16px] text-secondary pointer-events-none">expand_more</span>
      </div>
      </div>

      <div className="md:col-span-2 flex flex-col gap-1.5">
      <label className="font-caption text-caption uppercase text-secondary font-bold tracking-wider">Service Allocation Type</label>
      <div className="flex items-center gap-space-sm flex-wrap">
      <button type="button" className="bg-primary text-on-primary font-body-sm font-semibold px-space-lg py-2 rounded-lg shadow-sm flex items-center gap-space-xs" onClick={() => form.selectTemplateByService('rideshare')}>
      <span className="material-symbols-outlined text-[16px]">local_taxi</span>
      <span>Rideshare</span>
      </button>
      <button type="button" className="bg-surface-container text-on-surface font-body-sm px-space-lg py-2 rounded-lg hover:bg-surface-container-high transition-colors flex items-center gap-space-xs" onClick={() => form.selectTemplateByService('delivery')}>
      <span className="material-symbols-outlined text-[16px]">local_shipping</span>
      <span>Delivery</span>
      </button>
      <button type="button" className="bg-surface-container text-on-surface font-body-sm px-space-lg py-2 rounded-lg hover:bg-surface-container-high transition-colors flex items-center gap-space-xs" onClick={() => form.selectTemplateByService('executive')}>
      <span className="material-symbols-outlined text-[16px]">shield_person</span>
      <span>Executive</span>
      </button>
      <span className="font-caption text-caption text-secondary ml-space-sm">Applied to all on-demand passenger fleet contracts</span>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="p-space-lg flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-lowest">
      <div>
      <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Equipment Lines</h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Mandatory and auxiliary hardware provisioned to driver handoff.</p>
      </div>
      <div className="flex items-center gap-space-sm">
      <span className="font-label-code text-caption bg-surface-container px-2.5 py-1 rounded text-on-surface">{form.linesCount} Lines Configured</span>
      <span className="font-label-code text-caption bg-surface-container-high px-2.5 py-1 rounded text-on-surface">{form.live.totalStockValue} Total Landed Val</span>
      </div>
      </div>

      <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container-low text-secondary font-caption uppercase tracking-wider text-[11px]">
      <th className="py-2.5 px-3 w-8 text-center"></th>
      <th className="py-2.5 px-4 font-semibold">Item & SKU</th>
      <th className="py-2.5 px-3 font-semibold text-center w-20">Qty</th>
      <th className="py-2.5 px-4 font-semibold w-32">Designation</th>
      <th className="py-2.5 px-4 font-semibold">Location In Vehicle</th>
      <th className="py-2.5 px-3 text-center w-12 font-semibold">Action</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container">
      {form.lineEditorRows.length === 0 ? (
      <tr><td colSpan={6} className="py-space-xl text-center text-on-surface-variant font-body-sm">No equipment lines on this template yet.</td></tr>
      ) : (
      form.lineEditorRows.map((line) => (
      <tr key={line.key} className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3 px-3 text-center cursor-grab text-secondary hover:text-on-surface" onClick={() => form.moveLine(line.key, 'up')}>
      <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[15px]">inventory_2</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">{line.name}</div>
      <div className="font-label-code text-caption text-secondary">{line.sku}</div>
      </div>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <input
        className="w-12 text-center bg-surface-container-low rounded font-label-code text-body-sm font-semibold text-on-surface"
        type="text"
        value={line.qtyLabel}
        onChange={(e) => form.updateLineQty(line.key, e.target.value)}
      />
      </td>
      <td className="py-3 px-4">
      <button
        type="button"
        className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-bold ${line.required ? 'bg-primary text-on-primary' : 'bg-surface-container text-secondary font-medium'}`}
        onClick={() => form.updateLineRequired(line.key, !line.required)}
      >
                              {line.required ? 'Required' : 'Optional'}
                            </button>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-1.5 text-on-surface">
      <span className="material-symbols-outlined text-[15px] text-secondary">pin_drop</span>
      <input
        className="font-body-sm bg-transparent border-b border-outline-variant/40 focus:border-primary outline-none min-w-[5rem]"
        type="text"
        value={line.installPosition}
        placeholder="Where it goes"
        onChange={(e) => form.updateLineInstallPosition(line.key, e.target.value)}
      />
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <button type="button" className="text-secondary hover:text-error transition-colors p-1 rounded" onClick={() => form.deleteLine(line.key)}>
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </td>
      </tr>
      ))
      )}</tbody>
      </table>
      </div>

      <div className="p-space-md bg-surface-container-low/30 flex items-center justify-between">
      <button type="button" className="bg-surface-container-lowest text-on-surface hover:bg-surface-container font-body-sm font-medium px-space-md py-2 rounded-lg shadow-sm flex items-center gap-space-xs transition-colors" onClick={() => form.addLine()}>
      <span className="material-symbols-outlined text-[18px]">add_circle</span>
      <span>Add equipment line</span>
      </button>
      <span className="font-caption text-caption text-secondary">Drag handle on left to reorder checklist sequence</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <div>
      <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Linked records</h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Auto-bind operational credentials and digital hub peripherals upon vehicle kit allocation.</p>
      </div>
      <span className="font-label-code text-caption bg-surface-container px-2.5 py-1 rounded text-on-surface">{form.linkedIntegrationCount} Active Integrations</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md pt-space-xs">

      <button type="button" className="bg-surface-container-low p-space-md rounded-lg flex items-center justify-between text-left w-full" onClick={() => form.toggleLinkedTollTag()}>
      <div className="flex items-center gap-space-md">
      <div className="w-9 h-9 rounded-lg bg-surface-container-lowest flex items-center justify-center text-on-surface shadow-sm">
      <span className="material-symbols-outlined text-[20px]">nfc</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Toll tag</div>
      <div className="font-caption text-caption text-secondary">from Toll tags database</div>
      </div>
      </div>

      <div className="relative inline-flex items-center cursor-pointer shrink-0" aria-hidden>
      <div className={`w-11 h-6 rounded-full transition-colors ${form.linkedTollTag ? 'bg-primary' : 'bg-surface-container-highest'}`}></div>
      <div className={`absolute top-1 w-4 h-4 bg-surface-container-lowest rounded-full transition-transform ${form.linkedTollTag ? 'left-6' : 'left-1'}`}></div>
      </div>
      </button>

      <button type="button" className="bg-surface-container-low p-space-md rounded-lg flex items-center justify-between text-left w-full" onClick={() => form.toggleLinkedFuelCard()}>
      <div className="flex items-center gap-space-md">
      <div className="w-9 h-9 rounded-lg bg-surface-container-lowest flex items-center justify-center text-on-surface shadow-sm">
      <span className="material-symbols-outlined text-[20px]">credit_card</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Fuel card</div>
      <div className="font-caption text-caption text-secondary">from Fuel cards ledger</div>
      </div>
      </div>

      <div className="relative inline-flex items-center cursor-pointer shrink-0" aria-hidden>
      <div className={`w-11 h-6 rounded-full transition-colors ${form.linkedFuelCard ? 'bg-primary' : 'bg-surface-container-highest'}`}></div>
      <div className={`absolute top-1 w-4 h-4 bg-surface-container-lowest rounded-full transition-transform ${form.linkedFuelCard ? 'left-6' : 'left-1'}`}></div>
      </div>
      </button>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-wrap items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-sm text-secondary">
      <span className="material-symbols-outlined text-[18px]">info</span>
      <span className="font-caption text-caption">Saving creates an immutable revision hash on Kingston Cluster #01</span>
      </div>
      <div className="flex items-center gap-space-md">
      <button type="button" className="text-secondary hover:text-on-surface font-body-sm px-space-md py-2 transition-colors" onClick={() => form.close()}>
                      Cancel
                    </button>
      <button type="button" className="bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm font-semibold px-space-lg py-2 rounded-lg transition-colors" onClick={() => form.saveDraft()}>
                      Save as draft
                    </button>
      <button type="button" className="bg-primary text-on-primary font-body-sm font-semibold px-space-xl py-2 rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center gap-space-xs disabled:opacity-60" disabled={!form.canPublish || form.submit.saving} title={form.publishDisabledReason || 'Save as new version'} onClick={() => void form.requestPublishModal()}>
      <span className="material-symbols-outlined text-[16px]">save</span>
      <span>Save as new version</span>
      </button>
      </div>
      </div>
      </div>

      <div className="lg:col-span-4 flex flex-col gap-space-xl">

      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Version history</h3>
      <span className="font-label-code text-caption bg-surface-container px-2 py-0.5 rounded text-secondary">3 Releases</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Revision logs are cryptographically tracked against platform auditor IDs.
                  </p>

      <div className="relative pl-6 space-y-space-lg">

      <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-surface-container"></div>

      {form.versionHistoryRows.length === 0 ? (
      <p className="font-body-sm text-body-sm text-on-surface-variant">No revision history for this template yet.</p>
      ) : (
      form.versionHistoryRows.map((ver, index) => (
      <div key={`${ver.version}-${index}`} className="relative flex items-start gap-space-sm">
      <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full ${index === 0 ? 'bg-primary' : index === 1 ? 'bg-secondary' : 'bg-surface-dim'} ring-4 ring-surface-container-lowest`}></div>
      <div className="flex flex-col">
      <div className="flex items-center gap-space-xs">
      <span className="font-label-code text-body-sm font-bold text-on-surface">v{ver.version}</span>
      <span className="font-caption text-caption text-secondary">· {ver.dateLabel}</span>
      </div>
      <div className="font-body-sm font-medium text-on-surface">{ver.changeSummary}</div>
      <div className="font-caption text-caption text-secondary">Author: {ver.authorLabel}</div>
      <span className="font-label-code text-[11px] text-on-primary-fixed bg-surface-container px-2 py-0.5 rounded self-start mt-1">{ver.syncLabel}</span>
      </div>
      </div>
      ))
      )}
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Active Cars</h3>
      <span className="font-label-code text-caption font-bold text-on-surface bg-surface-container px-2 py-0.5 rounded">2 Active</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Vehicles bound to this template specification currently operating in Kingston:
                  </p>
      <div className="space-y-space-sm pt-space-xs">

      <div className="bg-surface-container-low p-space-md rounded-lg flex items-center justify-between">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-[20px] text-secondary">directions_car</span>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">{live.primaryPlate}</div>
      <div className="font-label-plate text-caption text-secondary">{live.primaryPlate}</div>
      </div>
      </div>
      <div className="text-right">
      <span className="font-label-code text-[11px] bg-surface-container text-on-surface px-2 py-0.5 rounded font-medium">on v2</span>
      <div className="font-caption text-[11px] text-error flex items-center justify-end gap-0.5 mt-0.5">
      <span className="material-symbols-outlined text-[13px]">warning</span> Missing Triangle
                        </div>
      </div>
      </div>

      <div className="bg-surface-container-low p-space-md rounded-lg flex items-center justify-between">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-[20px] text-secondary">directions_car</span>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">{live.secondaryPlate}</div>
      <div className="font-label-plate text-caption text-secondary">{live.secondaryPlate}</div>
      </div>
      </div>
      <div className="text-right">
      <span className="font-label-code text-[11px] bg-surface-container text-on-surface px-2 py-0.5 rounded font-medium">on v2</span>
      <div className="font-caption text-[11px] text-secondary mt-0.5">Compliance OK</div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container p-space-md rounded-lg flex items-start gap-space-sm mt-space-sm">
      <span className="material-symbols-outlined text-[18px] text-on-surface shrink-0 mt-0.5">sync_problem</span>
      <p className="font-caption text-caption text-on-surface leading-relaxed">
                      Deploying version 3 will mark both vehicles as <strong>Pending Verification</strong> until the physical equipment inspection is acknowledged at {live.hubShort}.
                    </p>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <h4 className="font-body-sm font-bold text-on-surface uppercase tracking-wider">Fleet Readiness Score</h4>
      <span className="font-label-code text-body-sm font-bold text-on-surface">91%</span>
      </div>

      <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
      <div className="bg-primary h-full rounded-full" style={{ width: "91%" }}></div>
      </div>
      <div className="grid grid-cols-2 gap-space-sm pt-space-xs text-center font-label-code text-caption text-secondary">
      <div className="bg-surface-container-low py-1.5 rounded">Required: 8/8 Fulfilled</div>
      <div className="bg-surface-container-low py-1.5 rounded">Optional: 1/1 Pending</div>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div>

      {form.showMoveModal ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/40 backdrop-blur-[2px]" data-stitch-data-stitch-id="migration-modal">
      <div className="bg-surface-container-lowest max-w-md w-full rounded-xl p-space-xl shadow-2xl flex flex-col gap-space-lg transform transition-all">
      <div className="flex items-start gap-space-md">
      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0 text-on-surface">
      <span className="material-symbols-outlined text-[24px]">published_with_changes</span>
      </div>
      <div>
      <span className="font-label-code text-[11px] uppercase tracking-wider text-secondary font-bold">Migration Confirmation</span>
      <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mt-0.5">{form.applyVehicleCount} cars use this kit. Move them to version {form.versionLabel}?</h3>
      </div>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Publishing revision <strong>v3</strong> will flag <strong>{live.primaryPlate}</strong> and <strong>{live.secondaryPlate}</strong> with updated equipment check requirements. Hub dispatchers will receive an inspection notice.
            </p>
      <div className="bg-surface-container-low p-space-md rounded-lg space-y-1">
      <div className="flex justify-between font-label-code text-caption text-on-surface">
      <span>Target Spec:</span>
      <span className="font-bold">Rideshare car kit (v3)</span>
      </div>
      <div className="flex justify-between font-label-code text-caption text-secondary">
      <span>Automated Work Orders:</span>
      <span>Generate 2 kit upgrade tickets</span>
      </div>
      </div>
      <div className="flex items-center justify-end gap-space-md pt-space-xs flex-wrap">
      <button type="button" className="bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm font-semibold px-space-lg py-2 rounded-lg transition-colors" onClick={() => form.cancelMoveModal()}>
                Not now
              </button>
      <button type="button" className="bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm font-semibold px-space-lg py-2 rounded-lg transition-colors" onClick={() => void form.confirmPublish(false)}>
                Publish without moving
              </button>
      <button type="button" className="bg-primary text-on-primary font-body-sm font-semibold px-space-xl py-2 rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center gap-space-xs disabled:opacity-60" disabled={!form.canPublish || form.submit.saving} onClick={() => void form.confirmPublish(true)}>
      <span className="material-symbols-outlined text-[16px]">check_circle</span>
      <span>Move {form.applyVehicleCount} cars</span>
      </button>
      </div>
      </div>
      </div>
      ) : null}

      {form.pickerOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/40 backdrop-blur-[2px]">
      <div className="bg-surface-container-lowest max-w-lg w-full rounded-xl p-space-lg shadow-2xl flex flex-col gap-space-md max-h-[80vh]">
      <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Add equipment line</h3>
      <div className="overflow-y-auto flex flex-col gap-space-xs">
      {form.catalogItems.map((item) => {
        const id = form.strField(item, 'id', '');
        return (
      <button key={id} type="button" className="text-left px-space-md py-2 rounded-lg hover:bg-surface-container flex flex-col" onClick={() => form.pickCatalogItem(id)}>
      <span className="font-body-sm font-semibold text-on-surface">{form.strField(item, 'name', '—')}</span>
      <span className="font-label-code text-caption text-secondary">{form.strField(item, 'sku', '—')}</span>
      </button>
        );
      })}
      </div>
      <button type="button" className="self-end font-body-sm font-semibold text-secondary" onClick={() => form.closeLinePicker()}>Cancel</button>
      </div>
      </div>
      ) : null}

      {form.newKitOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/40 backdrop-blur-[2px]">
      <div className="bg-surface-container-lowest max-w-md w-full rounded-xl p-space-xl shadow-2xl flex flex-col gap-space-md">
      <h3 className="font-headline-sm font-bold text-on-surface">New kit template</h3>
      <label className="font-caption text-caption text-secondary uppercase font-bold" htmlFor="new-kit-name">Name</label>
      <input id="new-kit-name" className="w-full bg-surface-container-low px-space-md py-2 rounded-lg text-on-surface" value={form.newKitName} onChange={(e) => form.setNewKitName(e.target.value)} />
      <label className="font-caption text-caption text-secondary uppercase font-bold" htmlFor="new-kit-class">Classification</label>
      <select id="new-kit-class" className="w-full bg-surface-container-low px-space-md py-2 rounded-lg text-on-surface" value={form.newKitClassification} onChange={(e) => form.setNewKitClassification(e.target.value as 'rideshare' | 'delivery' | 'executive')}>
      <option value="rideshare">Rideshare</option>
      <option value="delivery">Delivery</option>
      <option value="executive">Executive</option>
      </select>
      <div className="flex justify-end gap-space-md">
      <button type="button" className="px-space-lg py-2 rounded-lg bg-surface-container" onClick={() => form.setNewKitOpen(false)}>Cancel</button>
      <button type="button" className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-semibold" onClick={() => void form.createNewKit()}>Create</button>
      </div>
      </div>
      </div>
      ) : null}
      </div></div>
    </div>
  );
}
