/** Client mirror of public.self_serve_link_frame_codes for pre-tick (D3). */
export function parseFrameCodesFromUrl(url: string): string[] {
  const u = url.trim();
  if (!u || !/^https?:\/\//i.test(u)) return [];
  let path = u.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]+/i, "");
  const codes = new Set<string>();
  for (const seg of path.split("/")) {
    if (/^[A-Za-z]{1,4}\d{2,4}[A-Za-z]?(-[A-Za-z0-9]+)?$/i.test(seg)) {
      const prefix = seg.split("-")[0]!.toUpperCase();
      if (/^[A-Z]{1,4}\d{2,4}[A-Z]?$/.test(prefix)) codes.add(prefix);
    }
  }
  return [...codes];
}
