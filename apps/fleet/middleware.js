/**
 * Vercel Edge Middleware — soft session gate for Vite SPA (Fleet).
 * Checks for Supabase auth cookie `sb-*-auth-token`.
 * SPA sessions often live in localStorage; AuthProvider remains the real gate.
 * `/admin` itself is the product-admin login surface — do not redirect-loop.
 */

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/admin/:path*", "/app", "/app/:path*"],
};

function isPublicPath(pathname) {
  if (pathname === "/" || pathname === "") return true;
  if (pathname === "/admin" || pathname === "/admin/") return true; // login surface
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
