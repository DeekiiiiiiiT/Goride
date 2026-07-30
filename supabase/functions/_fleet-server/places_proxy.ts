/**
 * Server-side Places for Fleet address fields.
 * Browser Places JS fails silently when the Maps key is referrer-mismatched;
 * Edge → Google with GOOGLE_MAPS_API_KEY avoids that class of outage.
 */

export type FleetPlaceSuggestion = {
  display_name: string;
  place_id: string;
};

export type FleetPlaceDetails = {
  lat: number;
  lon: number;
  address: string;
};

function mapsApiKey(): string | null {
  return Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim() || null;
}

function placeResourceName(placeId: string): string {
  const trimmed = placeId.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("places/") ? trimmed : `places/${trimmed}`;
}

async function autocompleteNew(
  input: string,
  apiKey: string,
): Promise<FleetPlaceSuggestion[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.text,suggestions.placePrediction.placeId",
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ["jm"],
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    console.error("[fleet-places] autocomplete (new) failed:", res.status, await res.text());
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

  const out: FleetPlaceSuggestion[] = [];
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

async function autocompleteLegacy(
  input: string,
  apiKey: string,
): Promise<FleetPlaceSuggestion[]> {
  const url =
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${
      encodeURIComponent(input)
    }&components=country:jm&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = (await res.json()) as {
    status?: string;
    error_message?: string;
    predictions?: Array<{ description?: string; place_id?: string }>;
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error(
      "[fleet-places] autocomplete (legacy) failed:",
      data.status,
      data.error_message ?? "",
    );
    return [];
  }

  return (data.predictions ?? [])
    .map((p) => ({
      display_name: p.description?.trim() || "Unknown location",
      place_id: p.place_id?.trim() || "",
    }))
    .filter((p) => p.place_id.length > 0);
}

export function isFleetPlacesConfigured(): boolean {
  return mapsApiKey() != null;
}

export async function fleetAutocompletePlaces(
  query: string,
): Promise<FleetPlaceSuggestion[]> {
  const input = query.trim();
  if (input.length < 3) return [];

  const apiKey = mapsApiKey();
  if (!apiKey) {
    console.error("[fleet-places] GOOGLE_MAPS_API_KEY not set");
    return [];
  }

  const fromNew = await autocompleteNew(input, apiKey);
  if (fromNew.length > 0) return fromNew;
  return autocompleteLegacy(input, apiKey);
}

async function detailsNew(
  placeId: string,
  apiKey: string,
): Promise<FleetPlaceDetails | null> {
  const resource = placeResourceName(placeId);
  if (!resource) return null;

  const res = await fetch(`https://places.googleapis.com/v1/${resource}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "location,formattedAddress,displayName",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    console.error("[fleet-places] details (new) failed:", res.status, await res.text());
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

async function detailsLegacy(
  placeId: string,
  apiKey: string,
): Promise<FleetPlaceDetails | null> {
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${
      encodeURIComponent(placeId)
    }&fields=geometry,formatted_address&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = (await res.json()) as {
    status?: string;
    error_message?: string;
    result?: {
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    };
  };

  if (data.status !== "OK") {
    console.error(
      "[fleet-places] details (legacy) failed:",
      data.status,
      data.error_message ?? "",
    );
    return null;
  }

  const lat = data.result?.geometry?.location?.lat;
  const lon = data.result?.geometry?.location?.lng;
  if (lat == null || lon == null) return null;

  return {
    lat,
    lon,
    address: data.result?.formatted_address || "",
  };
}

export async function fleetFetchPlaceDetails(
  placeId: string,
): Promise<FleetPlaceDetails | null> {
  const trimmed = placeId.trim();
  if (!trimmed) return null;

  const apiKey = mapsApiKey();
  if (!apiKey) return null;

  const fromNew = await detailsNew(trimmed, apiKey);
  if (fromNew) return fromNew;
  return detailsLegacy(trimmed, apiKey);
}
