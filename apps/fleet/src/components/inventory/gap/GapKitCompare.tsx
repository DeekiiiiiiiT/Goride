/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapKitCompare(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="KitCompare">
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="max-w-[1440px] w-full mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

        <div className="flex flex-col gap-space-sm">
        <div className="flex items-center gap-space-xs text-on-surface-variant">
        <a className="inline-flex items-center gap-1 font-body-sm text-body-sm hover:text-primary transition-colors" href="#">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        <span>Back to Vehicle Kits</span>
        </a>
        <span className="text-outline-variant">/</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">Rideshare car kit</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-space-lg">
        <div className="flex items-center gap-space-md">
        <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[24px]">compare_arrows</span>
        </div>
        <div>
        <div className="flex items-center gap-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Kit version compare: Rideshare car kit</h1>
        <span className="bg-surface-container-high text-on-surface font-caption text-caption px-space-sm py-0.5 rounded font-semibold uppercase tracking-wider">SKU-KIT-RIDE-01</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Analyze structural inventory variances, depot procurement needs, and fleet compliance deltas before applying changes.</p>
        </div>
        </div>
        <div className="flex items-center gap-space-sm">
        <span className="inline-flex items-center gap-1 font-label-code text-caption px-space-md py-1.5 rounded bg-surface-container text-on-surface font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    Rollout Scope: 2 Assigned Units
                  </span>
        <button type="button" className="bg-surface-container-lowest hover:bg-surface-container text-on-surface p-2 rounded transition-colors" title="Export Diff Manifest">
        <span className="material-symbols-outlined text-[18px]">download</span>
        </button>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-lg">

        <div className="flex flex-wrap items-center gap-space-md">

        <div className="bg-surface-container-low rounded-lg p-space-sm flex items-center gap-space-md min-w-[280px]">
        <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[18px]">history</span>
        </div>
        <div className="flex flex-col">
        <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Base Specification</span>
        <div className="flex items-center gap-space-xs">
        <span className="font-label-code text-label-code font-bold text-on-surface">Version 3</span>
        <span className="text-caption font-caption text-on-surface-variant">(Active · 1 Nov 2026)</span>
        </div>
        </div>
        </div>
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant font-label-code text-caption font-semibold">
                  vs
                </div>

        <div className="bg-surface-container-low rounded-lg p-space-sm flex items-center gap-space-md min-w-[320px]">
        <div className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center">
        <span className="material-symbols-outlined text-[18px]">new_releases</span>
        </div>
        <div className="flex flex-col">
        <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Target Specification</span>
        <div className="flex items-center gap-space-xs">
        <span className="font-label-code text-label-code font-bold text-primary">Version 4</span>
        <span className="inline-flex items-center font-caption text-caption px-1.5 py-0.2 bg-secondary-container text-on-secondary-fixed font-semibold rounded">Draft · Ready to publish</span>
        </div>
        </div>
        </div>
        </div>

        <div className="flex items-center bg-surface-container p-1 rounded-lg self-start lg:self-auto">
        <button type="button" className="filter-tab px-space-md py-1.5 rounded font-body-sm text-body-sm font-medium transition-all text-on-surface-variant hover:text-on-surface" id="filter-all" onclick="filterRows('all')">
                  All items (10)
                </button>
        <button type="button" className="filter-tab px-space-md py-1.5 rounded font-body-sm text-body-sm font-semibold transition-all bg-surface-container-lowest text-primary shadow-sm" id="filter-diff" onclick="filterRows('diff')">
                  Only changes (2)
                </button>
        </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-xl items-start">

        <div className="xl:col-span-8 flex flex-col gap-space-md">

        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="px-space-lg py-space-md bg-surface-container-low flex items-center justify-between">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-bold">Specification Matrix</span>
        <div className="flex items-center gap-space-md font-caption text-caption text-on-surface-variant">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-surface-dim"></span> No delta</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-secondary-fixed"></span> Quantity delta</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary-container"></span> Added line</span>
        </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
        <thead>
        <tr className="bg-surface-container-lowest text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <th className="py-space-md px-space-lg font-semibold">Kit Item & SKU</th>
        <th className="py-space-md px-space-md font-semibold text-center w-36">v3 (Active)</th>
        <th className="py-space-md px-space-md font-semibold text-center w-36">v4 (Draft)</th>
        <th className="py-space-md px-space-md font-semibold w-32">Change Status</th>
        <th className="py-space-md px-space-lg font-semibold">Impact Note</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm text-on-surface">

        <tr className="diff-row row-unchanged hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-md px-space-lg">
        <div className="flex flex-col">
        <span className="font-medium text-primary">Spare tyre 195/65 R15</span>
        <span className="font-label-code text-caption text-on-surface-variant">TYR-SPR-01</span>
        </div>
        </td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-on-surface-variant">1 each</td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-primary font-medium">1 each</td>
        <td className="py-space-md px-space-md">
        <span className="inline-flex items-center font-caption text-caption px-space-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">Unchanged</span>
        </td>
        <td className="py-space-md px-space-lg text-on-surface-variant">Required core baseline</td>
        </tr>

        <tr className="diff-row row-changed bg-secondary-fixed/20 hover:bg-secondary-fixed/30 transition-colors">
        <td className="py-space-md px-space-lg">
        <div className="flex items-start gap-space-xs">
        <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">change_circle</span>
        <div className="flex flex-col">
        <span className="font-semibold text-primary">Warning triangle reflector</span>
        <span className="font-label-code text-caption text-on-surface-variant">SFT-TRG-01</span>
        </div>
        </div>
        </td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-on-surface-variant">1 each</td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-primary font-bold">2 each</td>
        <td className="py-space-md px-space-md">
        <span className="inline-flex items-center font-caption text-caption px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-fixed font-bold tracking-tight">1 → 2</span>
        </td>
        <td className="py-space-md px-space-lg font-medium text-on-surface">Road safety compliance update (+1 per car)</td>
        </tr>

        <tr className="diff-row row-unchanged hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-md px-space-lg">
        <div className="flex flex-col">
        <span className="font-medium text-primary">First-aid kit Carib standard</span>
        <span className="font-label-code text-caption text-on-surface-variant">SAF-FAK-01</span>
        </div>
        </td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-on-surface-variant">1 each</td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-primary font-medium">1 each</td>
        <td className="py-space-md px-space-md">
        <span className="inline-flex items-center font-caption text-caption px-space-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">Unchanged</span>
        </td>
        <td className="py-space-md px-space-lg text-on-surface-variant">Required core baseline</td>
        </tr>

        <tr className="diff-row row-unchanged hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-md px-space-lg">
        <div className="flex flex-col">
        <span className="font-medium text-primary">Lug wrench 19mm</span>
        <span className="font-label-code text-caption text-on-surface-variant">ACC-LGW-02</span>
        </div>
        </td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-on-surface-variant">1 each</td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-primary font-medium">1 each</td>
        <td className="py-space-md px-space-md">
        <span className="inline-flex items-center font-caption text-caption px-space-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">Unchanged</span>
        </td>
        <td className="py-space-md px-space-lg text-on-surface-variant">Required tool line</td>
        </tr>

        <tr className="diff-row row-unchanged hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-md px-space-lg">
        <div className="flex flex-col">
        <span className="font-medium text-primary">Tyre pump heavy duty 12V</span>
        <span className="font-label-code text-caption text-on-surface-variant">ACC-TYP-01</span>
        </div>
        </td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-on-surface-variant">1 each</td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-primary font-medium">1 each</td>
        <td className="py-space-md px-space-md">
        <span className="inline-flex items-center font-caption text-caption px-space-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">Unchanged</span>
        </td>
        <td className="py-space-md px-space-lg text-on-surface-variant">Required emergency kit</td>
        </tr>

        <tr className="diff-row row-changed bg-primary-fixed/20 hover:bg-primary-fixed/30 transition-colors">
        <td className="py-space-md px-space-lg">
        <div className="flex items-start gap-space-xs">
        <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">add_circle</span>
        <div className="flex flex-col">
        <span className="font-semibold text-primary">Fire extinguisher 1kg Dry Powder</span>
        <span className="font-label-code text-caption text-on-surface-variant">SAF-FEX-01</span>
        </div>
        </div>
        </td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-outline">— <span className="text-caption font-caption">(None)</span></td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-primary font-bold">1 each <span className="font-caption text-caption font-normal text-on-surface-variant">(Optional)</span></td>
        <td className="py-space-md px-space-md">
        <span className="inline-flex items-center font-caption text-caption px-2 py-0.5 rounded-full bg-primary-container text-on-primary font-bold tracking-tight">+ Added</span>
        </td>
        <td className="py-space-md px-space-lg font-medium text-on-surface">Added as optional recommended safety line</td>
        </tr>

        <tr className="diff-row row-unchanged hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-md px-space-lg">
        <div className="flex flex-col">
        <span className="font-medium text-primary">Dash camera 1080p Telematics</span>
        <span className="font-label-code text-caption text-on-surface-variant">AST-0002</span>
        </div>
        </td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-on-surface-variant">1 each</td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-primary font-medium">1 each</td>
        <td className="py-space-md px-space-md">
        <span className="inline-flex items-center font-caption text-caption px-space-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">Unchanged</span>
        </td>
        <td className="py-space-md px-space-lg text-on-surface-variant">Serial-tracked asset</td>
        </tr>

        <tr className="diff-row row-unchanged hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-md px-space-lg">
        <div className="flex flex-col">
        <span className="font-medium text-primary">Phone holder mount</span>
        <span className="font-label-code text-caption text-on-surface-variant">ACC-PHM-01</span>
        </div>
        </td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-on-surface-variant">1 each</td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-primary font-medium">1 each</td>
        <td className="py-space-md px-space-md">
        <span className="inline-flex items-center font-caption text-caption px-space-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">Unchanged</span>
        </td>
        <td className="py-space-md px-space-lg text-on-surface-variant">In-cabin accessory</td>
        </tr>

        <tr className="diff-row row-unchanged hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-md px-space-lg">
        <div className="flex flex-col">
        <span className="font-medium text-primary">Toll tag (Jamaica Highway 2000)</span>
        <span className="font-caption text-caption text-on-surface-variant">JMD-HWY2K-LINK</span>
        </div>
        </td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-on-surface-variant">Linked</td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-primary font-medium">Linked</td>
        <td className="py-space-md px-space-md">
        <span className="inline-flex items-center font-caption text-caption px-space-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">Unchanged</span>
        </td>
        <td className="py-space-md px-space-lg text-on-surface-variant">Virtual link record</td>
        </tr>

        <tr className="diff-row row-unchanged hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-md px-space-lg">
        <div className="flex flex-col">
        <span className="font-medium text-primary">Fuel card (Petrojam fleet)</span>
        <span className="font-caption text-caption text-on-surface-variant">PETRO-CORP-SYS</span>
        </div>
        </td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-on-surface-variant">Linked</td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-primary font-medium">Linked</td>
        <td className="py-space-md px-space-md">
        <span className="inline-flex items-center font-caption text-caption px-space-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">Unchanged</span>
        </td>
        <td className="py-space-md px-space-lg text-on-surface-variant">Virtual link record</td>
        </tr>
        </tbody>
        </table>
        </div>
        <div className="px-space-lg py-space-sm bg-surface-container-lowest flex items-center justify-between text-on-surface-variant font-caption text-caption">
        <span>Displaying filtered kit inventory items</span>
        <span className="font-label-code">Hash: v3.89cf...v4.120a</span>
        </div>
        </div>

        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-start gap-space-md">
        <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary flex-shrink-0">
        <span className="material-symbols-outlined text-[18px]">inventory</span>
        </div>
        <div className="flex flex-col gap-1">
        <span className="font-body-sm text-body-sm font-semibold text-primary">Depot Stock Availability (Kingston Hub #01)</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                      SFT-TRG-01 (Warning triangle reflector) has <span className="font-label-code font-bold text-primary">28 in stock</span>. SAF-FEX-01 (Fire extinguisher 1kg) has <span className="font-label-code font-bold text-primary">6 in stock</span>. All necessary hardware is on-hand for immediate dispatch without backorder delay.
                    </p>
        </div>
        </div>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-space-lg">

        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-lg">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-[20px] text-primary">analytics</span>
        <h2 className="font-headline-sm text-headline-sm text-primary">Fleet Rollout Impact</h2>
        </div>
        <span className="font-caption text-caption px-space-sm py-0.5 rounded bg-surface-container font-medium text-on-surface">Compliance</span>
        </div>

        <div className="grid grid-cols-1 gap-space-sm">
        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col">
        <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Affected Vehicles</span>
        <div className="flex items-baseline justify-between mt-1">
        <span className="font-headline-sm text-headline-sm font-bold text-primary">2 active cars</span>
        <span className="font-label-code text-caption text-on-surface-variant">Roomy & Fit</span>
        </div>
        </div>
        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col">
        <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Additional Items Required</span>
        <div className="flex items-baseline justify-between mt-1">
        <span className="font-headline-sm text-headline-sm font-bold text-primary">5 units</span>
        <span className="font-caption text-caption text-on-surface-variant">2 Triangles + Optional</span>
        </div>
        </div>
        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col">
        <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Estimated Procurement Value</span>
        <div className="flex items-baseline justify-between mt-1">
        <span className="font-label-price text-headline-sm text-primary">J$ 34,700.00</span>
        <span className="font-caption text-caption text-on-surface-variant">Depot landed cost</span>
        </div>
        </div>
        </div>

        <div className="p-space-md rounded-lg bg-surface-container flex flex-col gap-space-sm">
        <div className="flex items-center justify-between font-caption text-caption">
        <span className="font-semibold text-primary">Average Fleet Kit Readiness</span>
        <span className="font-label-code text-on-surface-variant font-medium">85% → 75% Projected</span>
        </div>
        <div className="w-full h-3 bg-surface-container-highest rounded-full overflow-hidden flex">
        <div className="h-full bg-primary" style="width: 75%;"></div>
        <div className="h-full bg-secondary-fixed-dim" style="width: 10%;"></div>
        </div>
        <div className="flex justify-between items-center text-[10px] font-label-code text-on-surface-variant">
        <span>75% v4 Compliant</span>
        <span>10% Missing Triangle</span>
        <span>15% Missing Baseline</span>
        </div>
        </div>

        <div className="flex flex-col gap-space-sm">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-bold">Vehicle Manifest Specifics</span>

        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
        <span className="font-label-plate text-label-plate px-1.5 py-0.5 bg-surface-container-lowest text-primary rounded shadow-sm">5179KZ</span>
        <span className="font-body-sm text-body-sm text-on-surface font-medium">Toyota Roomy</span>
        </div>
        <span className="font-label-code text-caption font-bold text-on-error-container bg-error-container px-1.5 py-0.2 rounded">100% → 90%</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-snug">
                        Currently has Version 3 complete. Will need <strong className="text-primary">+1 Warning Triangle</strong> to satisfy Version 4 readiness.
                      </p>
        </div>

        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
        <span className="font-label-plate text-label-plate px-1.5 py-0.5 bg-surface-container-lowest text-primary rounded shadow-sm">1505LM</span>
        <span className="font-body-sm text-body-sm text-on-surface font-medium">Honda Fit</span>
        </div>
        <span className="font-label-code text-caption font-bold text-on-surface-variant bg-surface-container-highest px-1.5 py-0.2 rounded">70% → 60%</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-snug">
                        Currently missing 3 items from Version 3. Will need <strong className="text-primary">+1 Warning Triangle</strong> (cumulative 4 items required for compliance).
                      </p>
        </div>
        </div>

        <div className="bg-surface-container p-space-md rounded-lg flex items-start gap-space-sm text-on-surface">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant flex-shrink-0 mt-0.5">info</span>
        <div className="flex flex-col gap-0.5">
        <span className="font-caption text-caption font-bold uppercase tracking-wider text-on-surface">Operational Procedure</span>
        <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
                        Updating kit version does not automatically issue stock. Missing items will trigger alerts on the Vehicle Kits and Overview tabs.
                      </p>
        </div>
        </div>
        </div>
        </div>
        </div>

        <div className="sticky bottom-4 z-40 bg-surface-container-lowest rounded-xl shadow-xl p-space-md flex flex-wrap items-center justify-between gap-space-md mt-space-md">
        <a className="inline-flex items-center gap-space-xs text-on-surface-variant hover:text-primary font-body-sm text-body-sm font-medium transition-colors" href="#">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        <span>Back to kit editor</span>
        </a>
        <div className="flex flex-wrap items-center gap-space-sm">
        <button type="button" className="bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold px-space-lg py-2.5 rounded-lg transition-colors">
                  Keep editing draft
                </button>
        <button type="button" className="bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-body-sm text-body-sm font-semibold px-space-lg py-2.5 rounded-lg shadow-sm transition-colors">
                  Save as inactive v4
                </button>
        <button type="button" className="bg-primary hover:bg-primary/90 text-on-primary font-body-sm text-body-sm font-semibold px-space-lg py-2.5 rounded-lg flex items-center gap-space-xs transition-transform active:scale-95 shadow-md" onclick="document.getElementById('confirmation-modal').classList.remove('hidden')">
        <span className="material-symbols-outlined text-[18px]">publish</span>
        <span>Apply version 4 to 2 cars</span>
        </button>
        </div>
        </div>
        </div>

        <div className="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/40 backdrop-blur-sm" id="confirmation-modal">
        <div className="bg-surface-container-lowest rounded-xl shadow-xl max-w-lg w-full p-space-xl flex flex-col gap-space-lg">
        <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[20px]">warning</span>
        </div>
        <button type="button" className="text-on-surface-variant hover:text-primary p-1" onclick="document.getElementById('confirmation-modal').classList.add('hidden')">
        <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        </div>
        <div className="flex flex-col gap-space-xs">
        <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Apply Specification Version 4?</h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                  This will update the active specification for <span className="font-semibold text-primary">Rideshare car kit</span> across 2 vehicles. 
                  Both vehicles will transition to <span className="text-on-error font-semibold bg-error px-1 rounded">Partially Stocked</span> until the additional warning triangles are physically verified and scanned in Kingston Depot.
                </p>
        </div>
        <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-1 font-label-code text-caption">
        <div className="flex justify-between text-on-surface">
        <span>Target Vehicles:</span>
        <span className="font-bold">5179KZ, 1505LM</span>
        </div>
        <div className="flex justify-between text-on-surface">
        <span>Required Actions:</span>
        <span className="font-bold text-primary">Issue +2 Triangles</span>
        </div>
        </div>
        <div className="flex items-center justify-end gap-space-sm pt-space-xs">
        <button type="button" className="px-space-lg py-2 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:text-primary font-medium transition-colors" onclick="document.getElementById('confirmation-modal').classList.add('hidden')">
                  Cancel
                </button>
        <button type="button" className="bg-primary hover:bg-primary/90 text-on-primary px-space-lg py-2 rounded-lg font-body-sm text-body-sm font-semibold shadow transition-transform active:scale-95" onclick="document.getElementById('confirmation-modal').classList.add('hidden'); alert('Version 4 deployed to Kingston Hub fleet successfully.');">
                  Confirm Rollout
                </button>
        </div>
        </div>
        </div>


        </div></div>
        {compliance.safetyNotice ? (
          <div className="mt-space-md rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
            {compliance.safetyNotice}
          </div>
        ) : null}
      </div>
    </GapModalShell>
  );
}
