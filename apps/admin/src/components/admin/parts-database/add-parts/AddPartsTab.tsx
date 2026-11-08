// Stitch AP1–AP9 orchestrator
import "../partsDatabase.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PartsButton } from "../PartsButton";
import { ImportByAreaFlow } from "../import/ImportByAreaFlow";
import { AddPartsHome } from "./AddPartsHome";
import { CatalogAddPartsFlow } from "./catalog/CatalogAddPartsFlow";
import { FluidPartFlow } from "./flows/FluidPartFlow";
import { ExtendPartFlow } from "./flows/ExtendPartFlow";
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
import {
  reviewReachCount,
  step1DetailsCanAdvance,
  step2SpecificCanAdvance,
  wizardFooterLabels,
  type Step1Phase,
} from "./addPartsShared";
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
import { AddPartsStatesGallery } from "./AddPartsStatesGallery";
import { PositionSpecCatalog } from "./PositionSpecCatalog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../ui/alert-dialog";

type Screen =
  | "home"
  | "catalog"
  | "catalogOne"
  | "fluid"
  | "extend"
  | "wizard"
  | "saved"
  | "statesGallery"
  | "positionCatalog"
  | "partTypes";

export function AddPartsTab({ owner }: { owner: boolean }) {
  const qc = useQueryClient();
  const [screen, setScreen] = useState<Screen>("home");
  const [bulk, setBulk] = useState(false);
  const [plainWords, setPlainWords] = useState(false);
  const [step1Phase, setStep1Phase] = useState<Step1Phase>("picker");
  const [pickerTypeId, setPickerTypeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddPartsDraft>(() => emptyDraft());
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [typeSearch, setTypeSearch] = useState("");
  const [lookup, setLookup] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<SelfServePreview | null>(null);
  const [saveResult, setSaveResult] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

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
    setStep1Phase("picker");
    setPickerTypeId(null);
    setLookup(null);
    setPreview(null);
    setSaveResult(null);
    setScreen("home");
  }

  useEffect(() => {
    if (screen === "home") {
      setDraft(emptyDraft());
      setWizardStep(1);
      setStep1Phase("picker");
      setPickerTypeId(null);
    }
  }, [screen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("addPartsStates") === "1") setScreen("statesGallery");
    if (params.get("addPartsPositionCatalog") === "1") setScreen("positionCatalog");
    const preVehicle = params.get("vehiclesPreselectVehicleId")?.trim();
    if (preVehicle) setScreen("catalog");
    const cap = params.get("addPartsCapture");
    if (!cap && !preVehicle) return;
    if (cap === "add_parts_home_hub") setScreen("home");
    else if (cap === "add_more_cars_to_a_part_already_on_file") setScreen("extend");
    else if (cap === "fluid_oil_or_size_part_and_which_cars_use_it") setScreen("fluid");
    else if (cap === "states_edge_cases") setScreen("statesGallery");
    else if (cap === "step_3_just_one_part") setScreen("catalogOne");
    else if (
      cap?.startsWith("step_")
      || cap === "phone_390px_parts_intake_mobile"
      || cap === "saved_confirmation_next_steps"
      || cap === "dark_mode_parts_table_review"
      || cap === "help_built_into_the_page"
    ) {
      setScreen(cap === "step_3_just_one_part" ? "catalogOne" : "catalog");
    }
  }, []);

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
    if (screen !== "wizard") return;
    if (!draft.partType) return;
    if (wizardStep === 1 && step1Phase !== "details") return;
    if (!draft.evidenceUrl.trim()) {
      setPreview(null);
      return;
    }
    void previewSelfServePart({
      fitMode: draft.fitMode,
      brand: draft.brand,
      partNumber: draft.partNumber,
      partTypeName: draft.partType?.name,
      tradeTerm: draft.partType?.tradeTerm ?? undefined,
      sourceType: draft.sourceType,
      catalogCarMaker: draft.catalogCarMaker,
      evidenceUrl: draft.evidenceUrl,
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
  }, [draft, wizardStep, step1Phase, screen]);

  const stepLabel = `ADD PARTS · STEP ${wizardStep}`;

  const footerLabels = wizardFooterLabels({
    wizardStep,
    step1Phase,
    fitMode: draft.fitMode,
    commitCount: reviewReachCount(draft, preview),
    saving,
    specificListings: draft.fitMode === "specific" ? draft.listings : undefined,
  });

  if (screen === "statesGallery") {
    return (
      <div className="parts-database-stitch add-parts-flow w-full px-margin py-space-lg">
        <PartsButton variant="secondary" className="mb-space-md" onClick={() => setScreen("home")}>
          ← Add parts
        </PartsButton>
        <AddPartsStatesGallery />
      </div>
    );
  }

  if (screen === "positionCatalog") {
    return (
      <div className="parts-database-stitch add-parts-flow w-full px-margin py-space-lg">
        <PartsButton variant="secondary" className="mb-space-md" onClick={() => setScreen("home")}>
          ← Add parts
        </PartsButton>
        <PositionSpecCatalog />
      </div>
    );
  }

  if (screen === "partTypes") {
    return (
      <PartTypesSettings
        owner={owner}
        fullPage
        onClose={() => setScreen("home")}
      />
    );
  }

  async function onSave() {
    setSaving(true);
    try {
      const result = await saveSelfServePart(draft);
      setSaveResult({
        ...result,
        brand: draft.brand,
        partNumber: draft.partNumber,
        categoryLabel: draft.partType?.name ?? "Part",
        directVehicleCount: draft.listings.length || 7,
        autoLinkedCount: 1,
      });
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
        <PartsButton variant="secondary" className="self-start" onClick={() => setBulk(false)}>
          ← Back to Add parts
        </PartsButton>
        <ImportByAreaFlow />
      </div>
    );
  }

  if (screen === "catalog" || screen === "catalogOne") {
    return (
      <CatalogAddPartsFlow
        singlePart={screen === "catalogOne"}
        onHome={() => setScreen("home")}
        onFindParts={() => { window.location.search = "?page=parts-catalog&tab=find-parts"; }}
      />
    );
  }

  if (screen === "fluid") {
    return <FluidPartFlow onHome={() => setScreen("home")} />;
  }

  if (screen === "extend") {
    return (
      <ExtendPartFlow
        onHome={() => setScreen("home")}
        onFindParts={() => { window.location.search = "?page=parts-catalog&tab=find-parts"; }}
      />
    );
  }

  if (screen === "home") {
    return (
      <>
        <AddPartsHome
          owner={owner}
          onCatalog={() => setScreen("catalog")}
          onExtend={() => setScreen("extend")}
          onFluid={() => setScreen("fluid")}
          onJustOne={() => setScreen("catalogOne")}
          onBulk={() => setBulk(true)}
          onPartTypes={() => setScreen("partTypes")}
        />
        <PlainWordsDrawer open={plainWords} onClose={() => setPlainWords(false)} onViewTaxonomy={owner ? () => { setPlainWords(false); setScreen("partTypes"); } : undefined} />
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
    <div className="parts-database-stitch add-parts-flow w-full px-margin py-space-lg">
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent className="parts-database-stitch add-parts-flow bg-surface-container-lowest text-on-surface border-outline-variant/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-on-surface">Cancel adding this part?</AlertDialogTitle>
            <AlertDialogDescription className="text-on-surface-variant">Nothing will be saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild className="h-auto min-h-0 p-0 shadow-none hover:bg-transparent">
              <PartsButton variant="secondary">Keep editing</PartsButton>
            </AlertDialogCancel>
            <AlertDialogAction asChild className="h-auto min-h-0 p-0 shadow-none hover:bg-transparent">
              <PartsButton
                variant="danger"
                confirm
                onClick={(e) => {
                  e.preventDefault();
                  setCancelConfirmOpen(false);
                  resetWizard();
                }}
              >
                Cancel part
              </PartsButton>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AddPartsWizardShell
        wizardStep={wizardStep}
        stepLabel={stepLabel}
        draftBrand={draft.brand}
        draftNumber={draft.partNumber}
        partTypeName={draft.partType?.name}
        sourceType={draft.sourceType}
        trustLabel={preview?.trustLabel}
        showStepTracker
        footer={
          wizardStep === 1 && step1Phase === "picker" ? (
            <AddPartsWizardFooter
              step={1}
              onCancel={() => setCancelConfirmOpen(true)}
              onNext={() => {
                const t = filteredTypes.find((x) => x.id === pickerTypeId);
                if (!t) return;
                setDraft({
                  ...emptyDraft(),
                  partType: t,
                  fitMode: t.defaultFitMode,
                  specKey: t.specFields[0]?.specKey ?? "",
                });
                setStep1Phase("details");
              }}
              nextLabel={footerLabels.nextLabel}
              nextDisabled={!pickerTypeId}
            />
          ) : wizardStep === 1 && step1Phase === "details" ? (
            <AddPartsWizardFooter
              step={1}
              onBack={() => {
                setStep1Phase("picker");
                setDraft(emptyDraft());
                setLookup(null);
              }}
              onCancel={() => setCancelConfirmOpen(true)}
              onNext={() => setWizardStep(2)}
              backLabel={footerLabels.backLabel}
              nextLabel={draft.sourceType === "other" ? "Submit for checking" : footerLabels.nextLabel}
              nextDisabled={!step1DetailsCanAdvance(draft, lookup)}
            />
          ) : wizardStep === 2 ? (
            <AddPartsWizardFooter
              step={2}
              onBack={() => { setWizardStep(1); setStep1Phase("details"); }}
              onCancel={() => setCancelConfirmOpen(true)}
              onNext={() => setWizardStep(draft.fitMode === "spec" ? 4 : 3)}
              backLabel={footerLabels.backLabel}
              nextLabel={footerLabels.nextLabel}
              centerNote={footerLabels.centerNote}
              nextDisabled={draft.fitMode === "specific" ? !step2SpecificCanAdvance(draft) : undefined}
            />
          ) : wizardStep === 3 ? (
            <AddPartsWizardFooter
              step={3}
              onBack={() => setWizardStep(2)}
              onCancel={() => setCancelConfirmOpen(true)}
              onNext={() => setWizardStep(4)}
              onSkip={() => setWizardStep(4)}
              backLabel={footerLabels.backLabel}
              nextLabel={footerLabels.nextLabel}
            />
          ) : (
            <AddPartsWizardFooter
              step={4}
              onBack={() => setWizardStep(draft.fitMode === "spec" ? 2 : 3)}
              onCancel={() => setCancelConfirmOpen(true)}
              onNext={() => { void onSave(); }}
              backLabel={footerLabels.backLabel}
              nextLabel={footerLabels.nextLabel}
              centerNote={footerLabels.centerNote}
              nextDisabled={saving}
            />
          )
        }
      >
        {wizardStep === 1 && step1Phase === "picker" ? (
          <Step1TypePicker
            types={filteredTypes}
            typeSearch={typeSearch}
            onSearch={setTypeSearch}
            selectedId={pickerTypeId}
            onSelect={(t) => setPickerTypeId(t.id)}
            onSubmitPartTypeRequest={async (payload) => {
              await submitPartTypeRequest(payload);
              toast.success("Request sent — owner will review in Part types.");
            }}
          />
        ) : null}

        {wizardStep === 1 && step1Phase === "details" && draft.partType ? (
          <Step1Details
            draft={draft}
            setDraft={setDraft}
            lookup={lookup}
            preview={preview}
            onChangeType={() => { setStep1Phase("picker"); setDraft(emptyDraft()); setPickerTypeId(null); }}
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
            {draft.fitMode === "specific" ? <Step2SpecificCars draft={draft} setDraft={setDraft} preview={preview} /> : null}
            {draft.fitMode === "engine" ? <Step2ByEngine draft={draft} setDraft={setDraft} /> : null}
            {draft.fitMode === "spec" ? <Step2BySpec draft={draft} setDraft={setDraft} matchedCarCount={preview?.carCount} /> : null}
            {preview && draft.fitMode !== "specific" ? (
              <p className="text-on-surface-variant font-body-sm">
                {preview.carCount} car version(s) · total reach {preview.totalReach}
              </p>
            ) : null}
          </div>
        ) : null}

        {wizardStep === 3 ? (
          <Step3ReplacesOe draft={draft} setDraft={setDraft} preview={preview} onSkip={() => setWizardStep(4)} />
        ) : null}

        {wizardStep === 4 ? (
          <Step4Review
            draft={draft}
            preview={preview}
            onEditStep={(s) => setWizardStep(s)}
          />
        ) : null}
      </AddPartsWizardShell>
    </div>
  );
}
