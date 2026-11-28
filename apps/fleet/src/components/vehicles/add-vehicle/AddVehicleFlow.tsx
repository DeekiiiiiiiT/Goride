/**
 * Add a vehicle — the new flow (audit docs/vehicle-pictures-and-add-vehicle-audit.md §5.1, F1–F13;
 * Stitch docs/stitch/vehicle-add-fleet-prompt.txt; Keep/Drop/Add §18.1).
 *
 * Replaces the old AddVehicleModal. The reading, catalogue matching and save logic are carried over
 * from that modal unchanged; only the screens are new.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, FileText, Focus, RefreshCcw, ScanLine, Sun, Keyboard } from "lucide-react";
import { pictureStateLabel, vehiclePictureSrc } from "@roam/roam-shared";
import { api } from "../../../services/api";
import type { Vehicle } from "../../../types/vehicle";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import { convertPdfToImage } from "../../../utils/pdf-helper";
import { extractChassisPrefix } from "../../../utils/chassisPrefix";
import { showCatalogGateToastIfApplicable } from "../../../utils/catalogGateErrors";
import { useCatalogCandidates } from "../../../hooks/useCatalogCandidates";
import { useVehicleCatalogAnchorFacets } from "../../../hooks/useVehicleCatalogAnchorFacets";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { CatalogVariantPicker, type CatalogVariantPickerSource } from "../CatalogVariantPicker";
import { CatalogFacetSelect } from "../CatalogFacetSelect";
import { useTollClasses } from "../TollClassPicker";
import {
  buildDocumentChecksPayload,
  certificateScanErrorToast,
  prepareCertificateFile,
  type StoredDocumentParse,
} from "../addVehicleCertificateFlow";
import {
  CarSummary,
  ColorCard,
  DropZone,
  FieldInput,
  FlowButton,
  FlowFooter,
  FlowShell,
  FlowTitle,
  Hourglass,
  Notice,
  PictureFrame,
  PrivacyLine,
  ProblemScreen,
  ReadingCard,
  StatusChip,
  StepBar,
  TipChips,
  ChoiceTile,
  type StepNumber,
} from "./AddVehicleUi";
import { isVehicleColor, type VehicleColor } from "./vehicleColors";
import { OdometerUseStep, odometerProblem, parseOdometerKm, type OdometerUseValue } from "./OdometerUseStep";
import { MmFillHistoryDialog } from "../maintenance-logging/MmFillHistoryDialog";

function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Power-train words documents add to the model name; the catalogue keeps them elsewhere. */
const MODEL_NOISE = /\b(HYBRID|HV|PHEV|PETROL|GASOLINE|DIESEL)\b/g;
const modelKey = (s: string) => s.toUpperCase().replace(MODEL_NOISE, "").replace(/[^A-Z0-9]/g, "");

/** The catalogue model a document's model means ("CHR HYBRID" → "C-HR"), or null when none is the same. */
export function snapModelToCatalog(docModel: string, catalogModels: string[]): string | null {
  const key = modelKey(docModel);
  if (!key) return null;
  const exact = catalogModels.find((m) => m.trim().toLowerCase() === docModel.trim().toLowerCase());
  if (exact) return exact;
  const same = catalogModels.filter((m) => modelKey(m) === key);
  return same.length === 1 ? same[0] : null;
}

/**
 * Usage category and plate class from what the documents say (owner, 17 Nov: fill these in, the person only fixes them).
 * Jamaican plates: 4 digits + 2 letters = private (white); C + letter = commercial (green); P + letter = public
 * passenger (red). Body type spots motorcycles and trailers. Anything unclear stays empty for the person to pick.
 */
export function inferVehicleUse(
  plate: string,
  body: string,
): { usageCategory: "" | "Private" | "Motorcycle" | "Commercial" | "PPV" | "Trailer"; plateClass: "" | "White" | "Green" | "Red" } {
  const b = body.toUpperCase();
  const p = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/CYCLE|SCOOTER/.test(b)) return { usageCategory: "Motorcycle", plateClass: "White" };
  if (/TRAILER|TRACTOR/.test(b)) return { usageCategory: "Trailer", plateClass: "" };
  if (/^\d{4}[A-Z]{2}$/.test(p)) return { usageCategory: "Private", plateClass: "White" };
  if (/^P[A-Z]\d{3,4}$/.test(p)) return { usageCategory: "PPV", plateClass: "Red" };
  if (/^C[A-Z]\d{3,4}$/.test(p)) return { usageCategory: "Commercial", plateClass: "Green" };
  return { usageCategory: "", plateClass: "" };
}

type ServiceLine = "rideshare" | "rush_delivery";
type DocKind = "fitness" | "registration";
type Screen =
  | "fitness"
  | "readingFitness"
  | "checkFitness"
  | "registration"
  | "readingRegistration"
  | "checkRegistration"
  | "vehicleUse"
  | "confirm"
  | "odometer"
  | "saved"
  | "couldntRead"
  | "tooMany";

export interface AddVehicleFlowProps {
  onClose: () => void;
  onVehicleAdded: (vehicle: Vehicle) => void;
  /** "Go to vehicle" on the saved screen. Falls back to onClose. */
  onGoToVehicle?: (vehicleId: string) => void;
  existingVehicles?: Vehicle[];
  defaultServiceLines?: ServiceLine[];
  orgServiceLines?: ServiceLine[];
  /**
   * Documents tab → Update: rescan one document for an existing vehicle and save only its new dates
   * (`updateDocumentsOnly`). Skips the step bar, colour, use section and the car confirm.
   */
  update?: { vehicle: Vehicle; doc: "fitness" | "registration" };
}

const EMPTY_FORM = {
  make: "",
  model: "",
  year: "",
  color: "",
  bodyType: "",
  engineNumber: "",
  ccRating: "",
  fitnessIssueDate: "",
  fitnessExpiryDate: "",
  laNumber: "",
  licensePlate: "",
  mvid: "",
  vin: "",
  controlNumber: "",
  registrationIssueDate: "",
  registrationExpiryDate: "",
  trim: "",
  drivetrain: "",
  transmission: "",
  fuelType: "",
  chassis: "",
  tollClassId: "class1",
  usageCategory: "" as "" | "Private" | "Motorcycle" | "Commercial" | "PPV" | "Trailer",
  plateClass: "" as "" | "White" | "Green" | "Red",
  fitnessFirstRegistration: false,
};
type FormState = typeof EMPTY_FORM;
type FieldKey = keyof FormState;

