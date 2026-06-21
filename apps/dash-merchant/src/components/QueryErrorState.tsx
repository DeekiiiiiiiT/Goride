import { MaterialIcon } from '../signup/components/MaterialIcon';

interface QueryErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export default function QueryErrorState({
  title = 'Something went wrong',
  message = 'We could not load this section. Check your connection and try again.',
  onRetry,
}: QueryErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest p-xl text-center">
      <MaterialIcon name="error_outline" className="mb-3 text-error" size={40} />
      <h3 className="mb-2 text-headline-md font-semibold text-on-surface">{title}</h3>
      <p className="mb-4 max-w-sm text-body-sm text-on-surface-variant">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-primary-container px-md py-sm text-label-md font-semibold text-on-primary-container transition-colors hover:bg-primary-fixed-dim"
        >
          Try again
        </button>
      )}
    </div>
  );
}
