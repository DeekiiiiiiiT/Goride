import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';

/** A failed load. Never reuse the empty or all-clear copy for this. */
export function TollLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3" role="alert">
      <AlertTriangle className="h-8 w-8 text-rose-500" />
      <div>
        <p className="text-sm font-medium text-slate-800">Could not load toll tags</p>
        <p className="text-sm text-slate-500 mt-1 max-w-md">{message}</p>
      </div>
      <Button type="button" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
