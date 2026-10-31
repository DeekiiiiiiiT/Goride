import { useEffect, useMemo, useState } from "react";
import { Fp3Screen } from "./screens/Fp3Screen";
import { buildFp3ViewModel, type Fp3SearchHit } from "./findPartsViewModels";
import { usePartsBrowse, usePartsSymptoms, usePartsTerm, usePartsVehicleContext } from "./findPartsQueries";

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

export function PartStep({
  vehicleId,
  onBack,
  onPick,
  onSkip,
}: {
  vehicleId: string;
  onBack: () => void;
  onPick: (componentId: string, positionAware: boolean, name: string) => void;
  onSkip: () => void;
}) {
  const browse = usePartsBrowse(Boolean(vehicleId));
  const symptoms = usePartsSymptoms(Boolean(vehicleId));
  const ctx = usePartsVehicleContext(vehicleId);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [selectedChipId, setSelectedChipId] = useState("");
  const [selectedPartName, setSelectedPartName] = useState("");
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

  const data = buildFp3ViewModel({
    ctx: (ctx.data as Record<string, unknown> | undefined) ?? null,
    browse: browseData,
    symptoms: symptoms.data as Parameters<typeof buildFp3ViewModel>[0]["symptoms"],
    selectedAreaId,
    selectedChipId,
    selectedPartName,
    searchHits,
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSearchQuery("");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function pickPart(id: string, name: string, positionAware?: boolean) {
    setSelectedChipId(id);
    setSelectedPartName(name);
    onPick(id, Boolean(positionAware), name);
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
          onSkipTriage: onSkip,
          onContinueToPosition: () => {
            if (selectedChipId) pickPart(selectedChipId, selectedPartName, true);
            else onPick("", true, selectedPartName || "Part");
          },
          onPickPart: pickPart,
          onPickProblem: (id, name, positionAware) => pickPart(id, name, positionAware),
          onPickServiceDue: (id, name) => pickPart(id, name, false),
          onSelectArea: (id) => setSelectedAreaId(id),
          onSelectSubChip: (chipId, name, positionAware) => pickPart(chipId, name, positionAware),
          onToggleSymptom: (id) => setOpenSymptomId((prev) => (prev === id ? "" : id)),
          onSearchChange: setSearchQuery,
          onSearchClear: () => setSearchQuery(""),
          onSearchHit: (id, name, positionAware) => pickPart(id, name, positionAware),
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
