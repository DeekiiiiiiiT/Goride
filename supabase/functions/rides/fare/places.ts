import { googleMapsRidesApiKey } from "./routing.ts";

export type PlaceSuggestionDto = {
  display_name: string;
  place_id: string;
};

export type PlaceDetailsDto = {
  lat: number;
  lon: number;
  address: string;
};

function placeResourceName(placeId: string): string {
  const trimmed = placeId.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("places/") ? trimmed : `places/${trimmed}`;
}

/** Places API (New) — server-side autocomplete for Capacitor (https://localhost origin). */
export async function autocompletePlaces(query: string): Promise<PlaceSuggestionDto[]> {
  const input = query.trim();
  if (input.length < 3) return [];

  const apiKey = googleMapsRidesApiKey();
  if (!apiKey) return [];

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "suggestions.placePrediction.text,suggestions.placePrediction.placeId",
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ["jm"],
    }),
  });

  if (!res.ok) {
    console.error("[places] autocomplete failed:", res.status, await res.text());
    return [];
  }

  const data = (await res.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        text?: { text?: string };
        placeId?: string;
      };
    }>;
  };

  const out: PlaceSuggestionDto[] = [];
  for (const suggestion of data.suggestions ?? []) {
    const pred = suggestion.placePrediction;
    const placeId = pred?.placeId?.trim();
    if (!placeId) continue;
    out.push({
      display_name: pred?.text?.text?.trim() || "Unknown location",
      place_id: placeId,
    });
  }
  return out;
}

/** Places API (New) — resolve place id to coordinates + formatted address. */
export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsDto | null> {
  const resource = placeResourceName(placeId);
  if (!resource) return null;

  const apiKey = googleMapsRidesApiKey();
  if (!apiKey) return null;

  const res = await fetch(`https://places.googleapis.com/v1/${resource}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "location,formattedAddress,displayName",
    },
  });

  if (!res.ok) {
    console.error("[places] details failed:", res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as {
    location?: { latitude?: number; longitude?: number };
    formattedAddress?: string;
    displayName?: string | { text?: string };
  };

  const lat = data.location?.latitude;
  const lon = data.location?.longitude;
  if (lat == null || lon == null) return null;

  const displayName =
    typeof data.displayName === "string"
      ? data.displayName
      : data.displayName?.text;

  return {
    lat,
    lon,
    address: data.formattedAddress || displayName || "",
  };
}
