import { mediaPublicUrl } from "@roam/roam-shared";

/** Logo keys live in Cloudflare R2 (roam-public), served from media.roamfleet.co. */
export function makerLogoPublicUrl(logoStoragePath: string | null | undefined): string | null {
  return mediaPublicUrl(logoStoragePath);
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
