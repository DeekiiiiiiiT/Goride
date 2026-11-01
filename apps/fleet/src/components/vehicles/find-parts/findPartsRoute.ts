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
