/**
 * Resolve driver display labels for admin presence / directory views.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ProfileRow = {
  user_id?: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
};

function serviceAuth() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export function resolveProfileDisplayName(profile: ProfileRow | null | undefined): string | null {
  if (!profile) return null;
  const explicit = typeof profile.display_name === "string" ? profile.display_name.trim() : "";
  if (explicit) return explicit;
  const fromParts = [profile.first_name, profile.last_name]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim())
    .join(" ");
  return fromParts || null;
}

function authUserDisplayName(meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  const full = meta.full_name ?? meta.name;
  if (typeof full === "string" && full.trim()) return full.trim();
  const parts = [meta.first_name, meta.last_name]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim())
    .join(" ");
  return parts || null;
}

export async function enrichDriverIdentities<
  T extends { driver_id: string; display_name: string | null; email: string | null },
>(
  drivers: T[],
  profiles: ProfileRow[],
): Promise<(T & { phone: string | null })[]> {
  if (drivers.length === 0) return [];

  const profileByUser = new Map(
    profiles
      .filter((p) => p.user_id)
      .map((p) => [p.user_id as string, p]),
  );

  const auth = serviceAuth();
  return Promise.all(
    drivers.map(async (d) => {
      const profile = profileByUser.get(d.driver_id);
      let display_name = resolveProfileDisplayName(profile);
      let email: string | null = null;
      let phone = typeof profile?.phone === "string" ? profile.phone.trim() || null : null;

      try {
        const { data } = await auth.auth.admin.getUserById(d.driver_id);
        const user = data.user;
        if (user) {
          email = user.email ?? null;
          if (!display_name) {
            display_name = authUserDisplayName(user.user_metadata as Record<string, unknown>);
          }
          if (!phone && typeof user.phone === "string" && user.phone.trim()) {
            phone = user.phone.trim();
          }
        }
      } catch {
        /* keep profile-only identity */
      }

      return {
        ...d,
        display_name,
        email,
        phone,
      };
    }),
  );
}
