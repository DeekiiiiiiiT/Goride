import { useEffect, useMemo, useState } from "react";
import { Fp3Screen } from "./screens/Fp3Screen";
import { buildFp3ViewModel, type Fp3SearchHit } from "./findPartsViewModels";
import { usePartsBrowse, usePartsSymptoms, usePartsTerm, usePartsVehicleContext } from "./findPartsQueries";
import { onFileCountForComponent, partNameForComponent, positionAwareForComponent } from "./findPartsRoute";

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
  onSkip,
}: {
  vehicleId: string;
  initialComponentId?: string;
  initialPartName?: string;
  onBack: () => void;
  onPick: (componentId: string, positionAware: boolean, name: string, onFileCount: number) => void;
  onSkip: () => void;
}) {
  const ctx = usePartsVehicleContext(vehicleId);
  const variantId = String((ctx.data as { variantId?: string | null } | undefined)?.variantId || "");
  const browse = usePartsBrowse(variantId || undefined, Boolean(vehicleId));
  const symptoms = usePartsSymptoms(variantId || undefined, Boolean(vehicleId));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [selectedChipId, setSelectedChipId] = useState(initialComponentId || "");
  const [selectedPartName, setSelectedPartName] = useState(initialPartName || "");
  const [selectedPositionAware, setSelectedPositionAware] = useState(false);
  const [openSymptomId, setOpenSymptomId] = useState("");
  const term = usePartsTerm(searchQuery, searchQuery.trim().length >= 2);

  const browseData = browse.data as Parameters<typeof buildFp3ViewModel>[0]["browse"];
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

  const nextHint = selectedAreaId && !selectedChipId ? "Pick a part below" : "";

  const data = buildFp3ViewModel({
    ctx: (ctx.data as Record<string, unknown> | undefined) ?? null,
    browse: browseData,
    symptoms: symptoms.data as Parameters<typeof buildFp3ViewModel>[0]["symptoms"],
    selectedAreaId,
    selectedChipId,
    selectedPartName,
    searchHits,
    nextHint,
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSearchQuery("");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!selectedAreaId && data.areas[0]?.id) setSelectedAreaId(data.areas[0].id);
  }, [data.areas, selectedAreaId]);

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

  const activeArea = data.areas.find((a) => a.id === selectedAreaId) || data.areas[0];

  return (
    <div>
      <Fp3Screen
        data={data}
        activeArea={activeArea}
        actions={{
          onBack,
          onNext: advanceNext,
          nextDisabled: !selectedChipId,
          nextHint: data.nextHint,
          onPickPart: selectPart,
          onPickProblem: (id, name, positionAware) => commitPart(id, name, positionAware),
          onSelectArea: (id) => setSelectedAreaId(id),
          onSelectSubChip: (chipId, name, positionAware) => selectPart(chipId, name, positionAware),
          onToggleSymptom: (id) => setOpenSymptomId((prev) => (prev === id ? "" : id)),
          onSearchChange: setSearchQuery,
          onSearchClear: () => setSearchQuery(""),
          onSearchHit: (id, name, positionAware) => commitPart(id, name, positionAware),
          onStartVoiceSearch: startVoiceSearch,
          searchQuery,
          selectedAreaId: selectedAreaId || activeArea?.id || "",
          openSymptomId,
          speechSupported: speechSupported(),
        }}
      />
    </div>
  );
}
