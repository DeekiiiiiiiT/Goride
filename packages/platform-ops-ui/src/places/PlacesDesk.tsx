import { useState } from "react";
import { PlaceCategories } from "./PlaceCategories";
import { PlaceEditor } from "./PlaceEditor";
import { PlaceRecord } from "./PlaceRecord";
import { PlacesInbox } from "./PlacesInbox";
import { PlacesRegister } from "./PlacesRegister";
import type { PlacesStates } from "./placesApi";

export function PlacesDesk({
  apiBase,
  getToken,
  states,
  mode,
  chip,
  fixedType,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  states: PlacesStates;
  mode: "register" | "categories" | "review";
  chip?: string;
  fixedType?: string;
}) {
  const [view, setView] = useState<"list" | "edit" | "record">("list");
  const [id, setId] = useState<string | null>(null);
  if (view === "edit") {
    return <PlaceEditor apiBase={apiBase} getToken={getToken} states={states} placeId={id} onDone={(saved) => { setId(saved); setView("record"); }} />;
  }
  if (view === "record" && id) {
    return <PlaceRecord apiBase={apiBase} getToken={getToken} states={states} placeId={id} onEdit={() => setView("edit")} />;
  }
  if (mode === "categories") return <PlaceCategories apiBase={apiBase} getToken={getToken} states={states} />;
  if (mode === "review") {
    return <PlacesInbox apiBase={apiBase} getToken={getToken} states={states} chip={chip} onOpen={(placeId) => { setId(placeId); setView("record"); }} />;
  }
  return (
    <PlacesRegister
      apiBase={apiBase}
      getToken={getToken}
      states={states}
      fixedType={fixedType}
      onOpen={(next) => { setId(next); setView(next ? "record" : "edit"); }}
    />
  );
}
