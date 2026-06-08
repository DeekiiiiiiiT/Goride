import React from 'react';
import { Plus } from 'lucide-react';

type Props = {
  onClick: () => void;
  hidden?: boolean;
};

export function TrustedContactsFab({ onClick, hidden }: Props) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      style={{ backgroundColor: '#1A1A1A' }}
      aria-label="Add trusted contact"
    >
      <Plus className="h-7 w-7" aria-hidden />
    </button>
  );
}
