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

/** Prefer a server-restricted key for Edge → Google calls (browser keys fail referrer checks). */
function googleMapsRidesServerKey(): string | null {
  return (
    Deno.env.get("GOOGLE_MAPS_SERVER_KEY_RIDES") ??
    googleMapsRidesApiKey()
  );
}

function placeResourceName(placeId: string): string {
  const trimmed = placeId.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("places/") ? trimmed : `places/${trimmed}`;
}

async function autocompletePlacesNew(
  input: string,
  apiKey: string,
): Promise<PlaceSuggestionDto[]> {
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
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    console.error("[places] autocomplete (new) failed:", res.status, await res.text());
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

/** Legacy Places Autocomplete — works with classic server API keys. */
async function autocompletePlacesLegacy(
  input: string,
  apiKey: string,
): Promise<PlaceSuggestionDto[]> {
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
      "[places] autocomplete (legacy) failed:",
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

/** Server-side autocomplete for Capacitor (WebView origin is https://localhost). */
export async function autocompletePlaces(query: string): Promise<PlaceSuggestionDto[]> {
  const input = query.trim();
  if (input.length < 3) return [];

  const apiKey = googleMapsRidesServerKey();
  if (!apiKey) {
    console.error(
      "[places] no API key — set GOOGLE_MAPS_SERVER_KEY_RIDES on the rides Edge function",
    );
    return [];
  }

  const fromNew = await autocompletePlacesNew(input, apiKey);
  if (fromNew.length > 0) return fromNew;

  return autocompletePlacesLegacy(input, apiKey);
}

async function fetchPlaceDetailsNew(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetailsDto | null> {
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
    console.error("[places] details (new) failed:", res.status, await res.text());
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

async function fetchPlaceDetailsLegacy(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetailsDto | null> {
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
      "[places] details (legacy) failed:",
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

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsDto | null> {
  const trimmed = placeId.trim();
  if (!trimmed) return null;

  const apiKey = googleMapsRidesServerKey();
  if (!apiKey) return null;

  const fromNew = await fetchPlaceDetailsNew(trimmed, apiKey);
  if (fromNew) return fromNew;

  return fetchPlaceDetailsLegacy(trimmed, apiKey);
}

export function isPlacesConfigured(): boolean {
  return googleMapsRidesServerKey() != null;
}

/** Server-side reverse geocode for Capacitor (browser Geocoder JS is referrer-blocked). */
export async function reverseGeocodeCoordinates(
  lat: number,
  lon: number,
): Promise<string | null> {
  const apiKey = googleMapsRidesServerKey();
  if (!apiKey) return null;

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${
      encodeURIComponent(`${lat},${lon}`)
    }&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = (await res.json()) as {
    status?: string;
    error_message?: string;
    results?: Array<{ formatted_address?: string }>;
  };

  if (data.status !== "OK" || !data.results?.[0]?.formatted_address) {
    console.error(
      "[places] reverse geocode failed:",
      data.status,
      data.error_message ?? "",
    );
    return null;
  }

  return data.results[0].formatted_address.trim();
}
