type BrowseComponent = { id: string; count?: number; positionAware?: boolean; plainName?: string; name?: string };

type BrowseShape = {
  systems?: Array<{ components?: BrowseComponent[] }>;
  common?: BrowseComponent[];
  areas?: Array<{ parts?: BrowseComponent[] }>;
};

export function partNameForComponent(browse: BrowseShape | undefined, componentId: string): string {
  if (!componentId || !browse) return "";
  for (const system of browse.systems || []) {
    const match = system.components?.find((row) => row.id === componentId);
    if (match) return String(match.plainName || match.name || "");
  }
  for (const area of browse.areas || []) {
    const match = area.parts?.find((row) => row.id === componentId);
    if (match) return String(match.name || "");
  }
  const common = browse.common?.find((row) => row.id === componentId);
  if (common) return String(common.plainName || common.name || "");
  return "";
}

export function positionAwareForComponent(browse: BrowseShape | undefined, componentId: string): boolean {
  if (!componentId || !browse) return false;
  for (const system of browse.systems || []) {
    const match = system.components?.find((row) => row.id === componentId);
    if (match) return Boolean(match.positionAware);
  }
  for (const area of browse.areas || []) {
    const match = area.parts?.find((row) => row.id === componentId);
    if (match) return Boolean(match.positionAware);
  }
  const common = browse.common?.find((row) => row.id === componentId);
  if (common) return Boolean(common.positionAware);
  return false;
}

export function stepFromPartDeepLink(
  params: Pick<URLSearchParams, "get">,
  browse?: BrowseShape,
): "position" | "results" | "request" {
  const partId = params.get("part");
  if (!partId) return "request";
  if (params.get("fit") || params.get("pos")) return "results";
  if (!browse) return "position";
  const onFile = onFileCountForComponent(browse, partId);
  return stepAfterPartPick(onFile, positionAwareForComponent(browse, partId));
}

export function onFileCountForComponent(browse: BrowseShape | undefined, componentId: string): number {
  if (!componentId || !browse) return 0;
  for (const system of browse.systems || []) {
    const match = system.components?.find((row) => row.id === componentId);
    if (match) return Number(match.count ?? 0);
  }
  for (const area of browse.areas || []) {
    const match = area.parts?.find((row) => row.id === componentId);
    if (match) return Number(match.count ?? 0);
  }
  const common = browse.common?.find((row) => row.id === componentId);
  if (common) return Number(common.count ?? 0);
  return 0;
}

export function stepAfterPartPick(onFileCount: number, positionAware: boolean): "position" | "results" | "request" {
  if (onFileCount <= 0) return "request";
  if (positionAware) return "position";
  return "results";
}

export function clearFindPartsFitState(): { position: string; side: string; fitParam: string } {
  return { position: "", side: "", fitParam: "" };
}

export function findPartsUrlAfterNewPartPick(vehicleId: string, partId: string) {
  return {
    vehicle: vehicleId,
    part: partId,
    pos: "",
    side: "",
    fit: "",
  };
}

export function findPartsPositionLabel(position: string | null | undefined): string {
  if (!position) return "—";
  if (position === "rear") return "Rear axle";
  if (position === "both") return "Front and rear";
  if (position === "front") return "Front axle";
  if (position === "left" || position === "right") {
    return position.charAt(0).toUpperCase() + position.slice(1);
  }
  return position;
}

export type AddPartInfoRequestInput = {
  vehicleId: string | null;
  componentId: string;
  partName?: string;
  note?: string;
  matchType?: string | null;
  fitParam?: string;
  position?: string | null;
  vehicleCatalogId?: string;
  photoUrl?: string;
};

/** Body for fleet-core POST /find-parts/request (add_part_info). */
export function buildAddPartInfoRequestBody(input: AddPartInfoRequestInput): Record<string, unknown> {
  const position = input.position || "";
  const body: Record<string, unknown> = {
    kind: "add_part_info",
    vehicleId: input.vehicleId,
    componentId: input.componentId || undefined,
    maintenanceComponentId: input.componentId || undefined,
    partName: input.partName || undefined,
    note: input.note,
    matchType: input.matchType || undefined,
    vehicleCatalogId: input.vehicleCatalogId || undefined,
    photoUrl: input.photoUrl,
  };
  if (input.fitParam) body.fit = input.fitParam;
  if (position === "left" || position === "right") body.side = position;
  else if (position && !["left", "right", "both"].includes(position)) body.position = position;
  return body;
}
