// Stitch AP1–AP9 orchestrator
import "../partsDatabase.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ImportByAreaFlow } from "../import/ImportByAreaFlow";
import { AddPartsHome } from "./AddPartsHome";
import {
  fetchSelfServePartTypes,
  lookupSelfServePart,
  previewSelfServePart,
  saveSelfServePart,
  submitPartTypeRequest,
  undoSelfServePart,
} from "./addPartsApi";
import {
  AddPartsFitModeSegmented,
  AddPartsWizardFooter,
  AddPartsWizardShell,
} from "./AddPartsWizardChrome";
import { step1DetailsCanAdvance } from "./addPartsShared";
import type { SelfServePreview } from "./addPartsApi";
import { emptyDraft, type AddPartsDraft } from "./addPartsTypes";
import { PlainWordsDrawer } from "./PlainWordsDrawer";
import { PartTypesSettings } from "./part-types/PartTypesSettings";
import { Step1Details } from "./steps/Step1Details";
import { Step1TypePicker } from "./steps/Step1TypePicker";
import { Step2ByEngine } from "./steps/Step2ByEngine";
import { Step2BySpec } from "./steps/Step2BySpec";
import { Step2SpecificCars } from "./steps/Step2SpecificCars";
import { Step3ReplacesOe } from "./steps/Step3ReplacesOe";
import { Step4Review } from "./steps/Step4Review";
import { StepSaved } from "./steps/StepSaved";

type Screen = "home" | "wizard" | "saved";