/** Server dates are already YYYY-MM-DD; anything else is left for the person to enter. */
function isoDate(v: unknown): string {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function normChassis(v: string): string {
  return v.replace(/[\s-]/g, "").toUpperCase();
}

function fileSizeLabel(f: File): string {
  const mb = f.size / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`;
}

type ScanResult = { ok: true; parse: StoredDocumentParse } | { ok: false; code?: string; message: string };

const READ_LIMIT_CODES = new Set(["READ_LIMIT_USER", "READ_LIMIT_ORG"]);

const COULDNT_READ_BODY: Record<string, string> = {
  FILE_TYPE_NOT_ALLOWED: "This file type can't be read. Use a photo or a PDF of the certificate.",
  FILE_TOO_LARGE: "This file is too large. Try a smaller photo (up to 8 MB).",
  READ_TIMEOUT: "Reading took too long. Try again, or type the details.",
  READ_PAUSED: "Scanning is paused right now — type the details instead.",
};

export function AddVehicleFlow({
  onClose,
  onVehicleAdded,
  onGoToVehicle,
  existingVehicles = [],
  defaultServiceLines,
  orgServiceLines,
  update,
}: AddVehicleFlowProps) {
  const isUpdate = Boolean(update);
  const orgLines: ServiceLine[] = orgServiceLines?.length ? orgServiceLines : ["rideshare"];
  const showPlatformPicker = orgLines.includes("rideshare") && orgLines.includes("rush_delivery");
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>(() => {
    const d = defaultServiceLines?.filter((l) => orgLines.includes(l)) ?? [];
    return d.length ? d : [...orgLines];
  });

  const [screen, setScreen] = useState<Screen>(update?.doc === "registration" ? "registration" : "fitness");
  // Maintenance steps 8 + 12: the first odometer reading (required) and how the car is used (hard use by default).
  const today = localTodayIso();
  const [odoUse, setOdoUse] = useState<OdometerUseValue>(() => ({
    km: "",
    date: localTodayIso(),
    hardUse: true,
    historyAfterSave: false,
  }));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [problemDoc, setProblemDoc] = useState<DocKind>("fitness");
  const [problemCode, setProblemCode] = useState<string | undefined>();
  const [readingFile, setReadingFile] = useState<File | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  type UseKey = "usageCategory" | "plateClass" | "tollClassId";
  /** Vehicle use choices Roam filled in and the person has not changed ("Filled by Roam"). */
  const [filledUse, setFilledUse] = useState<Set<UseKey>>(() => new Set<UseKey>(["tollClassId"]));
  const setUse = (key: UseKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFilledUse((prev) => {
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
  };
  const [readKeys, setReadKeys] = useState<Set<FieldKey>>(new Set());
  const [editedKeys, setEditedKeys] = useState<Set<FieldKey>>(new Set());
  const [flaggedKeys, setFlaggedKeys] = useState<Set<FieldKey>>(new Set());
  const [fitnessParse, setFitnessParse] = useState<StoredDocumentParse | null>(null);
  const [registrationParse, setRegistrationParse] = useState<StoredDocumentParse | null>(null);
  const [colorStandard, setColorStandard] = useState<VehicleColor | null>(null);
  const [colorEdited, setColorEdited] = useState(false);
  const [fitnessChassisRaw, setFitnessChassisRaw] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{
    vehicleId: string;
    parked: boolean;
    picture: { status: string; url: string | null };
  } | null>(null);
  const [pictureWaitExpired, setPictureWaitExpired] = useState(false);

  /* -------------------------------------------- catalogue matching (from the old modal) */
  const [selectedCatalogRow, setSelectedCatalogRow] = useState<VehicleCatalogRecord | null>(null);
  const [catalogPickerSource, setCatalogPickerSource] = useState<CatalogVariantPickerSource | null>(null);
  const [verifyMake, setVerifyMake] = useState("");
  const [verifyModel, setVerifyModel] = useState("");
  const [verifyYear, setVerifyYear] = useState("");
  const [verifyChassis, setVerifyChassis] = useState("");
  const [verifyDrivetrain, setVerifyDrivetrain] = useState("");
  const [verifyTransmission, setVerifyTransmission] = useState("");
  const catalogClass = form.usageCategory === "Motorcycle" ? ("motorcycle" as const) : ("car" as const);

  const { facets: mmyFacets, loading: mmyLoading } = useCatalogCandidates({
    make: verifyMake,
    model: verifyModel,
    year: verifyYear,
    skipChassisFilter: true,
    vehicle_class: catalogClass,
  });
  const { facets: chassisFacets, loading: chassisFacetsLoading } = useCatalogCandidates({
    make: verifyMake,
    model: verifyModel,
    year: verifyYear,
    chassis: verifyChassis,
    vehicle_class: catalogClass,
  });
  const {
    makes: makeOptions,
    models: modelOptions,
    years: yearOptions,
    loadingMakes,
    loadingModels,
    loadingYears,
  } = useVehicleCatalogAnchorFacets(verifyMake, verifyModel, catalogClass);

  const handlePickerChange = useCallback((row: VehicleCatalogRecord | null, source: CatalogVariantPickerSource) => {
    setSelectedCatalogRow(row);
    setCatalogPickerSource(source);
  }, []);

  // CatalogFacetSelect snaps casing (TOYOTA → Toyota) through onChange; only a real change cascades.
  const sameText = (a: string, b: string) => a.trim().length > 0 && b.trim().length > 0 && a.trim().toLowerCase() === b.trim().toLowerCase();
  const onMakeChange = useCallback((v: string) => {
    if (!sameText(v, verifyMake)) {
      setVerifyModel("");
      setVerifyYear("");
      setVerifyChassis("");
      setVerifyDrivetrain("");
      setVerifyTransmission("");
    }
    setVerifyMake(v);
  }, [verifyMake]);
  const onModelChange = useCallback((v: string) => {
    if (!sameText(v, verifyModel)) {
      setVerifyYear("");
      setVerifyChassis("");
      setVerifyDrivetrain("");
      setVerifyTransmission("");
    }
    setVerifyModel(v);
  }, [verifyModel]);
  const onYearChange = useCallback((v: string) => {
    if (!sameText(v, verifyYear)) {
      setVerifyChassis("");
      setVerifyDrivetrain("");
      setVerifyTransmission("");
    }
    setVerifyYear(v);
  }, [verifyYear]);

  // Seed the catalogue search from the documents when the confirm screen opens.
  const seededRef = useRef(false);
  useEffect(() => {
    if (screen !== "confirm" || seededRef.current) return;
    setVerifyMake(form.make);
    setVerifyModel(form.model);
    setVerifyYear(form.year);
    setVerifyChassis((form.chassis || extractChassisPrefix(form.vin)) ?? "");
    setVerifyDrivetrain(form.drivetrain);
    setVerifyTransmission(form.transmission);
    seededRef.current = true;
  }, [screen, form]);

  // Documents write models their own way ("CHR HYBRID"); snap to the catalogue's name ("C-HR").
  // Re-checks whenever the model list loads or changes (it is cached for 5 minutes).
  useEffect(() => {
    if (screen !== "confirm" || !seededRef.current || loadingModels) return;
    if (modelOptions.length === 0 || !verifyModel.trim()) return;
    const snapped = snapModelToCatalog(verifyModel, modelOptions);
    if (snapped && snapped !== verifyModel) setVerifyModel(snapped);
  }, [screen, verifyModel, modelOptions, loadingModels]);

  // A new search clears the previous pick.
  useEffect(() => {
    if (screen !== "confirm") return;
    setSelectedCatalogRow(null);
    setCatalogPickerSource(null);
  }, [screen, verifyMake, verifyModel, verifyYear, verifyChassis]);

  const searchReady =
    verifyChassis.trim().length > 0 &&
    /^\d{4}$/.test(verifyYear.trim()) &&
    verifyMake.trim().length >= 2 &&
    verifyModel.trim().length >= 2;

  /* ------------------------------------------------------------------ helpers */
  const setField = (key: FieldKey, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (readKeys.has(key)) setEditedKeys((s) => new Set(s).add(key));
    if (flaggedKeys.has(key)) setFlaggedKeys((s) => {
      const n = new Set(s);
      n.delete(key);
      return n;
    });
  };

  const scan = async (file: File, type: "fitness_certificate" | "vehicle_registration"): Promise<ScanResult> => {
    try {
      const toSend = await prepareCertificateFile(file, convertPdfToImage);
      const res = await api.parseDocument(toSend, type);
      if (!res.success || !res.fields || !res.fileSha256) {
        return { ok: false, message: "We couldn't read this file." };
      }
      return {
        ok: true,
        parse: { fileSha256: res.fileSha256, fields: res.fields, flags: res.flags, colorStandard: res.colorStandard },
      };
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      return { ok: false, code: err.code, message: err.message || "We couldn't read this file." };
    }
  };

  const failRead = (doc: DocKind, result: { code?: string; message: string }) => {
    setProblemDoc(doc);
    setProblemCode(result.code);
    setScreen(result.code && READ_LIMIT_CODES.has(result.code) ? "tooMany" : "couldntRead");
  };

  const onFitnessFile = async (file: File) => {
    setReadingFile(file);
    setScreen("readingFitness");
    const result = await scan(file, "fitness_certificate");
    if (!result.ok) return failRead("fitness", result);
    const d = result.parse.fields;
    const next: Partial<FormState> = {
      make: d.make != null ? String(d.make) : "",
      model: d.model != null ? String(d.model) : "",
      year: d.year != null ? String(d.year) : "",
      color: d.colorAsWritten != null ? String(d.colorAsWritten) : "",
      bodyType: d.bodyAsWritten != null ? String(d.bodyAsWritten) : "",
      engineNumber: d.engineNumber != null ? String(d.engineNumber) : "",
      ccRating: d.cc != null ? String(d.cc) : "",
      fitnessIssueDate: isoDate(d.issueDate),
      fitnessExpiryDate: isoDate(d.expiryDate),
      chassis: extractChassisPrefix(String(d.chassis ?? d.vin ?? "")) ?? "",
    };
    setFitnessChassisRaw(String(d.chassis ?? d.vin ?? ""));
    setForm((f) => ({ ...f, ...next }));
    setReadKeys((s) => {
      const n = new Set(s);
      (Object.keys(next) as FieldKey[]).forEach((k) => {
        if (next[k]) n.add(k);
      });
      return n;
    });
    const flags = new Set(flaggedKeys);
    if (result.parse.flags?.includes("expiryDate")) flags.add("fitnessExpiryDate");
    if (result.parse.flags?.includes("year")) flags.add("year");
    setFlaggedKeys(flags);
    setColorStandard(isVehicleColor(result.parse.colorStandard) ? result.parse.colorStandard : null);
    setColorEdited(false);
    setFitnessParse(result.parse);
    setScreen("checkFitness");
  };

  const onRegistrationFile = async (file: File) => {
    setReadingFile(file);
    setScreen("readingRegistration");
    const result = await scan(file, "vehicle_registration");
    if (!result.ok) return failRead("registration", result);
    const d = result.parse.fields;
    const chassisRaw = String(d.chassis ?? d.vin ?? "").toUpperCase();
    const next: Partial<FormState> = {
      licensePlate: String(d.plate ?? "").toUpperCase(),
      vin: chassisRaw,
      mvid: d.mvid != null ? String(d.mvid) : "",
      laNumber: d.laNumber != null ? String(d.laNumber) : "",
      controlNumber: d.controlNumber != null ? String(d.controlNumber) : "",
      registrationIssueDate: isoDate(d.issueDate),
      registrationExpiryDate: isoDate(d.expiryDate),
    };
    const inferred = inferVehicleUse(next.licensePlate ?? "", String(d.bodyAsWritten ?? form.bodyType ?? ""));
    setFilledUse((prev) => {
      const n = new Set(prev);
      if (inferred.usageCategory && !form.usageCategory) n.add("usageCategory");
      if (inferred.plateClass && !form.plateClass) n.add("plateClass");
      return n;
    });
    setForm((f) => {
      const use = inferVehicleUse(next.licensePlate ?? "", String(d.bodyAsWritten ?? f.bodyType ?? ""));
      return {
        ...f,
        ...next,
        chassis: f.chassis || (extractChassisPrefix(chassisRaw) ?? ""),
        // Filled from the documents; never overwrites a choice the person already made.
        usageCategory: f.usageCategory || use.usageCategory,
        plateClass: f.plateClass || use.plateClass,
      };
    });
    setReadKeys((s) => {
      const n = new Set(s);
      (Object.keys(next) as FieldKey[]).forEach((k) => {
        if (next[k]) n.add(k);
      });
      return n;
    });
    const flags = new Set(flaggedKeys);
    if (result.parse.flags?.includes("expiryDate")) flags.add("registrationExpiryDate");
    setFlaggedKeys(flags);
    // The fitness colour is pre-picked; a registration-only read fills it in.
    if (!colorStandard && isVehicleColor(result.parse.colorStandard)) setColorStandard(result.parse.colorStandard);
    setRegistrationParse(result.parse);
    setScreen("checkRegistration");
  };

  const typeDetailsInstead = () => {
    setScreen(problemDoc === "fitness" ? "checkFitness" : "checkRegistration");
  };

  /* ------------------------------------------------------------- cross-checks */
  const registrationColor = isVehicleColor(registrationParse?.colorStandard) ? registrationParse!.colorStandard as VehicleColor : null;
  const registrationColorAsWritten = String(registrationParse?.fields.colorAsWritten ?? "");
  const colorConflict = Boolean(registrationColor && colorStandard && registrationColor !== colorStandard && !colorEdited);

  const chassisMismatch = useMemo(() => {
    const a = normChassis(fitnessChassisRaw);
    const b = normChassis(form.vin);
    return a !== "" && b !== "" && a !== b;
  }, [fitnessChassisRaw, form.vin]);

  const regMake = String(registrationParse?.fields.make ?? "").trim();
  const regModel = String(registrationParse?.fields.model ?? "").trim();
  const makeModelDiffers =
    Boolean(registrationParse && fitnessParse && regMake && regModel) &&
    `${regMake} ${regModel}`.toLowerCase() !== `${form.make} ${form.model}`.trim().toLowerCase();

  const fitnessNextDisabled = !isUpdate && !colorStandard;
  const registrationNextDisabled = isUpdate
    ? !form.licensePlate.trim()
    : !form.licensePlate.trim() || chassisMismatch || !colorStandard;
  const vehicleUseNextDisabled = !serviceLines.length || !form.tollClassId;
  const { classes: tollClasses, loading: tollClassesLoading } = useTollClasses();

  /** Update mode: save only this document's new dates + its check record. */
  const saveUpdate = async () => {
    if (!update) return;
    const doc = update.doc;
    const parse = doc === "fitness" ? fitnessParse : registrationParse;
    setSaving(true);
    try {
      const v = update.vehicle;
      const dates =
        doc === "fitness"
          ? { fitnessIssueDate: form.fitnessIssueDate || v.fitnessIssueDate, fitnessExpiry: form.fitnessExpiryDate || v.fitnessExpiry }
          : {
              registrationIssueDate: form.registrationIssueDate || v.registrationIssueDate,
              registrationExpiry: form.registrationExpiryDate || v.registrationExpiry,
            };
      const documentChecks = buildDocumentChecksPayload(doc === "fitness" ? parse : null, doc === "registration" ? parse : null);
      await api.saveVehicle({ ...v, ...dates, documentChecks, updateDocumentsOnly: true });
      toast.success(doc === "fitness" ? "Fitness dates updated" : "Registration dates updated");
      onVehicleAdded({ ...v, ...dates } as Vehicle);
      onClose();
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === "PLATE_MISMATCH" || err.code === "CHASSIS_MISMATCH") toast.error(err.message);
      else toast.error(err.message || "Could not save the new dates.");
    } finally {
      setSaving(false);
    }
  };

  /* --------------------------------------------------------------------- save */
  // Owner, 17 Nov: fleets never pick a catalogue car. One clear match is used; anything else is sent to
  // Dominion's Pending catalog (saved as parked) for Roam to add or choose.
  const save = async () => {
    if (!form.licensePlate.trim()) {
      toast.error("A license plate is required before you can save.");
      return;
    }
    setSaving(true);
    try {
      const plate = form.licensePlate.trim().toUpperCase();
      const documentChecks = buildDocumentChecksPayload(fitnessParse, registrationParse);
      const existingVehicle = existingVehicles.find(
        (v) => (v.licensePlate || "").toUpperCase() === plate || v.id === plate,
      );
      const hint = (v: string | null | undefined) => {
        const s = (v ?? "").toString().trim();
        return s === "" ? undefined : s;
      };
      const chassisHint = hint(verifyChassis) ?? hint(form.chassis);
      const drivetrainHint = hint(verifyDrivetrain) ?? hint(form.drivetrain);
      const transmissionHint = hint(verifyTransmission) ?? hint(form.transmission);
      const r = selectedCatalogRow;
      const catalogHints: Partial<Vehicle> = r
        ? {
            vehicle_catalog_id: r.id,
            vehicle_catalog_class_hint: r.vehicle_class === "motorcycle" ? "motorcycle" : "car",
            vehicle_catalog_trim_hint: hint(r.trim_series ?? form.trim),
            vehicle_catalog_chassis_hint: hint(r.chassis_code) ?? chassisHint,
            vehicle_catalog_generation_hint: hint(r.generation),
            vehicle_catalog_engine_code_hint: hint(r.engine_code),
            vehicle_catalog_engine_type_hint: hint(r.engine_type),
            vehicle_catalog_full_model_code_hint: hint(r.full_model_code),
            vehicle_catalog_catalog_trim_hint: hint(r.catalog_trim),
            vehicle_catalog_emissions_prefix_hint: hint(r.emissions_prefix),
            vehicle_catalog_trim_suffix_hint: hint(r.trim_suffix_code),
            vehicle_catalog_drivetrain_hint: hint(r.drivetrain) ?? drivetrainHint,
            vehicle_catalog_fuel_type_hint: hint(r.fuel_type) ?? hint(form.fuelType),
            vehicle_catalog_transmission_hint: hint(r.transmission) ?? transmissionHint,
            vehicle_catalog_fuel_category_hint: hint(r.fuel_category),
            vehicle_catalog_fuel_grade_hint: hint(r.fuel_grade),
          }
        : {
            vehicle_catalog_class_hint: catalogClass,
            vehicle_catalog_trim_hint: hint(form.trim),
            vehicle_catalog_chassis_hint: chassisHint,
            vehicle_catalog_drivetrain_hint: drivetrainHint,
            vehicle_catalog_fuel_type_hint: hint(form.fuelType),
            vehicle_catalog_transmission_hint: transmissionHint,
          };
      const make = verifyMake.trim() || form.make;
      const model = verifyModel.trim() || form.model;
      const year = /^\d{4}$/.test(verifyYear.trim()) ? verifyYear.trim() : form.year;
      const lines = serviceLines.length ? serviceLines : (["rideshare"] as ServiceLine[]);

      const finalVehicle: Vehicle = existingVehicle
        ? {
            ...existingVehicle,
            make: make || existingVehicle.make,
            model: model || existingVehicle.model,
            year: year || existingVehicle.year,
            color: form.color || existingVehicle.color,
            bodyType: form.bodyType || existingVehicle.bodyType,
            vin: form.vin || existingVehicle.vin,
            registrationExpiry: form.registrationExpiryDate || existingVehicle.registrationExpiry,
            fitnessExpiry: form.fitnessExpiryDate || existingVehicle.fitnessExpiry,
            registrationIssueDate: form.registrationIssueDate || existingVehicle.registrationIssueDate,
            fitnessIssueDate: form.fitnessIssueDate || existingVehicle.fitnessIssueDate,
            engineNumber: form.engineNumber || existingVehicle.engineNumber,
            ccRating: form.ccRating || existingVehicle.ccRating,
            controlNumber: form.controlNumber || existingVehicle.controlNumber,
            mvid: form.mvid || existingVehicle.mvid,
            laNumber: form.laNumber || existingVehicle.laNumber,
            ...catalogHints,
            tollClassId: form.tollClassId || "class1",
            tollClassNeedsReview: false,
            usageCategory: (form.usageCategory || existingVehicle.usageCategory) as Vehicle["usageCategory"],
            plateClass: (form.plateClass || existingVehicle.plateClass) as Vehicle["plateClass"],
            fitnessFirstRegistration:
              form.usageCategory === "Commercial" ? form.fitnessFirstRegistration : existingVehicle.fitnessFirstRegistration,
            serviceLines: lines,
          }
        : ({
            id: plate,
            licensePlate: plate,
            make: make || "Unknown",
            model: model || "Unknown",
            year,
            vin: form.vin || `${plate}-VIN`,
            status: "Inactive",
            color: form.color,
            bodyType: form.bodyType,
            engineNumber: form.engineNumber,
            ccRating: form.ccRating,
            controlNumber: form.controlNumber,
            fitnessIssueDate: form.fitnessIssueDate,
            fitnessExpiry: form.fitnessExpiryDate,
            registrationIssueDate: form.registrationIssueDate,
            registrationExpiry: form.registrationExpiryDate,
            metrics: { todayEarnings: 0, utilizationRate: 0, totalLifetimeEarnings: 0, odometer: 0, fuelLevel: 100, healthScore: 100 },
            serviceStatus: "OK",
            nextServiceType: "Inspection",
            daysToService: 90,
            mvid: form.mvid,
            laNumber: form.laNumber,
            tollClassId: form.tollClassId || "class1",
            tollClassNeedsReview: false,
            usageCategory: (form.usageCategory || undefined) as Vehicle["usageCategory"],
            plateClass: (form.plateClass || undefined) as Vehicle["plateClass"],
            fitnessFirstRegistration: form.usageCategory === "Commercial" ? form.fitnessFirstRegistration : undefined,
            serviceLines: lines,
            ...catalogHints,
          } as unknown as Vehicle);

      const res = await api.saveVehicle({ ...finalVehicle, documentChecks, colorStandard: colorStandard ?? undefined });
      const merged = res?.data && typeof res.data === "object" ? { ...finalVehicle, ...(res.data as object) } : finalVehicle;

      // Step 8 (MER-26): the odometer typed on the last step is the car's first reading.
      const km = parseOdometerKm(odoUse.km);
      if (km != null && !Number.isNaN(km) && km > 0) {
        try {
          await api.addOdometerReading({ vehicleId: plate, odometer: km, value: km, date: odoUse.date, source: "manual" });
        } catch {
          toast.error("The car is saved, but its odometer reading isn't. Add it from Maintenance → Log odometer.");
        }
      }
      // Step 12 (MER-25): hard use by default; the choice is recorded either way.
      try {
        await api.patchVehicleSevereDuty(plate, {
          severe_duty: odoUse.hardUse,
          reason: odoUse.hardUse ? "Hard use chosen when the car was added" : "Normal use chosen when the car was added",
        });
      } catch {
        toast.error("The car is saved, but how it's used isn't. Set it from the car's due items in Maintenance.");
      }

      onVehicleAdded(merged as Vehicle);
      const parked = res?.catalogMatched === false || res?.catalogStatus === "pending_catalog" || res?.catalogStatus === "needs_info";
      setSaved({ vehicleId: plate, parked, picture: res?.picture ?? { status: "none", url: null } });
      setPictureWaitExpired(false);
      setScreen("saved");
      if (odoUse.historyAfterSave && !parked) setHistoryOpen(true);
    } catch (error) {
      const err = error as Error & { code?: string };
      if (!showCatalogGateToastIfApplicable(error)) {
        if (err.code === "PLATE_IN_OTHER_FLEET") toast.error(certificateScanErrorToast(err.code, err.message));
        else if (err.code === "CHASSIS_MISMATCH") toast.error("These documents are for different vehicles.");
        else toast.error(err.message || "Could not save the vehicle.");
      }
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------- picture polling (F7) */
  const pollStartRef = useRef<number>(0);
  useEffect(() => {
    if (screen !== "saved" || !saved || saved.parked) return;
    const st = saved.picture.status;
    if (st !== "queued" && st !== "generating") return;
    if (pictureWaitExpired) return;
    if (!pollStartRef.current) pollStartRef.current = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - pollStartRef.current > 60_000) {
        setPictureWaitExpired(true);
        window.clearInterval(timer);
        return;
      }
      try {
        const picture = await api.getVehiclePicture(saved.vehicleId);
        setSaved((s) => (s ? { ...s, picture } : s));
      } catch {
        /* keep waiting; the next tick tries again */
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [screen, saved, pictureWaitExpired]);

  const checkAgain = () => {
    pollStartRef.current = Date.now();
    setPictureWaitExpired(false);
  };

  const resetForAnother = () => {
    setForm({ ...EMPTY_FORM });
    setReadKeys(new Set());
    setEditedKeys(new Set());
    setFlaggedKeys(new Set());
    setFitnessParse(null);
    setRegistrationParse(null);
    setColorStandard(null);
    setColorEdited(false);
    setFitnessChassisRaw("");
    setFilledUse(new Set<UseKey>(["tollClassId"]));
    setSelectedCatalogRow(null);
    setCatalogPickerSource(null);
    seededRef.current = false;
    pollStartRef.current = 0;
    setSaved(null);
    setOdoUse({ km: "", date: localTodayIso(), hardUse: true, historyAfterSave: false });
    setHistoryOpen(false);
    setScreen("fitness");
  };

  const requestCancel = () => setConfirmCancel(true);

  /* ------------------------------------------------------------------- screens */
  const stepFor: Record<Screen, StepNumber> = {
    fitness: 1,
    readingFitness: 1,
    checkFitness: 1,
    registration: 2,
    readingRegistration: 2,
    checkRegistration: 2,
    vehicleUse: 3,
    confirm: 4,
    odometer: 5,
    saved: 6,
    couldntRead: problemDoc === "fitness" ? 1 : 2,
    tooMany: problemDoc === "fitness" ? 1 : 2,
  };

  const readingRows = screen === "readingFitness"
    ? ["Make and model", "Year of manufacture", "Colour", "Engine number and CC", "Issue and expiry dates"]
    : ["Plate", "Chassis number", "Control number and MVID", "Issue and expiry dates"];

  let body: React.ReactNode = null;

  if (screen === "fitness" || screen === "registration") {
    const isFit = screen === "fitness";
    body = (
      <>
        <FlowTitle
          title={
            isUpdate
              ? isFit
                ? "Update the Certificate of Fitness"
                : "Update the registration"
              : isFit
                ? "Add a vehicle"
                : "Now the registration"
          }
          subtitle={
            isUpdate
              ? `Scan the new certificate for ${update!.vehicle.licensePlate}. We'll read the new dates.`
              : isFit
                ? "Start with the Certificate of Fitness. We'll read it for you."
                : "Add the Motor Vehicle Registration certificate."
          }
        />
        <DropZone
          title={isFit ? "Drop a photo or PDF of the Certificate of Fitness here" : "Drop a photo or PDF of the Motor Vehicle Registration here"}
          onFile={(f) => void (isFit ? onFitnessFile(f) : onRegistrationFile(f))}
        />
        <PrivacyLine />
        <TipChips />
        <FlowFooter onCancel={requestCancel} hint={isUpdate ? undefined : `Step ${isFit ? 1 : 2} of 5`}>
          {!isFit && !isUpdate ? (
            <FlowButton tone="secondary" onClick={() => setScreen("checkFitness")}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </FlowButton>
          ) : null}
        </FlowFooter>
      </>
    );
  } else if (screen === "readingFitness" || screen === "readingRegistration") {
    body = (
      <>
        <FlowTitle title="Reading your certificate…" />
        {readingFile ? <ReadingCard fileName={readingFile.name} sizeLabel={fileSizeLabel(readingFile)} rows={readingRows} /> : null}
        <PrivacyLine />
        <FlowFooter onCancel={requestCancel} hint="Reading in progress…" />
      </>
    );
  } else if (screen === "checkFitness") {
    const f = (key: FieldKey, label: string, extra?: { type?: "date"; mono?: boolean }) => (
      <FieldInput
        label={label}
        value={String(form[key] ?? "")}
        onChange={(v) => setField(key, v)}
        read={readKeys.has(key)}
        edited={editedKeys.has(key)}
        flagged={flaggedKeys.has(key)}
        type={extra?.type}
        mono={extra?.mono}
      />
    );
    body = (
      <>
        <FlowTitle title="Check the fitness details" subtitle="We read these from your certificate. Fix anything that's wrong." />
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {f("make", "Make")}
          {f("model", "Model")}
          {f("year", "Year of manufacture")}
          {f("bodyType", "Body")}
          {f("engineNumber", "Engine number", { mono: true })}
          {f("ccRating", "CC")}
          {f("fitnessIssueDate", "Fitness issued", { type: "date" })}
          {f("fitnessExpiryDate", "Fitness expires", { type: "date" })}
        </div>
        {!isUpdate ? (
          <ColorCard
            value={colorStandard}
            certificateSays={form.color}
            read={Boolean(fitnessParse?.colorStandard)}
            edited={colorEdited}
            onChange={(c) => {
              setColorStandard(c);
              setColorEdited(true);
            }}
          />
        ) : null}
        <FlowFooter onCancel={requestCancel}>
          <FlowButton tone="secondary" onClick={() => setScreen("fitness")}>
            <RefreshCcw className="h-4 w-4" aria-hidden />
            Scan again
          </FlowButton>
          {isUpdate ? (
            <FlowButton tone="primary" busy={saving} onClick={() => void saveUpdate()} data-testid="update-save">
              Save the new dates
              <Check className="h-4 w-4" aria-hidden />
            </FlowButton>
          ) : (
            <FlowButton tone="primary" disabled={fitnessNextDisabled} onClick={() => setScreen("registration")} data-testid="fitness-next">
              Looks right — next
              <ArrowRight className="h-4 w-4" aria-hidden />
            </FlowButton>
          )}
        </FlowFooter>
      </>
    );
  } else if (screen === "checkRegistration") {
    // Stitch F5: each registration field sits in its own light box.
    const f = (key: FieldKey, label: string, extra?: { type?: "date"; mono?: boolean }) => (
      <div className="rounded-2xl bg-[#eff4ff] p-4 dark:bg-[#1c1c1e]">
        <FieldInput
          label={label}
          value={String(form[key] ?? "")}
          onChange={(v) => setField(key, key === "vin" ? v.toUpperCase() : v)}
          read={readKeys.has(key)}
          edited={editedKeys.has(key)}
          flagged={flaggedKeys.has(key)}
          type={extra?.type}
          mono={extra?.mono}
        />
      </div>
    );
    body = (
      <>
        <FlowTitle title="Check the registration details" subtitle="We read these from your registration. Fix anything that's wrong." />
        <div className="flex flex-col gap-2 rounded-2xl bg-[#eff4ff] p-5 dark:bg-[#1c1c1e]">
          <label htmlFor="fld-plate" className="text-[13px] font-semibold uppercase tracking-wide text-[#47464c] dark:text-[#a1a1aa]">
            Plate (required)
          </label>
          <div className="flex h-14 w-full max-w-xs items-center gap-3 rounded-xl border border-black/[0.08] bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-[#030213] dark:border-[#3a3a3d] dark:bg-[#2a2a2d]">
            <span className="flex h-8 w-6 shrink-0 flex-col items-center justify-center rounded bg-[#dbe1ff] text-[9px] font-bold leading-[1.1] text-[#003ea8] dark:bg-[#172554] dark:text-[#60a5fa]" aria-hidden>
              J<br />M
            </span>
            <input
              id="fld-plate"
              data-testid="plate-input"
              value={form.licensePlate}
              onChange={(e) => setField("licensePlate", e.target.value.toUpperCase())}
              placeholder="5179KZ"
              className="h-full min-w-0 flex-1 bg-transparent font-mono text-2xl font-bold tracking-[0.2em] text-[#0a0a0a] focus:outline-none dark:text-[#fafafa]"
            />
          </div>
        </div>
        {chassisMismatch ? (
          <Notice
            tone="red"
            title="These documents are for different vehicles"
            body="The chassis numbers on the fitness and the registration don't match. Scan the right document again, or correct the chassis number."
          />
        ) : null}
        {makeModelDiffers ? (
          <Notice
            tone="amber"
            title="The documents name different cars"
            body={`The registration says ${regMake} ${regModel}, the fitness says ${form.make} ${form.model}. You'll pick the right car on the next step.`}
          />
        ) : null}
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {f("vin", "Chassis / VIN", { mono: true })}
          {f("controlNumber", "Control number")}
          {f("mvid", "MVID")}
          {f("laNumber", "LA number")}
          {f("registrationIssueDate", "Registration issued", { type: "date" })}
          {f("registrationExpiryDate", "Registration expires", { type: "date" })}
        </div>
        {colorConflict ? (
          <ColorCard
            value={colorStandard}
            certificateSays={form.color}
            registrationSays={registrationColorAsWritten}
            read
            edited={colorEdited}
            onChange={(c) => {
              setColorStandard(c);
              setColorEdited(true);
            }}
          />
        ) : null}
        <PrivacyLine />
        <FlowFooter onCancel={requestCancel}>
          {!isUpdate ? (
            <FlowButton tone="secondary" onClick={() => setScreen("checkFitness")}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </FlowButton>
          ) : null}
          <FlowButton tone="secondary" onClick={() => setScreen("registration")}>
            <RefreshCcw className="h-4 w-4" aria-hidden />
            Scan again
          </FlowButton>
          {isUpdate ? (
            <FlowButton tone="primary" busy={saving} disabled={registrationNextDisabled} onClick={() => void saveUpdate()} data-testid="update-save">
              Save the new dates
              <Check className="h-4 w-4" aria-hidden />
            </FlowButton>
          ) : (
            <FlowButton
              tone="primary"
              disabled={registrationNextDisabled}
              onClick={() => setScreen("vehicleUse")}
              data-testid="registration-next"
              title={!form.licensePlate.trim() ? "Enter the plate to continue" : chassisMismatch ? "The chassis numbers don't match" : undefined}
            >
              Looks right — next
              <ArrowRight className="h-4 w-4" aria-hidden />
            </FlowButton>
          )}
        </FlowFooter>
      </>
    );
  } else if (screen === "vehicleUse") {
    body = (
      <>
        <FlowTitle title="How you use this vehicle" subtitle="We filled these in from your documents. Change anything that's wrong." />
        {showPlatformPicker ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-[#eff4ff] p-4 dark:bg-[#1c1c1e]">
            <span className="text-[13px] font-medium text-[#47464c] dark:text-[#a1a1aa]">Used for (pick one or both)</span>
            <div className="flex flex-wrap gap-2">
              {([
                { id: "rideshare" as const, label: "Rideshare" },
                { id: "rush_delivery" as const, label: "Delivery (Roam Rush)" },
              ]).map((opt) => {
                const on = serviceLines.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setServiceLines((prev) => {
                        if (on) {
                          const next = prev.filter((l) => l !== opt.id);
                          return next.length ? next : prev;
                        }
                        return [...prev, opt.id];
                      })
                    }
                    className={
                      on
                        ? "inline-flex min-h-11 items-center gap-2 rounded-full border border-[#030213] bg-[#030213] px-4 text-[15px] font-medium text-white dark:border-[#fafafa] dark:bg-[#fafafa] dark:text-[#030213]"
                        : "inline-flex min-h-11 items-center gap-2 rounded-full border border-[#cbd5e1] bg-white px-4 text-[15px] font-medium text-[#0a0a0a] dark:border-[#3a3a3d] dark:bg-[#2a2a2d] dark:text-[#fafafa]"
                    }
                  >
                    {on ? <Check className="h-4 w-4" aria-hidden /> : null}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <ChoiceTile
            label="Usage category"
            value={form.usageCategory}
            onChange={(v) => setUse("usageCategory", v)}
            filled={filledUse.has("usageCategory")}
            testId="use-usage"
            options={[
              { value: "Private", label: "Private / SUV" },
              { value: "Motorcycle", label: "Motorcycle" },
              { value: "Commercial", label: "Commercial" },
              { value: "PPV", label: "Public passenger (PPV)" },
              { value: "Trailer", label: "Trailer / heavy tractor" },
            ]}
          />
          <ChoiceTile
            label="Plate class"
            value={form.plateClass}
            onChange={(v) => setUse("plateClass", v)}
            filled={filledUse.has("plateClass")}
            testId="use-plate"
            options={[
              { value: "White", label: "White" },
              { value: "Green", label: "Green" },
              { value: "Red", label: "Red" },
            ]}
          />
          <div className="sm:col-span-2">
            <ChoiceTile
              label="Toll class"
              required
              value={form.tollClassId}
              onChange={(v) => setUse("tollClassId", v)}
              filled={filledUse.has("tollClassId")}
              loading={tollClassesLoading}
              testId="use-toll"
              options={tollClasses.map((c) => ({ value: c.id, label: c.examples ? `${c.label} — ${c.examples}` : c.label }))}
            />
          </div>
        </div>
        {form.usageCategory === "Commercial" ? (
          <label className="flex items-center gap-3 rounded-2xl bg-[#eff4ff] p-4 text-[15px] text-[#0a0a0a] dark:bg-[#1c1c1e] dark:text-[#fafafa]">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-[#cbd5e1]"
              checked={form.fitnessFirstRegistration}
              onChange={(e) => setField("fitnessFirstRegistration", e.target.checked)}
            />
            First registration (brand-new commercial fitness)
          </label>
        ) : null}
        <FlowFooter onCancel={requestCancel} hint="Step 3 of 5">
          <FlowButton tone="secondary" onClick={() => setScreen("checkRegistration")}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </FlowButton>
          <FlowButton tone="primary" disabled={vehicleUseNextDisabled} onClick={() => setScreen("confirm")} data-testid="use-next">
            Looks right — next
            <ArrowRight className="h-4 w-4" aria-hidden />
          </FlowButton>
        </FlowFooter>
      </>
    );
  } else if (screen === "confirm") {
    const r = selectedCatalogRow;
    const years = r?.production_start_year
      ? `${r.production_start_year}–${r.production_end_year ?? "on"}`
      : "";
    const subtitle = r ? [r.generation, years, r.body_type].filter(Boolean).join(" · ") : undefined;
    body = (
      <>
        <FlowTitle title="Is this your car?" subtitle={r ? "We matched your documents to this car. Check it before saving." : undefined} />
        <div className="grid grid-cols-1 gap-6 rounded-[20px] border border-black/[0.06] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:grid-cols-[1fr_260px] dark:border-[#3a3a3d]">
          {r ? (
            <CarSummary make={r.make} title={`${r.make} ${r.model}`} subtitle={subtitle} color={colorStandard} plate={form.licensePlate} />
          ) : (
            <CarSummary
              make={form.make}
              title={[form.make, form.model].filter(Boolean).join(" ") || "Your car"}
              subtitle={catalogPickerSource === "pending" ? "We'll check which version this is and let you know." : "We don't have this car yet — we'll check it and let you know."}
              color={colorStandard}
              plate={form.licensePlate}
            />
          )}
          <PictureFrame label="Your picture is made after saving" />
        </div>
        {/* Never shown (owner, 17 Nov: fleets don't pick catalogue cars). It stays mounted only so the
            automatic match runs: the selects snap casing and the picker reports one match / several / none. */}
        <section className="hidden" aria-hidden>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <CatalogFacetSelect label="Make" value={verifyMake} onChange={onMakeChange} options={makeOptions} loading={loadingMakes} optional={false} allowAny={false} emptyHint="Could not load makes" />
            <CatalogFacetSelect label="Model" value={verifyModel} onChange={onModelChange} options={modelOptions} loading={loadingModels} optional={false} allowAny={false} emptyHint={verifyMake.trim().length >= 2 ? "No models for this make" : "Pick a make first"} />
            <CatalogFacetSelect label="Year" value={verifyYear} onChange={onYearChange} options={yearOptions} loading={loadingYears} optional={false} allowAny={false} emptyHint="Pick make and model first" />
            <div className="sm:col-span-3">
              <CatalogFacetSelect label="Chassis code" value={verifyChassis} onChange={(v) => setVerifyChassis(v.toUpperCase())} options={mmyFacets.chassis_code} loading={mmyLoading} optional={false} allowAny={false} emptyHint="No chassis codes for this make, model and year" />
            </div>
            <CatalogFacetSelect label="Drivetrain" value={verifyDrivetrain} onChange={setVerifyDrivetrain} options={chassisFacets.drivetrain} loading={chassisFacetsLoading} />
            <CatalogFacetSelect label="Transmission" value={verifyTransmission} onChange={setVerifyTransmission} options={chassisFacets.transmission} loading={chassisFacetsLoading} />
          </div>
          {searchReady ? (
            <CatalogVariantPicker
              make={verifyMake}
              model={verifyModel}
              year={verifyYear}
              drivetrain={verifyDrivetrain}
              transmission={verifyTransmission}
              chassis_code={verifyChassis}
              vehicle_class={catalogClass}
              value={selectedCatalogRow?.id ?? null}
              onChange={handlePickerChange}
              disabled={saving}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-[#cbd5e1] bg-white p-3 text-[15px] text-[#47464c] dark:bg-[#2a2a2d] dark:text-[#a1a1aa]">
              Pick make, model, year and chassis to search Roam's car list.
            </p>
          )}
        </section>
        <FlowFooter onCancel={requestCancel}>
          <FlowButton tone="secondary" onClick={() => setScreen("vehicleUse")}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </FlowButton>
          <FlowButton tone="primary" disabled={!form.licensePlate.trim()} onClick={() => setScreen("odometer")} data-testid="confirm-save">
            {r ? "This is my car" : "Send for checking"}
            <Check className="h-4 w-4" aria-hidden />
          </FlowButton>
        </FlowFooter>
      </>
    );
  } else if (screen === "odometer") {
    const r = selectedCatalogRow;
    const title = r ? `${r.make} ${r.model}` : [form.make, form.model].filter(Boolean).join(" ") || "Your car";
    const subtitle = [r?.production_start_year ? String(r.production_start_year) : form.year, r?.engine_code].filter(Boolean).join(" · ");
    const problem = odometerProblem(odoUse, today);
    body = (
      <>
        <FlowTitle title="Odometer and use" subtitle="Every due date starts from this reading." />
        <div className="rounded-[20px] border border-black/[0.06] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-[#3a3a3d]">
          <CarSummary make={r?.make ?? form.make} title={title} subtitle={subtitle || undefined} color={colorStandard} plate={form.licensePlate} />
        </div>
        <OdometerUseStep value={odoUse} onChange={(p) => setOdoUse((v) => ({ ...v, ...p }))} today={today} disabled={saving} />
        <FlowFooter onCancel={requestCancel}>
          <FlowButton tone="secondary" onClick={() => setScreen("confirm")}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </FlowButton>
          <FlowButton tone="primary" busy={saving} disabled={!!problem || !form.licensePlate.trim()} onClick={() => void save()} data-testid="odometer-save">
            Save car
            <Check className="h-4 w-4" aria-hidden />
          </FlowButton>
        </FlowFooter>
      </>
    );
  } else if (screen === "saved" && saved) {
    const r = selectedCatalogRow;
    const title = r ? `${r.make} ${r.model}` : [form.make, form.model].filter(Boolean).join(" ");
    const years = r?.production_start_year ? `${r.production_start_year}–${r.production_end_year ?? "on"}` : form.year;
    const subtitle = [r?.generation, years, r?.body_type ?? form.bodyType].filter(Boolean).join(" · ");
    const st = saved.picture.status;
    const ready = st === "ready" && saved.picture.url;
    const making = (st === "queued" || st === "generating") && !saved.parked;
    const src = ready ? vehiclePictureSrc(saved.picture.url, "detail") : null;
    const frameLabel = saved.parked
      ? "Waiting for Roam to check this car"
      : making
        ? pictureWaitExpired
          ? "Still making it"
          : "Making your picture — this takes a few seconds"
        : pictureStateLabel(st as Parameters<typeof pictureStateLabel>[0]) || undefined;
    body = (
      <>
        <FlowTitle
          title="Vehicle added"
          icon={
            <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ecfdf5] text-[#059669] dark:bg-[#064e3b] dark:text-[#34d399]">
              <Check className="h-6 w-6" aria-hidden />
            </span>
          }
        />
        <div className="grid grid-cols-1 items-center gap-6 rounded-[20px] bg-[#f8fafc] p-5 sm:grid-cols-[300px_1fr] dark:bg-[#1c1c1e]">
          <div className="flex flex-col gap-2">
            <PictureFrame
              url={src?.src ?? null}
              shimmer={making && !pictureWaitExpired}
              label={frameLabel}
              chip={ready ? <StatusChip tone="green">Picture ready</StatusChip> : undefined}
            />
            {ready ? (
              <p className="text-[12px] text-[#64748b] dark:text-[#a1a1aa]">Studio picture of this model — your vehicle may look different.</p>
            ) : null}
          </div>
          <CarSummary
            make={r?.make ?? form.make}
            title={title || "Your vehicle"}
            subtitle={subtitle}
            color={colorStandard}
            plate={saved.vehicleId}
            extra={!saved.parked ? <StatusChip tone="green"><Check className="h-4 w-4" aria-hidden />Matched to Roam's car list</StatusChip> : undefined}
          />
        </div>
        {saved.parked ? (
          <Notice
            tone="amber"
            icon={<Hourglass className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
            title="Waiting for Roam to check this car"
            body="We don't have this exact car in our list yet. We'll check it and let you know — you can't assign it to a driver until then."
          />
        ) : null}
        <FlowFooter>
          {making && pictureWaitExpired ? (
            <FlowButton tone="secondary" onClick={checkAgain}>
              <RefreshCcw className="h-4 w-4" aria-hidden />
              Check again
            </FlowButton>
          ) : null}
          <FlowButton tone="secondary" onClick={resetForAnother}>
            Add another
          </FlowButton>
          <FlowButton tone="primary" onClick={() => (onGoToVehicle ? onGoToVehicle(saved.vehicleId) : onClose())}>
            Go to vehicle
            <ArrowRight className="h-4 w-4" aria-hidden />
          </FlowButton>
        </FlowFooter>
      </>
    );
  } else if (screen === "couldntRead") {
    body = (
      <>
        <ProblemScreen
          tone="red"
          title="We couldn't read this file"
          body={(problemCode && COULDNT_READ_BODY[problemCode]) || "The photo looks blurry, so the words aren't clear."}
          tips={[
            { title: "Lay the page flat", body: "Smooth down curled corners and folds.", icon: <FileText className="h-5 w-5" aria-hidden /> },
            { title: "Use good light", body: "Avoid glare and deep shadows.", icon: <Sun className="h-5 w-5" aria-hidden /> },
            { title: "Fill the frame", body: "Keep the whole page in view, straight on.", icon: <Focus className="h-5 w-5" aria-hidden /> },
          ]}
        />
        <PrivacyLine />
        <FlowFooter onCancel={requestCancel}>
          <FlowButton tone="secondary" onClick={typeDetailsInstead}>
            <Keyboard className="h-4 w-4" aria-hidden />
            Type the details
          </FlowButton>
          <FlowButton tone="primary" onClick={() => setScreen(problemDoc)}>
            <ScanLine className="h-4 w-4" aria-hidden />
            Try another file
          </FlowButton>
        </FlowFooter>
      </>
    );
  } else if (screen === "tooMany") {
    body = (
      <>
        <ProblemScreen
          tone="amber"
          title="Let's take a short break"
          body={
            problemCode === "READ_LIMIT_ORG"
              ? "Your fleet has scanned a lot of documents today — try again tomorrow, or type the details."
              : "You've scanned a lot of documents — try again in an hour, or type the details."
          }
        />
        <PrivacyLine />
        <FlowFooter onCancel={requestCancel}>
          <FlowButton tone="primary" onClick={typeDetailsInstead}>
            Type the details
            <ArrowRight className="h-4 w-4" aria-hidden />
          </FlowButton>
        </FlowFooter>
      </>
    );
  }

  return (
    <FlowShell crumb={isUpdate ? "Update a document" : "Add a vehicle"}>
      {!isUpdate ? <StepBar current={stepFor[screen]} /> : null}
      {body}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop adding this vehicle?</AlertDialogTitle>
            <AlertDialogDescription>Nothing will be saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <FlowButton tone="secondary" onClick={() => setConfirmCancel(false)}>
              Keep going
            </FlowButton>
            <FlowButton
              tone="dangerSolid"
              onClick={() => {
                setConfirmCancel(false);
                onClose();
              }}
            >
              Stop
            </FlowButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {saved ? (
        <MmFillHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} vehicleId={saved.vehicleId} />
      ) : null}
    </FlowShell>
  );
}

export default AddVehicleFlow;
