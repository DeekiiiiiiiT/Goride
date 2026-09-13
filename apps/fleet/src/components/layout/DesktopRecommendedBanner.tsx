import { Monitor } from 'lucide-react';
import { useIsMobile } from '../ui/use-mobile';
import { cn } from '../ui/utils';

type Props = {
  message: string;
  className?: string;
};

/** Polite Tier C notice — does not block the page. */
export function DesktopRecommendedBanner({ message, className }: Props) {
  const isMobile = useIsMobile();
  if (!isMobile) return null;

  return (
    <div
      role="note"
      className={cn(
        'mb-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
        className,
      )}
    >
      <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      <p>{message}</p>
    </div>
  );
}
