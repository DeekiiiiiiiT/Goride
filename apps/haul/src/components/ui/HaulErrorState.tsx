import React from 'react';

type Props = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function HaulErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: Props) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-[#ffb4ab]/30 bg-[#93000a]/10 p-8 text-center">
      <span
        className="material-symbols-outlined mb-3 text-[48px] text-[#ffb4ab]"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        error
      </span>
      <h3 className="mb-1 text-lg font-semibold text-[#dae2fd]">{title}</h3>
      <p className="mb-4 max-w-sm text-sm text-[#d8c3ad]">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-[#ffc174] px-4 text-sm font-medium text-[#ffc174] hover:bg-[#ffc174]/10"
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
          Try again
        </button>
      ) : null}
    </div>
  );
}
