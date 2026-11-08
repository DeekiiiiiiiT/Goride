import { EVERYDAY_CAPTURE_PLATE } from "./everydayCaptureConstants";

export const ROOMY_DISPLAY_LABEL = "Toyota Roomy 2019";

type CarLabelInput = {
  ctxLabel?: string;
  myVehicleLabel?: string;
  findCar?: { make?: string; model?: string; year?: number; label?: string };
  make?: string;
  model?: string;
  year?: number | null;
  capturePlate?: string;
  plate?: string;
};

/** Plain "Make Model Year" for headers — never empty on Roomy capture. */
export function formatEverydayCarLabel(input: CarLabelInput): string {
  const ctxLabel = input.ctxLabel?.trim();
  if (ctxLabel) {
    const normalized = ctxLabel.replace(/\s+/g, " ").trim();
    if (normalized && !/^undefined|null/i.test(normalized)) {
      if (/^\d{4}\s/.test(normalized)) {
        const parts = normalized.split(/\s+/);
        if (parts.length >= 3) return `${parts[1]} ${parts[2]} ${parts[0]}`;
      }
      return normalized;
    }
  }

  const myLabel = input.myVehicleLabel?.trim();
  if (myLabel) {
    if (/^\d{4}\s/.test(myLabel)) {
      const parts = myLabel.split(/\s+/);
      if (parts.length >= 3) return `${parts[1]} ${parts[2]} ${parts[0]}`;
    }
    return myLabel;
  }

  const fc = input.findCar;
  if (fc?.label?.trim()) return fc.label.trim();
  if (fc?.make && fc?.model && fc?.year) return `${fc.make} ${fc.model} ${fc.year}`;

  const make = input.make?.trim() || "";
  const model = input.model?.trim() || "";
  const year = input.year;
  if (make && model && year) return `${make} ${model} ${year}`;
  if (make && model) return `${make} ${model}`;
  if (make) return make;

  const plate = (input.plate || input.capturePlate || "").toUpperCase();
  if (plate === EVERYDAY_CAPTURE_PLATE) return ROOMY_DISPLAY_LABEL;

  return "";
}
