// Stitch AP11 — all exception frames for fidelity capture
import { toast } from "sonner";
import { AskPartTypePanel } from "./states/AskPartTypePanel";
import { emptyDraft } from "./addPartsTypes";
import { PartExistsPanel } from "./states/PartExistsPanel";
import { RequestCarPanel } from "./states/RequestCarPanel";
import { RequestCheckingSourcePanel } from "./states/RequestCheckingSourcePanel";
import { RequestEnginePanel } from "./states/RequestEnginePanel";
import { MaterialIcon } from "../import/MaterialIcon";
import { AddPartsPipelineFooter } from "./AddPartsPipelineFooter";

export function AddPartsStatesGallery() {
  return (
    <div className="max-w-[1560px] mx-auto flex flex-col gap-space-lg px-space-xl py-space-lg">
      <div className="flex flex-col gap-1">
        <nav className="flex flex-wrap items-center gap-2 font-mono-sm text-outline text-sm">
          <span>MASTER DATA</span>
          <MaterialIcon name="chevron_right" className="text-[14px]" />
          <span>PARTS DATABASE</span>
          <MaterialIcon name="chevron_right" className="text-[14px]" />
          <span className="text-primary font-medium">ADD PARTS PIPELINE</span>
          <MaterialIcon name="chevron_right" className="text-[14px]" />
          <span className="text-on-surface font-semibold">AP-11: EXCEPTIONS &amp; EDGE STATES</span>
        </nav>
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Add Parts — States &amp; Exceptions</h1>
        <p className="font-body-sm text-on-surface-variant">
          Strict catalog governance protocol: duplicate collisions, taxonomy omissions, unverified URLs, and schema delta requests.
        </p>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md flex items-center justify-between shadow-sm gap-space-md flex-wrap">
        <div className="flex items-center gap-space-md">
          <div className="w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
            <MaterialIcon name="verified_user" className="text-[20px]" />
          </div>
          <div>
            <span className="font-headline-md text-on-surface leading-tight block">Tier 1 Verification Gateway Active</span>
            <span className="font-body-sm text-on-surface-variant">Unresolved conflicts hold automated ingestion sync for Fleet clients.</span>
          </div>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-mono-sm">
          Matrix View (6)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-lg items-start">
        <PartExistsPanel
          showDetailsTable
          label="Example brand EXAMPLE-1 is already in the database (Front brake pads, 7 cars)."
          existingNumber="EXAMPLE-1"
          existingBrand="Example brand"
          provenanceLine="Added by catalog · 7 fits on file"
          fitmentLine="7 chassis mapped"
          onAddMore={() => toast.message("Gallery: add more cars to existing part")}
          onDifferent={() => toast.message("Gallery: treat as different part")}
        />
        <RequestCarPanel draft={emptyDraft()} galleryExpanded />
        <RequestEnginePanel draft={emptyDraft()} galleryExpanded />
        <RequestCheckingSourcePanel evidenceUrl="" onChange={() => {}} galleryMode="missing" />
        <RequestCheckingSourcePanel evidenceUrl="https://forum.example.com/thread" onChange={() => {}} galleryMode="needsChecking" />
        <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-space-lg shadow-sm">
          <h2 className="font-headline-md text-headline-md mb-space-md">Can&apos;t find the part type?</h2>
          <AskPartTypePanel onSubmit={async () => { toast.success("Gallery: part type request submitted"); }} />
        </div>
      </div>

      <div className="mt-space-md bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md pb-space-sm">
          <div className="flex items-center gap-2">
            <MaterialIcon name="account_tree" className="text-primary text-[20px]" />
            <span className="font-headline-md text-headline-md text-on-surface">Dominion Fitment Classification Tiers</span>
          </div>
          <div className="font-mono-sm text-mono-sm text-outline">
            AUTOMATED MATCHER PIPELINE v4.8.2 · RULESET ACTIVE
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-space-sm">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[rgba(1,83,220,0.08)] dark:bg-[rgba(1,83,220,0.18)]">
            <div className="flex flex-col">
              <span className="font-mono-sm text-mono-sm font-semibold text-[#0153dc] dark:text-[#7eb4ff]">Tier 1</span>
              <span className="font-body-sm text-body-sm text-on-surface font-medium">Made for car</span>
            </div>
            <span className="font-mono-sm text-mono-sm text-primary font-bold">100%</span>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[rgba(14,116,144,0.08)] dark:bg-[rgba(14,116,144,0.2)]">
            <div className="flex flex-col">
              <span className="font-mono-sm text-mono-sm font-semibold text-[#0e7490] dark:text-[#5eead4]">Tier 2</span>
              <span className="font-body-sm text-body-sm text-on-surface font-medium">Same car, diff badge</span>
            </div>
            <span className="font-mono-sm text-mono-sm text-[#0e7490] dark:text-[#5eead4] font-bold">OEM Direct</span>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[rgba(180,83,9,0.08)] dark:bg-[rgba(180,83,9,0.18)]">
            <div className="flex flex-col">
              <span className="font-mono-sm text-mono-sm font-semibold text-[#b45309] dark:text-amber-200">Tier 3</span>
              <span className="font-body-sm text-body-sm text-on-surface font-medium">Fits your engine</span>
            </div>
            <span className="font-mono-sm text-mono-sm text-[#b45309] dark:text-amber-200 font-bold">Powertrain</span>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[rgba(124,58,237,0.08)] dark:bg-[rgba(124,58,237,0.2)]">
            <div className="flex flex-col">
              <span className="font-mono-sm text-mono-sm font-semibold text-[#7c3aed] dark:text-[#c4b5fd]">Tier 4</span>
              <span className="font-body-sm text-body-sm text-on-surface font-medium">Cross-brand alt</span>
            </div>
            <span className="font-mono-sm text-mono-sm text-[#7c3aed] dark:text-[#c4b5fd] font-bold">Interchange</span>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[rgba(0,110,49,0.08)] dark:bg-[rgba(0,110,49,0.2)]">
            <div className="flex flex-col">
              <span className="font-mono-sm text-mono-sm font-semibold text-[#006e31] dark:text-emerald-200">Tier 5</span>
              <span className="font-body-sm text-body-sm text-on-surface font-medium">Dimension match</span>
            </div>
            <span className="font-mono-sm text-mono-sm text-[#006e31] dark:text-emerald-200 font-bold">Geometric</span>
          </div>
        </div>
      </div>

      <AddPartsPipelineFooter />
    </div>
  );
}
