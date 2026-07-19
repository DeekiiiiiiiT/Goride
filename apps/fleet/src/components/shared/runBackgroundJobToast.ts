import { toast } from 'sonner@2.0.3';

export interface BackgroundJobToastOptions {
  /** Shown while work runs. */
  loading: string;
  /** Shown on success (string or derived from result). */
  success: string | ((result: unknown) => string);
  /** Shown on failure. */
  error?: string | ((err: unknown) => string);
}

/**
 * Leave-safe work: toast progress while a promise runs. Caller closes any dialog
 * before invoking — this does not block the UI.
 */
export async function runBackgroundJobToast<T>(
  work: () => Promise<T>,
  options: BackgroundJobToastOptions,
): Promise<T | undefined> {
  const toastId = toast.loading(options.loading);
  try {
    const result = await work();
    const successMsg =
      typeof options.success === 'function' ? options.success(result) : options.success;
    toast.success(successMsg, { id: toastId });
    return result;
  } catch (err) {
    const errorMsg =
      typeof options.error === 'function'
        ? options.error(err)
        : options.error || (err as Error)?.message || 'Something went wrong';
    toast.error(errorMsg, { id: toastId });
    return undefined;
  }
}
