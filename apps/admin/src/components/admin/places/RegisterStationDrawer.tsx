import { useState } from "react";
import { StationDrawer } from "../station-database/StationDrawer";
import type { StationListRow } from "../station-database/stationRegisterApi";
import { useStationDetail, useStationList, useStationMutations } from "../station-database/useStationList";

const FILTERS = {
  q: "",
  status: "",
  pcode: "",
  brand: "",
  pin: "",
  source: "",
  issue: "",
  sort: "name",
  dir: "asc" as const,
  page: 1,
};

export function RegisterStationDrawer({
  id,
  canWrite,
  onClose,
}: {
  id: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const detail = useStationDetail(id);
  const list = useStationList(FILTERS);
  const mutations = useStationMutations();
  const [notice, setNotice] = useState("");
  const place = detail.data?.place;
  if (!place) return null;
  const row: StationListRow = {
    id: place.id,
    name: place.name,
    address: place.address,
    status: place.status,
    pin_state: place.pin_state,
    geofence_m: place.geofence_m,
    plus_code: place.plus_code,
    origin_app: null,
    updated_at: place.updated_at,
    verified_at: place.verified_at,
    brand_id: place.brand_id,
    brand_name: null,
    pcode1: place.pcode,
    parish_name: place.parish,
    parish_text: place.parish,
    parish_text_mismatch: false,
    source: null,
    possible_duplicate_ids: [],
    company_style_name: false,
    price_e10_87: null,
    price_outdated: false,
    issue_count: 0,
    possible_duplicate: false,
    no_brand: !place.brand_id,
    pin_unchecked: place.pin_state === "unchecked",
    not_verified: place.status !== "verified",
    fill_count: 0,
    last_fill_at: null,
  };
  return (
    <>
      {notice ? <p className="fixed bottom-4 left-4 z-[60] rounded bg-white px-3 py-2 text-xs text-amber-700">{notice}</p> : null}
      <StationDrawer
        row={row}
        detail={detail.data}
        brands={list.data?.brands || []}
        canWrite={canWrite}
        saving={mutations.patch.isPending}
        onClose={onClose}
        onOpenEngine={() => { window.location.href = "/?page=fuel-price-engine"; }}
        onSave={(changed, reason) => {
          void mutations.patch.mutateAsync({ id, changed, reason }).catch((err: Error) => setNotice(err.message));
        }}
        onMerge={(otherId, reason) => {
          void mutations.patch.mutateAsync({ id: otherId, changed: { duplicateOf: id }, reason }).catch((err: Error) => setNotice(err.message));
        }}
      />
    </>
  );
}
