import { useEffect, useMemo, useState } from "react";
import { Fp3Screen } from "./screens/Fp3Screen";
import { Fp3AreaOverlay, FP3_OPENING_SIDE_LABEL } from "./screens/Fp3AreaOverlay";
import { buildFp3OverlayViewModel, buildFp3ViewModel, type Fp3OverlayRow, type Fp3SearchHit } from "./findPartsViewModels";
import { usePartsBrowse, usePartsSymptoms, usePartsTerm, usePartsVehicleContext } from "./findPartsQueries";
import { onFileCountForComponent, partNameForComponent, positionAwareForComponent, stepAfterPartPick } from "./findPartsRoute";

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition
    || (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition);
}

function resolvePartFromBrowse(
  browse: Parameters<typeof onFileCountForComponent>[0],
  partId: string,
): { id: string; name: string; positionAware: boolean } | null {
  if (!partId || !browse) return null;
  const name = partNameForComponent(browse, partId);
  if (!name) return null;
  return {
    id: partId,
    name,
    positionAware: positionAwareForComponent(browse, partId),
  };
}

export function PartStep({
  vehicleId,
  initialComponentId,
  initialPartName,
  onBack,
  onPick,
  onAskRoam,
}: {
  vehicleId: string;
  initialComponentId?: string;
  initialPartName?: string;
  onBack: () => void;
  onPick: (componentId: string, positionAware: boolean, name: string, onFileCount: number) => void;
  onAskRoam: (componentId: string, name: string) => void;
}) {
  const ctx = usePartsVehicleContext(vehicleId);
  const variantId = String((ctx.data as { variantId?: string | null } | undefined)?.variantId || "");
  const browse = usePartsBrowse(variantId || undefined, Boolean(vehicleId));
  const symptoms = usePartsSymptoms(variantId || undefined, Boolean(vehicleId));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChipId, setSelectedChipId] = useState(initialComponentId || "");
  const [selectedPartName, setSelectedPartName] = useState(initialPartName || "");
  const [selectedPositionAware, setSelectedPositionAware] = useState(false);
  const [overlayAreaId, setOverlayAreaId] = useState<string | null>(null);
  const [expandedNotOnFileId, setExpandedNotOnFileId] = useState("");
  const [focusedRowId, setFocusedRowId] = useState("");
  const [pickedRowId, setPickedRowId] = useState("");
  const [openingSideLabel, setOpeningSideLabel] = useState("");
  const term = usePartsTerm(searchQuery, searchQuery.trim().length >= 2);

  const browseData = browse.data as Parameters<typeof buildFp3ViewModel>[0]["browse"];
  const ctxRecord = useMemo(() => {
    const base = (ctx.data as Record<string, unknown> | undefined) ?? {};
    const avg = (base as { catalogAddAvgMinutes?: number | null }).catalogAddAvgMinutes;
    return { ...base, catalogAddAvgMinutes: avg ?? null };
  }, [ctx.data]);

  const searchHits: Fp3SearchHit[] = useMemo(() => {
    const hits = (term.data as { hits?: Array<{ id: string; plainName: string; kind?: string; note?: string; tag?: string; componentId?: string }> } | undefined)?.hits || [];
    const areas = browseData?.areas || [];
    const systems = browseData?.systems || [];
    return hits.slice(0, 8).map((hit) => {
      let positionAware = false;
      for (const area of areas) {
        const match = area.parts?.find((p) => p.id === hit.id || p.id === hit.componentId);
        if (match) {
          positionAware = Boolean(match.positionAware);
          break;
        }
      }
      if (!positionAware) {
        for (const system of systems || []) {
          const match = system.components?.find((c) => c.id === hit.id || c.id === hit.componentId);
          if (match) {
            positionAware = Boolean(match.positionAware);
            break;
          }
        }
      }
      return {
        id: hit.componentId || hit.id,
        name: hit.plainName,
        note: hit.note,
        tag: hit.tag,
        positionAware,
      };
    });
  }, [term.data, browseData]);

  useEffect(() => {
    const fromUrl = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("part")?.trim() || ""
      : "";
    const partId = initialComponentId || fromUrl;
    if (!partId || !browseData) return;
    const resolved = resolvePartFromBrowse(browseData, partId);
    if (!resolved) return;
    setSelectedChipId(resolved.id);
    setSelectedPartName(resolved.name);
    setSelectedPositionAware(resolved.positionAware);
  }, [initialComponentId, browseData]);

  const data = buildFp3ViewModel({
    ctx: ctxRecord,
    browse: browseData,
    symptoms: symptoms.data as Parameters<typeof buildFp3ViewModel>[0]["symptoms"],
    selectedChipId,
    selectedPartName,
    searchHits,
    nextHint: "",
  });

  const overlayArea = data.areas.find((a) => a.id === overlayAreaId) || null;
  const overlayData = buildFp3OverlayViewModel({
    area: overlayArea || undefined,
    browse: browseData,
    ctx: ctxRecord,
    catalogAddAvgMinutes: data.catalogAddAvgMinutes,
    expandedNotOnFileId,
  });

  useEffect(() => {
    if (overlayAreaId && overlayData?.rowsOnFile[0]) {
      setFocusedRowId(overlayData.rowsOnFile[0].id);
    }
  }, [overlayAreaId, overlayData?.rowsOnFile]);

  function selectPart(id: string, name: string, positionAware?: boolean) {
    setSelectedChipId(id);
    setSelectedPartName(name);
    setSelectedPositionAware(Boolean(positionAware));
  }

  function commitPart(id: string, name: string, positionAware?: boolean) {
    selectPart(id, name, positionAware);
    const count = onFileCountForComponent(browseData as Parameters<typeof onFileCountForComponent>[0], id);
    onPick(id, Boolean(positionAware), name, count);
  }

  function advanceNext() {
    if (!selectedChipId) return;
    commitPart(selectedChipId, selectedPartName, selectedPositionAware);
  }

  function pickFromOverlay(row: Fp3OverlayRow) {
    setPickedRowId(row.id);
    selectPart(row.id, row.name, row.positionAware);
    const nextStep = stepAfterPartPick(Number(String(row.onFileLabel).match(/^\d+/)?.[0] || 0), Boolean(row.positionAware));
    setOpeningSideLabel(nextStep === "position" ? FP3_OPENING_SIDE_LABEL : nextStep === "results" ? "Opening Results …" : "Opening request …");
    window.setTimeout(() => {
      setOverlayAreaId(null);
      setOpeningSideLabel("");
      setPickedRowId("");
      commitPart(row.id, row.name, row.positionAware);
    }, 600);
  }

  function startVoiceSearch() {
    if (typeof window === "undefined") return;
    const Ctor = (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) setSearchQuery(transcript);
    };
    recognition.onerror = () => undefined;
    recognition.start();
  }

  const vehicleDescriptor = data.vehicleLabel.startsWith("2019")
    ? data.vehicleLabel
    : `2019 ${data.vehicleLabel}`;

  return (
    <div>
      <Fp3Screen
        data={data}
        actions={{
          onBack,
          onNext: advanceNext,
          nextDisabled: !selectedChipId,
          nextHint: data.nextHint,
          onPickPart: selectPart,
          onPickProblem: (id, name, positionAware) => commitPart(id, name, positionAware),
          onOpenArea: (id) => {
            setOverlayAreaId(id);
            setExpandedNotOnFileId("");
          },
          onChangePart: () => {
            const sys = browseData?.systems?.find((s) => s.components?.some((c) => c.id === selectedChipId));
            setOverlayAreaId(sys?.id || data.areas[0]?.id || null);
          },
          onSearchChange: setSearchQuery,
          onSearchClear: () => setSearchQuery(""),
          onSearchHit: (id, name, positionAware) => commitPart(id, name, positionAware),
          onStartVoiceSearch: startVoiceSearch,
          searchQuery,
          selectedChipId,
          speechSupported: speechSupported(),
        }}
      />
      {overlayData && overlayAreaId ? (
        <>
          <Fp3AreaOverlay
            data={overlayData}
            sheet={false}
            actions={{
              onClose: () => setOverlayAreaId(null),
              onPickRow: pickFromOverlay,
              onAskRoam: (row) => {
                setOverlayAreaId(null);
                onAskRoam(row.id, row.name);
              },
              onExpandNotOnFile: (id) => {
                setExpandedNotOnFileId(id);
                setFocusedRowId(id);
              },
              onCollapseNotOnFile: () => setExpandedNotOnFileId(""),
              vehicleDescriptor,
              focusedRowId,
              onFocusRow: setFocusedRowId,
              pickedRowId,
              openingSideLabel,
            }}
          />
          <Fp3AreaOverlay
            data={overlayData}
            sheet
            actions={{
              onClose: () => setOverlayAreaId(null),
              onPickRow: pickFromOverlay,
              onAskRoam: (row) => {
                setOverlayAreaId(null);
                onAskRoam(row.id, row.name);
              },
              onExpandNotOnFile: (id) => {
                setExpandedNotOnFileId(id);
                setFocusedRowId(id);
              },
              onCollapseNotOnFile: () => setExpandedNotOnFileId(""),
              vehicleDescriptor,
              focusedRowId,
              onFocusRow: setFocusedRowId,
              pickedRowId,
              openingSideLabel,
            }}
          />
        </>
      ) : null}
    </div>
  );
}
