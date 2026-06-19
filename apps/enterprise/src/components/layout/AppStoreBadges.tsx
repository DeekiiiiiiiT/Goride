import { APP_DOWNLOAD } from '@/lib/navContent';

type AppStoreBadgesProps = {
  compact?: boolean;
  className?: string;
};

export function AppStoreBadges({ compact = false, className = '' }: AppStoreBadgesProps) {
  const badgeClass = compact
    ? 'flex items-center gap-2 rounded-lg border border-white/20 bg-black/80 px-3 py-2 text-white transition-colors hover:bg-black'
    : 'flex items-center gap-3 rounded-xl border border-white/20 bg-black px-5 py-3 text-white transition-colors hover:bg-white/10';

  const iconClass = compact ? 'h-5 w-5' : 'h-7 w-7';
  const titleClass = compact ? 'text-sm font-bold leading-none' : 'text-lg font-bold leading-none';
  const subtitleClass = compact ? 'text-[9px] uppercase leading-none' : 'text-[10px] uppercase leading-none';

  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      <a
        href={APP_DOWNLOAD.appStore}
        target="_blank"
        rel="noopener noreferrer"
        className={badgeClass}
        aria-label="Download on the App Store"
      >
        <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-2.86 2.45-1.28 0-1.64-1.06-3.07-1.06-1.43 0-1.84 1.06-3.12 1.06-1.15 0-2.03-1.21-2.86-2.45C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.07.87.57 0 2.04-.88 3.44-.75 1.58.03 2.96.92 3.83 2.35-3.37 2.05-2.83 7.4 1.05 9.05zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
        <div className="text-left">
          <p className={subtitleClass}>Download on the</p>
          <p className={titleClass}>App Store</p>
        </div>
      </a>
      <a
        href={APP_DOWNLOAD.googlePlay}
        target="_blank"
        rel="noopener noreferrer"
        className={badgeClass}
        aria-label="Get it on Google Play"
      >
        <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3.609 1.814L13.792 12 3.61 22.186a1.003 1.003 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z" />
        </svg>
        <div className="text-left">
          <p className={subtitleClass}>Get it on</p>
          <p className={titleClass}>Google Play</p>
        </div>
      </a>
    </div>
  );
}
