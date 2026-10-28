import { PlacesDesk, PlacesInbox } from "@roam/platform-ops-ui";
import { DominionEmpty, DominionError, DominionLoading } from "../DominionStates";
import { API_ENDPOINTS } from "../../../services/apiConfig";
import { supabase } from "../../../utils/supabase/client";

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
  fixedType,
}: {
  mode: "register" | "categories" | "review";
  chip?: string;
  fixedType?: string;
}) {
  return (
    <div className="min-h-[600px] rounded-xl bg-white shadow-sm dark:bg-card">
      <PlacesDesk
        apiBase={API_ENDPOINTS.explorer}
        getToken={getToken}
        states={states}
        mode={mode}
        chip={chip}
        fixedType={fixedType}
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
