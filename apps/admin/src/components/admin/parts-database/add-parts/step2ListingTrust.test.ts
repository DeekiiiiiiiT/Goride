import { describe, expect, it } from "vitest";
import type { SelfServePreview } from "./addPartsApi";
import { applyPreviewListingTrust, patchSpecificListing } from "./addPartsShared";
import { emptyDraft, type AddPartsDraft } from "./addPartsTypes";

const previewConfirmed: SelfServePreview = {
  carCount: 1,
  oeExtraCarCount: 0,
  totalReach: 1,
  listingTrustPreview: [{ catalogId: "v-roomy", trust: "confirmed" }],
};

describe("step2 listing trust (5-01)", () => {
  it("keeps owner Needs checking when preview refetches as Confirmed", () => {
    const listings: AddPartsDraft["listings"] = [
      {
        vehicleId: "v-roomy",
        listingTrust: "needs_checking",
        listingTrustManual: true,
        yearFrom: 2019,
        yearTo: 2020,
      },
    ];
    const next = applyPreviewListingTrust(listings, previewConfirmed);
    expect(next[0]?.listingTrust).toBe("needs_checking");
  });

  it("keeps Needs checking after Change years save", () => {
    let draft = emptyDraft();
    draft = {
      ...draft,
      listings: [
        {
          vehicleId: "v-roomy",
          listingTrust: "needs_checking",
          listingTrustManual: true,
          yearFrom: 2019,
          yearTo: 2020,
        },
      ],
    };
    draft = patchSpecificListing(draft, "v-roomy", { yearFrom: 2018, yearTo: 2022 });
    const afterPreview = applyPreviewListingTrust(draft.listings, previewConfirmed);
    expect(afterPreview[0]?.listingTrust).toBe("needs_checking");
    expect(afterPreview[0]?.yearFrom).toBe(2018);
    expect(afterPreview[0]?.yearTo).toBe(2022);
  });
});
