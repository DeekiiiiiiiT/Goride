import { useState } from "react";
import { PlacesDesk, PlacesInbox } from "@roam/platform-ops-ui";
import { DominionEmpty, DominionError, DominionLoading } from "../DominionStates";
import { API_ENDPOINTS } from "../../../services/apiConfig";
import { supabase } from "../../../utils/supabase/client";
import { RegisterStationDrawer } from "./RegisterStationDrawer";
import "./categories.css";

const states = {
  Loading: DominionLoading,
  Empty: DominionEmpty,
  Error: DominionError,
};

async function getToken() {
  return (await supabase.auth.getSession()).data.session?.access_token ?? null;
}

export function PlacesPage({
  mode,
  chip,
  canWrite = false,
}: {
  mode: "register" | "categories" | "review";
  chip?: string;
  fixedType?: string;
  canWrite?: boolean;
}) {
  const [stationId, setStationId] = useState<string | null>(null);
  if (mode === "categories") {
    return (
      <div className="categories-stitch min-h-[600px] bg-surface text-on-surface">
        <PlacesDesk
          apiBase={API_ENDPOINTS.explorer}
          getToken={getToken}
          states={states}
          mode={mode}
          canWrite={canWrite}
        />
      </div>
    );
  }
  if (mode === "register") {
    return (
      <div className="register-stitch min-h-[600px] bg-surface text-on-surface">
        <PlacesDesk
          apiBase={API_ENDPOINTS.explorer}
          getToken={getToken}
          states={states}
          mode={mode}
          chip={chip}
          canWrite={canWrite}
          onOpenStation={setStationId}
        />
        {stationId ? <RegisterStationDrawer id={stationId} canWrite={canWrite} onClose={() => setStationId(null)} /> : null}
      </div>
    );
  }
  return (
    <div className="min-h-[600px] rounded-xl bg-white shadow-sm dark:bg-card">
      <PlacesDesk
        apiBase={API_ENDPOINTS.explorer}
        getToken={getToken}
        states={states}
        mode={mode}
        chip={chip}
      />
    </div>
  );
}

export function FuelPlacesReview() {
  return (
    <PlacesInbox
      apiBase={API_ENDPOINTS.explorer}
      getToken={getToken}
      states={states}
      chip="learnt"
    />
  );
}
