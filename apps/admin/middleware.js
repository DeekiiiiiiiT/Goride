/**
 * Vercel Edge Middleware — soft session gate for Vite SPA.
 * Checks for Supabase auth cookie `sb-*-auth-token`.
 * SPA sessions often live in localStorage; AuthProvider remains the real gate.
 * Cookie check covers future cookie storage + soft edge redirect UX.
 */

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/admin", "/admin/:path*", "/app", "/app/:path*"],
};

/** Allow login/auth/assets without redirect. */
function isPublicPath(pathname) {
  if (pathname === "/" || pathname === "") return true;
  const allow = ["/login", "/auth", "/signup", "/reset-password", "/assets"];
  return allow.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function hasSupabaseAuthCookie(cookieHeader) {
  if (!cookieHeader) return false;
  return /(?:^|;\s*)sb-[^=]+-auth-token=/.test(cookieHeader);
}

export default function middleware(request) {
  const url = new URL(request.url);
  const { pathname } = url;

  // Static assets + public auth surfaces
  if (
    isPublicPath(pathname) ||
    pathname.startsWith("/assets/") ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return;
  }

  const cookie = request.headers.get("cookie") || "";
  if (!hasSupabaseAuthCookie(cookie)) {
    const login = new URL("/", request.url);
    login.searchParams.set("next", pathname);
    return Response.redirect(login, 307);
  }
}
