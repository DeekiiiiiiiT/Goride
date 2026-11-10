export type EverydayStep =
  | "car"
  | "notVerified"
  | "home"
  | "search"
  | "brakes"
  | "answer"
  | "alsoFits"
  | "request"
  | "requests"
  | "trustDemo"
  | "stateLoading"
  | "stateError"
  | "stateOffline";

export type CaptureState = {
  step: EverydayStep;
  answerVariant?: "pads" | "calipers" | "cables" | "shoes";
  openAlsoFits?: boolean;
  openTrust?: "verified" | "check";
  searchQuery?: string;
  requestSent?: boolean;
  partTypeId?: string;
};

const FOLDER_TO_CAPTURE: Record<string, CaptureState> = {
  find_parts_which_car_is_it_for: { step: "car" },
  car_home_what_do_you_need_toyota_roomy: { step: "home" },
  brakes_for_your_roomy_front_rear_whole_car: { step: "brakes" },
  front_brake_pads_the_answer_04465_b1190: { step: "answer", answerVariant: "pads", partTypeId: "cmp-brake-pads" },
  parts_with_left_right_numbered_sets_roam_fleet: { step: "answer", answerVariant: "calipers", partTypeId: "cmp-brake-caliper" },
  every_car_the_front_pads_fit_cross_maker_matrix_roam_fleet: { step: "alsoFits", openAlsoFits: true, partTypeId: "cmp-brake-pads" },
  trust_badge_popovers_verified_check_before_buying: { step: "trustDemo", openTrust: "verified" },
  a_part_we_don_t_have_yet_ask_roam_to_find_it: { step: "request", partTypeId: "cmp-shock" },
  search_results_pads_no_results_state_toyota_roomy: { step: "search", searchQuery: "pads" },
  your_requests_tracking_status_roam_fleet: { step: "requests" },
  states_loading_couldn_t_load_car_we_don_t_know_yet_offline: { step: "stateLoading" },
  phone_390px_car_home_part_answer_every_car_sheet: { step: "home" },
};

export function captureFromSearchParams(params: URLSearchParams): CaptureState | null {
  const raw = params.get("findPartsCapture")?.trim();
  if (!raw) return null;
  const state = params.get("findPartsCaptureState")?.trim();
  const base = FOLDER_TO_CAPTURE[raw];
  if (!base) return null;
  if (raw === "parts_with_left_right_numbered_sets_roam_fleet" && state === "calipers") {
    return { step: "answer", answerVariant: "calipers", partTypeId: "cmp-brake-caliper" };
  }
  if (raw === "states_loading_couldn_t_load_car_we_don_t_know_yet_offline" && state) {
    if (state === "error") return { step: "stateError" };
    if (state === "offline") return { step: "stateOffline" };
    if (state === "loading") return { step: "stateLoading" };
  }
  if (raw === "parts_with_left_right_numbered_sets_roam_fleet" && state === "cables") {
    return { step: "answer", answerVariant: "cables", partTypeId: "cmp-handbrake-cable" };
  }
  if (raw === "parts_with_left_right_numbered_sets_roam_fleet" && state === "shoes") {
    return { step: "answer", answerVariant: "shoes", partTypeId: "cmp-brake-shoes" };
  }
  if (raw === "search_results_pads_no_results_state_toyota_roomy" && state === "none") {
    return { step: "search", searchQuery: "turbo hose" };
  }
  if (raw === "a_part_we_don_t_have_yet_ask_roam_to_find_it" && state === "sent") {
    return { step: "request", requestSent: true, partTypeId: "cmp-shock" };
  }
  if (raw === "phone_390px_car_home_part_answer_every_car_sheet" && state === "answer") {
    return { step: "answer", answerVariant: "pads", partTypeId: "cmp-brake-pads" };
  }
  if (raw === "phone_390px_car_home_part_answer_every_car_sheet" && state === "alsoFits") {
    return { step: "alsoFits", openAlsoFits: true, partTypeId: "cmp-brake-pads" };
  }
  return { ...base };
}

export function isEverydayCaptureFolder(value: string): boolean {
  return value in FOLDER_TO_CAPTURE;
}
