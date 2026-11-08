import { supabase } from "../../../utils/supabase/client";

const BUCKET = "catalog-maker-logos";

export function makerLogoPublicUrl(logoStoragePath: string | null | undefined): string | null {
  if (!logoStoragePath?.trim()) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(logoStoragePath.trim());
  return data.publicUrl || null;
}

export function MakerLogo({
  make,
  logoStoragePath,
  className = "",
  size = 32,
}: {
  make: string;
  logoStoragePath?: string | null;
  className?: string;
  size?: number;
}) {
  const url = makerLogoPublicUrl(logoStoragePath);
  const letter = (make.trim()[0] ?? "?").toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`rounded-full object-cover bg-surface-container shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`rounded-full bg-primary-fixed/40 text-on-primary-fixed-variant dark:bg-[#1e293b] dark:text-[#cbd5e1] font-label-md font-semibold flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
      aria-hidden
    >
      {letter}
    </span>
  );
}
