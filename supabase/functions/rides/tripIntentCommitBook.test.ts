import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TRIP_INTENT_QUOTE_TTL_MS } from "./fare/quoteToken.ts";
import {
  mapTripIntentForRequester,
  TRIP_INTENT_BOOK_WINDOW_MS,
} from "./tripIntents.ts";

Deno.test("TRIP_INTENT_BOOK_WINDOW_MS is 15 minutes", () => {
  assertEquals(TRIP_INTENT_BOOK_WINDOW_MS, 15 * 60_000);
});

Deno.test("TRIP_INTENT_QUOTE_TTL_MS matches book window", () => {
  assertEquals(TRIP_INTENT_QUOTE_TTL_MS, 15 * 60_000);
});

Deno.test("mapTripIntentForRequester sets can_book when claimed and in window", () => {
  const future = new Date(Date.now() + 10 * 60_000).toISOString();
  const mapped = mapTripIntentForRequester({
    id: "intent-1",
    status: "claimed",
    claimed_by_user_id: "payer-1",
    book_by_at: future,
    committed_at: new Date().toISOString(),
  });
  assertEquals(mapped.can_book, true);
});

Deno.test("mapTripIntentForRequester clears can_book when window elapsed", () => {
  const past = new Date(Date.now() - 1000).toISOString();
  const mapped = mapTripIntentForRequester({
    id: "intent-1",
    status: "claimed",
    claimed_by_user_id: "payer-1",
    book_by_at: past,
  });
  assertEquals(mapped.can_book, false);
});

Deno.test("mapTripIntentForRequester cannot book when published", () => {
  const mapped = mapTripIntentForRequester({
    id: "intent-1",
    status: "published",
    book_by_at: null,
  });
  assertEquals(mapped.can_book, false);
});
