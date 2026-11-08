import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../../ui/alert-dialog";
import { PartsButton } from "../../PartsButton";
import { emptyCatalogDraft, type CatalogPageDraft } from "../addPartsTypes";
import { fetchSelfServePartTypes, saveCatalogPage, undoSelfServePart } from "../addPartsApi";
import { CatalogStepper } from "./CatalogStepper";
import { catalogCaptureDraft, catalogCaptureStepFor } from "./catalogCaptureFixtures";
import { CatalogStep1Page } from "./CatalogStep1Page";
import { CatalogStep2Cars } from "./CatalogStep2Cars";
import { CatalogStep3Parts } from "./CatalogStep3Parts";
import { CatalogStep4Save } from "./CatalogStep4Save";
import { CatalogStep4Trust } from "./CatalogStep4Trust";
import { CatalogSaved } from "./CatalogSaved";
import { D_CARD, DSourceStrip } from "./dominionKit";

export function CatalogAddPartsFlow({
  singlePart,
  onHome,
  onFindParts,
}: {
  singlePart?: boolean;
  onHome: () => void;
  onFindParts: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [draft, setDraft] = useState<CatalogPageDraft>(() => emptyCatalogDraft());
  const [framePreTickDone, setFramePreTickDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveResult, setSaveResult] = useState<Record<string, unknown> | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [reviewPhase, setReviewPhase] = useState<"trust" | "save">("trust");

  const typesQuery = useQuery({ queryKey: ["self-serve-part-types"], queryFn: fetchSelfServePartTypes });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preVehicle = params.get("vehiclesPreselectVehicleId")?.trim();
    if (preVehicle) {
      setDraft((prev) => ({
        ...prev,
        vehicleListings: [
          {
            vehicleId: preVehicle,
            label: "This car",
            make: "Toyota",
            model: "Roomy",
            chassisCode: "M900A",
            diffLabel: "2WD · 1.0 petrol",
            yearFrom: 2016,
            yearTo: 2020,
            locked: true,
            trust: "confirmed",
          },
        ],
      }));
      setStep(2);
      setFramePreTickDone(true);
    }
    const cap = params.get("addPartsCapture");
    if (!cap) return;
    const map = catalogCaptureStepFor(cap);
    const capDraft = catalogCaptureDraft(cap);
    if (map && capDraft) {
      setDraft(capDraft);
      setStep(map.step);
      setFramePreTickDone(true);
      if (map.reviewPhase) setReviewPhase(map.reviewPhase);
      if (cap === "saved_confirmation_next_steps") {
        setSaveResult({ batchId: "00000000-0000-4000-8000-00000000c001", partCount: 3, fitCount: 6 });
        setStep(5);
      }
    }
  }, []);

  async function onSave() {
    setSaving(true);
    setSaveError("");
    try {
      const parts = draft.partRows
        .filter((r) => r.partTypeId && r.partNumber.trim())
        .map((r) => ({
          partTypeId: r.partTypeId,
          brand: r.brand || draft.brandDefault || draft.catalogCarMaker || "Toyota",
          partNumber: r.partNumber.trim(),
          position: r.position,
          side: r.side,
          catalogueNumber: r.catalogueNumber,
          existingPartId: r.existingPartId,
          factoryNumbers: r.factoryNumbers,
        }));
      const result = await saveCatalogPage({
        evidenceUrl: draft.evidenceUrl.trim(),
        sourceType: draft.sourceType,
        catalogCarMaker: draft.catalogCarMaker.trim() || undefined,
        partKind: draft.partKind,
        brand: draft.brandDefault || draft.catalogCarMaker,
        vehicleListings: draft.vehicleListings.map((l) => ({
          vehicleId: l.vehicleId,
          yearFrom: l.yearFrom,
          yearTo: l.yearTo,
          trust: l.trust,
          reason: l.reason,
        })),
        parts,
      });
      setSaveResult(result);
      setStep(5);
      void qc.invalidateQueries({ queryKey: ["self-serve-recent"] });
      toast.success("Parts saved");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function resetKeepSession(keepCars: boolean) {
    const next = emptyCatalogDraft();
    if (keepCars) {
      next.evidenceUrl = draft.evidenceUrl;
      next.linkHints = draft.linkHints;
      next.catalogCarMaker = draft.catalogCarMaker;
      next.vehicleListings = draft.vehicleListings;
      next.sourceType = draft.sourceType;
      next.partKind = draft.partKind;
      next.brandDefault = draft.brandDefault;
    }
    setDraft(next);
    setStep(keepCars ? 3 : 1);
    setSaveResult(null);
    setFramePreTickDone(keepCars);
  }

  if (step === 5 && saveResult) {
    return (
      <CatalogSaved
        saveResult={saveResult}
        draft={draft}
        types={typesQuery.data ?? []}
        onAddMoreFromPage={() => resetKeepSession(true)}
        onSameCarsNewPage={() => {
          setDraft({ ...draft, evidenceUrl: "", linkHints: null, partRows: [] });
          setStep(1);
          setSaveResult(null);
        }}
        onFindParts={onFindParts}
        onHome={onHome}
        onUndo={() => {
          void undoSelfServePart(String(saveResult.batchId))
            .then(() => { toast.success("Undone"); onHome(); })
            .catch((e) => toast.error(e instanceof Error ? e.message : "Undo failed"));
        }}
      />
    );
  }

  return (
    <div className="parts-database-stitch add-parts-flow w-full max-w-[960px] mx-auto px-margin py-space-lg catalog-add-parts">
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent className="parts-database-stitch">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              The {draft.partRows.length} part row{draft.partRows.length === 1 ? "" : "s"} will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild><PartsButton variant="secondary">Keep editing</PartsButton></AlertDialogCancel>
            <AlertDialogAction asChild>
              <PartsButton variant="danger" confirm onClick={onHome}>Leave without saving</PartsButton>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CatalogStepper
        step={step <= 4 ? (step as 1 | 2 | 3 | 4) : 4}
        singlePart={singlePart}
        onJump={(s) => { if (step <= 4 && s < step) setStep(s); }}
      />
      {step >= 3 && step <= 4 ? (
        <DSourceStrip
          source={sourceLabel(draft)}
          cars={draft.vehicleListings.map((l) => `${l.make ?? ""} ${l.model ?? l.label ?? ""} ${l.diffLabel ? `· ${l.diffLabel}` : ""}`.replace(/\s+/g, " ").trim())}
          onChangeLink={() => setStep(1)}
          onEditCars={() => setStep(2)}
        />
      ) : null}
      <div className={`${D_CARD} p-5 sm:p-8`}>
      {step === 1 ? (
        <CatalogStep1Page draft={draft} setDraft={setDraft} onNext={() => setStep(2)} onCancel={() => setLeaveOpen(true)} />
      ) : null}
      {step === 2 ? (
        <CatalogStep2Cars
          draft={draft}
          setDraft={setDraft}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
          framePreTickDone={framePreTickDone}
          setFramePreTickDone={setFramePreTickDone}
        />
      ) : null}
      {step === 3 ? (
        <CatalogStep3Parts
          draft={draft}
          setDraft={setDraft}
          singlePart={singlePart}
          onEditCars={() => setStep(2)}
          onNext={() => {
            setReviewPhase("trust");
            setStep(4);
          }}
          onBack={() => setStep(2)}
        />
      ) : null}
      {step === 4 && reviewPhase === "trust" ? (
        <CatalogStep4Trust
          draft={draft}
          types={typesQuery.data ?? []}
          onBack={() => setStep(3)}
          onNext={() => setReviewPhase("save")}
          onTrustChange={(vehicleId, trust, reason) => {
            setDraft({
              ...draft,
              vehicleListings: draft.vehicleListings.map((l) =>
                l.vehicleId === vehicleId ? { ...l, trust, reason: reason ?? l.reason } : l),
            });
          }}
          onYearsChange={(vehicleId, yearFrom, yearTo) => {
            setDraft({
              ...draft,
              vehicleListings: draft.vehicleListings.map((l) =>
                l.vehicleId === vehicleId ? { ...l, yearFrom, yearTo } : l),
            });
          }}
        />
      ) : null}
      {step === 4 && reviewPhase === "save" ? (
        <CatalogStep4Save
          draft={draft}
          types={typesQuery.data ?? []}
          saving={saving}
          saveError={saveError}
          onSave={() => void onSave()}
          onBack={() => setReviewPhase("trust")}
        />
      ) : null}
      </div>
    </div>
  );
}

/** "Partsouq · Toyota's own catalogue" — plain words for the page the parts came from. */
function sourceLabel(draft: CatalogPageDraft): string {
  const host = draft.linkHints?.host || draft.evidenceUrl.replace(/^https?:\/\//, "").split("/")[0] || "";
  const site = host.replace(/^www\./, "");
  const pretty = site ? site.charAt(0).toUpperCase() + site.slice(1).replace(/\.(com|net|org|co\.jp|jp)$/i, "") : "The page";
  const maker = draft.catalogCarMaker?.trim();
  return maker && draft.partKind === "oem" ? `${pretty} · ${maker}'s own catalogue` : pretty;
}
