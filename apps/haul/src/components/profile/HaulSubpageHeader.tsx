import React from 'react';

type Props = {
  title: string;
  onBack: () => void;
  variant?: 'default' | 'centered-primary';
  rightSlot?: React.ReactNode;
};

export function HaulSubpageHeader({ title, onBack, variant = 'default', rightSlot }: Props) {
  const centered = variant === 'centered-primary';

  return (
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-[#534434] bg-[#0b1326]/90 px-4 backdrop-blur-md">
      <button
        type="button"
        onClick={onBack}
        className="flex h-11 w-11 items-center justify-center rounded-full text-[#dae2fd] transition-colors hover:bg-[#2d3449]/50 active:scale-95"
        aria-label="Go back"
      >
        <span className="material-symbols-outlined">arrow_back</span>
      </button>
      {centered ? (
        <h1 className="absolute left-1/2 -translate-x-1/2 text-xl font-semibold tracking-tight text-[#ffc174]">
          {title}
        </h1>
      ) : (
        <h1 className="ml-2 flex-1 text-lg font-semibold text-[#dae2fd]">{title}</h1>
      )}
      {rightSlot ?? <div className="h-11 w-11" />}
    </header>
  );
}
