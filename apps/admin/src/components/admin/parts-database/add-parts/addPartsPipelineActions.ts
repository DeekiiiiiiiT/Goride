import type { PartTypeRow } from "./addPartsTypes";

export function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportPartTypesSpecsJson(types: PartTypeRow[]) {
  const payload = types.map((t) => ({
    id: t.id,
    opCode: t.opCode,
    name: t.name,
    defaultFitMode: t.defaultFitMode,
    positionScheme: t.positionScheme,
    tradeTerm: t.tradeTerm,
    specFields: t.specFields,
  }));
  downloadJsonFile("add-parts-spec-schema.json", payload);
}

export const AP11_GALLERY_FRAMES = [
  { id: "duplicate", title: "Duplicate conflict", component: "PartExistsPanel" },
  { id: "request-car", title: "Request car", component: "RequestCarPanel" },
  { id: "request-engine", title: "Request engine", component: "RequestEnginePanel" },
  { id: "source-missing", title: "Missing source URL", component: "RequestCheckingSourcePanel" },
  { id: "source-needs-check", title: "Needs checking source", component: "RequestCheckingSourcePanel" },
  { id: "ask-part-type", title: "Ask part type", component: "AskPartTypePanel" },
] as const;

export function exportAp11TestCasesJson() {
  downloadJsonFile("add-parts-ap11-test-cases.json", {
    screen: "AP11",
    frames: AP11_GALLERY_FRAMES,
    exportedAt: new Date().toISOString(),
  });
}
