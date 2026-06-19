import React from 'react';

type Props = {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void; icon?: string };
};

export function HaulEmptyState({ icon = 'inbox', title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#534434] bg-[#171f33]/50 p-8 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-[#534434]/50 bg-[#2d3449] shadow-inner">
        <span className="material-symbols-outlined text-[40px] text-[#534434]">{icon}</span>
      </div>
      <h3 className="mb-2 text-xl font-bold text-[#dae2fd]">{title}</h3>
      {description ? <p className="mb-6 max-w-sm text-[#d8c3ad]">{description}</p> : null}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="flex min-h-11 items-center gap-2 rounded-full bg-[#ffc174] px-6 py-3 text-sm font-medium text-[#472a00] hover:bg-[#ffddb8] active:scale-95"
        >
          {action.icon ? <span className="material-symbols-outlined">{action.icon}</span> : null}
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
