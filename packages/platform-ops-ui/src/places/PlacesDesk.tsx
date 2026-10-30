import { CategoriesPage } from "./categories/CategoriesPage";
import { PlacesReview } from "./PlacesReview";
import { RegisterPage } from "./register/RegisterPage";
import type { PlacesStates } from "./placesApi";

export function PlacesDesk({
  apiBase,
  getToken,
  states,
  mode,
  canWrite = false,
  onOpenStation,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  states: PlacesStates;
  mode: "register" | "categories" | "review";
  chip?: string;
  fixedType?: string;
  canWrite?: boolean;
  onOpenStation?: (id: string) => void;
}) {
  if (mode === "categories") {
    return <CategoriesPage apiBase={apiBase} getToken={getToken} canWrite={canWrite} />;
  }
  if (mode === "review") {
    return <PlacesReview apiBase={apiBase} getToken={getToken} />;
  }
  return (
    <RegisterPage
      apiBase={apiBase}
      getToken={getToken}
      states={states}
      canWrite={canWrite}
      onOpenStation={onOpenStation}
    />
  );
}