export function AddPartsTab({ owner }: { owner: boolean }) {
  const qc = useQueryClient();
  const [screen, setScreen] = useState<Screen>("home");
  const [bulk, setBulk] = useState(false);
  const [plainWords, setPlainWords] = useState(false);
  const [partTypesOpen, setPartTypesOpen] = useState(false);
  const [draft, setDraft] = useState<AddPartsDraft>(() => emptyDraft());
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [typeSearch, setTypeSearch] = useState("");
  const [lookup, setLookup] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<SelfServePreview | null>(null);
  const [saveResult, setSaveResult] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const typesQuery = useQuery({ queryKey: ["self-serve-part-types"], queryFn: fetchSelfServePartTypes });

  const filteredTypes = useMemo(() => {
    const q = typeSearch.trim().toLowerCase();
    const list = typesQuery.data ?? [];
    if (!q) return list;
    return list.filter((t) =>
      t.name.toLowerCase().includes(q)
      || (t.opCode ?? "").toLowerCase().includes(q)
      || (t.tradeTerm ?? "").toLowerCase().includes(q),
    );
  }, [typeSearch, typesQuery.data]);

  function resetWizard() {
    setDraft(emptyDraft());
    setWizardStep(1);
    setLookup(null);
    setPreview(null);
    setSaveResult(null);
    setScreen("home");
  }

  useEffect(() => {
    if (screen === "home") {
      setDraft(emptyDraft());
      setWizardStep(1);
    }
  }, [screen]);

  useEffect(() => {
    if (wizardStep !== 1 || !draft.brand.trim() || !draft.partNumber.trim()) {
      setLookup(null);
      return;
    }
    const t = window.setTimeout(() => {
      void lookupSelfServePart(draft.brand, draft.partNumber)
        .then(setLookup)
        .catch(() => setLookup(null));
    }, 400);
    return () => window.clearTimeout(t);
  }, [draft.brand, draft.partNumber, wizardStep]);

  useEffect(() => {
    if (wizardStep < 2) return;
    void previewSelfServePart({
      fitMode: draft.fitMode,
      brand: draft.brand,
      partNumber: draft.partNumber,
      partTypeName: draft.partType?.name,
      tradeTerm: draft.partType?.tradeTerm ?? undefined,
      sourceType: draft.sourceType,
      position: draft.position || draft.listings[0]?.position,
      positionScheme: draft.partType?.positionScheme,
      engineFamilyId: draft.engineFamilyId || undefined,
      engineCode: draft.engineCode || undefined,
      specKey: draft.specKey || draft.partType?.specFields?.[0]?.specKey,
      specValue: draft.specValue || Object.values(draft.specValues)[0],
      vehicleIds: draft.listings.map((l) => l.vehicleId),
      listings: draft.fitMode === "specific" ? draft.listings : undefined,
      excludedVehicleIds: draft.excludedVehicleIds,
      factoryNumbers: draft.factoryNumbers,
    }).then(setPreview).catch(() => setPreview(null));
  }, [draft, wizardStep]);

  function confirmCancel() {
    if (window.confirm("Cancel adding this part? Nothing will be saved.")) resetWizard();
  }

  const stepLabel = `ADD PARTS · STEP ${wizardStep}`;

  async function onSave() {
    setSaving(true);
    try {
      const result = await saveSelfServePart(draft);
      setSaveResult(result);
      setScreen("saved");
      void qc.invalidateQueries({ queryKey: ["self-serve-recent"] });
      void qc.invalidateQueries({ queryKey: ["parts-overview"] });
      toast.success("Part saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (bulk) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" className="self-start text-primary font-body-sm hover:underline" onClick={() => setBulk(false)}>
          ← Back to Add parts
        </button>
        <ImportByAreaFlow />
      </div>
    );
  }

  if (screen === "home") {
    return (
      <>
        <AddPartsHome
          owner={owner}
          onStart={() => { setScreen("wizard"); setWizardStep(1); }}
          onBulk={() => setBulk(true)}
          onPlainWords={() => setPlainWords(true)}
          onPartTypes={() => setPartTypesOpen(true)}
        />
        <PlainWordsDrawer open={plainWords} onClose={() => setPlainWords(false)} onViewTaxonomy={owner ? () => { setPlainWords(false); setPartTypesOpen(true); } : undefined} />
        {partTypesOpen ? <PartTypesSettings owner={owner} onClose={() => setPartTypesOpen(false)} /> : null}
      </>
    );
  }

  if (screen === "saved" && saveResult) {
    return (
      <StepSaved
        saveResult={saveResult}
        onAddAnother={() => { resetWizard(); setScreen("wizard"); setWizardStep(1); }}
        onHome={resetWizard}
        onFindParts={() => { window.location.search = "?page=parts-catalog&tab=find-parts"; }}
        onUndo={() => {
          void undoSelfServePart(String(saveResult.batchId))
            .then(() => { toast.success("Undone"); resetWizard(); })
            .catch((e) => toast.error(e instanceof Error ? e.message : "Undo failed"));
        }}
      />
    );
  }

  return (
    <div className="parts-database-stitch w-full px-margin py-space-lg">
      <button type="button" className="self-start text-primary font-body-sm hover:underline mb-space-md" onClick={resetWizard}>
        ← Add parts
      </button>

      <AddPartsWizardShell
        wizardStep={wizardStep}
        stepLabel={stepLabel}
        draftBrand={draft.brand}
        draftNumber={draft.partNumber}
        partTypeName={draft.partType?.name}
        sourceType={draft.sourceType}
        footer={
          wizardStep === 1 && !draft.partType ? (
            <AddPartsWizardFooter step={1} onCancel={confirmCancel} />
          ) : wizardStep === 1 && draft.partType ? (
            <AddPartsWizardFooter
              step={1}
              onBack={() => setDraft({ ...draft, partType: null })}
              onCancel={confirmCancel}
              onNext={() => setWizardStep(2)}
              nextLabel={draft.sourceType === "other" ? "Submit for checking" : "Next"}
              nextDisabled={!step1DetailsCanAdvance(draft, lookup)}
            />
          ) : wizardStep === 2 ? (
            <AddPartsWizardFooter
              step={2}
              onBack={() => setWizardStep(1)}
              onCancel={confirmCancel}
              onNext={() => setWizardStep(draft.fitMode === "spec" ? 4 : 3)}
            />
          ) : wizardStep === 3 ? (
            <AddPartsWizardFooter
              step={3}
              onBack={() => setWizardStep(2)}
              onCancel={confirmCancel}
              onNext={() => setWizardStep(4)}
            />
          ) : (
            <AddPartsWizardFooter
              step={4}
              onBack={() => setWizardStep(draft.fitMode === "spec" ? 2 : 3)}
              onCancel={confirmCancel}
              onNext={() => { void onSave(); }}
              nextLabel={saving ? "Saving…" : "Save part"}
              nextDisabled={saving}
            />
          )
        }
      >
        {wizardStep === 1 && !draft.partType ? (
          <Step1TypePicker
            types={filteredTypes}
            typeSearch={typeSearch}
            onSearch={setTypeSearch}
            onSelect={(t) => {
              setDraft({
                ...emptyDraft(),
                partType: t,
                fitMode: t.defaultFitMode,
                specKey: t.specFields[0]?.specKey ?? "",
              });
            }}
            onSubmitPartTypeRequest={async (payload) => {
              await submitPartTypeRequest(payload);
              toast.success("Request sent — owner will review in Part types.");
            }}
          />
        ) : null}

        {wizardStep === 1 && draft.partType ? (
          <Step1Details
            draft={draft}
            setDraft={setDraft}
            lookup={lookup}
            onChangeType={() => setDraft({ ...draft, partType: null })}
            onNext={() => setWizardStep(2)}
            onDismissDuplicate={() => setLookup(null)}
          />
        ) : null}

        {wizardStep === 2 && draft.partType ? (
          <div className="space-y-space-md">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
              <div>
                <h1 className="font-headline-xl text-on-surface font-semibold tracking-tight">How does it fit?</h1>
                <p className="font-body-sm text-on-surface-variant mt-0.5">
                  {draft.fitMode === "specific"
                    ? "Tick each car the page lists. Match the chassis code (like M900A) and years."
                    : draft.fitMode === "engine"
                      ? "Pick an engine code, then exclude any car that should not get this part."
                      : "Enter the size or spec from the catalogue page."}
                </p>
              </div>
              <AddPartsFitModeSegmented value={draft.fitMode} onChange={(fitMode) => setDraft({ ...draft, fitMode })} />
            </div>
            {draft.partType.editorHint ? (
              <p className="font-label-xs text-outline italic">{draft.partType.editorHint}</p>
            ) : null}
            {draft.fitMode === "specific" ? <Step2SpecificCars draft={draft} setDraft={setDraft} /> : null}
            {draft.fitMode === "engine" ? <Step2ByEngine draft={draft} setDraft={setDraft} /> : null}
            {draft.fitMode === "spec" ? <Step2BySpec draft={draft} setDraft={setDraft} /> : null}
            {preview && draft.fitMode !== "specific" ? (
              <p className="text-on-surface-variant font-body-sm">
                {preview.carCount} car version(s) · total reach {preview.totalReach}
              </p>
            ) : null}
            {draft.fitMode === "specific" && draft.listings.length > 0 ? (
              <p className="text-on-surface-variant font-body-sm">
                {draft.listings.length} car{draft.listings.length === 1 ? "" : "s"} selected
              </p>
            ) : null}
          </div>
        ) : null}

        {wizardStep === 3 ? (
          <Step3ReplacesOe draft={draft} setDraft={setDraft} onSkip={() => setWizardStep(4)} />
        ) : null}

        {wizardStep === 4 ? (
          <Step4Review draft={draft} preview={preview} onEditStep={(s) => setWizardStep(s)} />
        ) : null}
      </AddPartsWizardShell>

      <button type="button" className="text-primary text-body-sm mt-space-md hover:underline" onClick={() => setPlainWords(true)}>
        What do these words mean?
      </button>
      <PlainWordsDrawer open={plainWords} onClose={() => setPlainWords(false)} />
    </div>
  );
}
