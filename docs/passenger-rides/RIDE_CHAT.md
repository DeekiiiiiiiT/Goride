# Ride P2P chat

In-app text messaging between rider and assigned driver during active trip statuses (`driver_assigned` through `on_trip`).

## Deploy

1. Apply migrations in order:
   - `supabase/migrations/20260603120000_ride_messages.sql`
   - `supabase/migrations/20260603140000_ride_messages_public_realtime.sql` (moves chat to `public` for hosted Realtime)
2. **Production:** if chat shows `Could not find the table 'public.ride_messages'`, run `supabase/scripts/ride_messages_public_fix.sql` in Supabase SQL Editor, then confirm `SELECT to_regclass('public.ride_messages');` is not null.
3. Deploy edge function: `pnpm deploy:rides` from repo root.

## API (rides edge)

- `GET /rides/v1/requests/:id/messages?limit=50&before=<iso>`
- `POST /rides/v1/requests/:id/messages` body `{ "body": "..." }`

Returns `403` with `chat_not_available` when the ride is not in an active status.

## Client

Shared UI: `@roam/ride-chat` (`RideChatHost`, `RideChatSheet`).

Realtime: `postgres_changes` on `public.ride_messages` filtered by `ride_request_id` (hosted projects do not expose the `rides` schema to Realtime).

## Notifications (client)

During an active trip, `@roam/ride-chat` listens for new messages even when the sheet is closed:

- **Unread dot** on the Message button (red badge on the icon).
- **Soft tone + short vibration** on new peer messages (debounced ~4s).
- **Rider:** brief toast with message preview.
- **Driver:** no popup toast (tone + dot only, to avoid distraction while driving).

Unread state is cleared when the chat sheet is opened. Last-read position is stored in `sessionStorage` per ride.
