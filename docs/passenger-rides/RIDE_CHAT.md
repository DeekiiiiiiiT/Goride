# Ride P2P chat

In-app text messaging between rider and assigned driver during active trip statuses (`driver_assigned` through `on_trip`).

## Deploy

1. Apply migrations in order:
   - `supabase/migrations/20260603120000_ride_messages.sql`
   - `supabase/migrations/20260603140000_ride_messages_public_realtime.sql` (moves chat to `public` for hosted Realtime)
2. Deploy edge function: `pnpm deploy:rides` from repo root.

## API (rides edge)

- `GET /rides/v1/requests/:id/messages?limit=50&before=<iso>`
- `POST /rides/v1/requests/:id/messages` body `{ "body": "..." }`

Returns `403` with `chat_not_available` when the ride is not in an active status.

## Client

Shared UI: `@roam/ride-chat` (`RideChatHost`, `RideChatSheet`).

Realtime: `postgres_changes` on `public.ride_messages` filtered by `ride_request_id` (hosted projects do not expose the `rides` schema to Realtime).
