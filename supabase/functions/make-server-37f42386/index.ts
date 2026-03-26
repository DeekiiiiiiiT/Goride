// Supabase Edge Function entrypoint wrapper.
// The repo’s actual server implementation lives under `src/supabase/functions/server/index.tsx`.
// The Supabase CLI expects an entrypoint at `supabase/functions/<function-name>/index.ts`.

export { default } from "../../../src/supabase/functions/server/index.tsx";

