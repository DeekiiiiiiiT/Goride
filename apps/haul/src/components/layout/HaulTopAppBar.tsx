import React from 'react';
import { Menu, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useHauler } from '../../contexts/HaulerContext';

type Props = {
  online?: boolean;
  onMenuClick?: () => void;
  onProfileClick?: () => void;
};

export function HaulTopAppBar({ online = false, onMenuClick, onProfileClick }: Props) {
  const { user } = useAuth();
  const { profile } = useHauler();
  const avatar = profile?.profilePhotoUrl ?? user?.user_metadata?.avatar_url;

  return (
    <header className="fixed top-0 z-50 flex h-[72px] w-full items-center justify-between border-b border-[#534434] bg-[#0b1326]/80 backdrop-blur-md safe-t safe-x">
      <button
        type="button"
        onClick={onMenuClick}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-1 text-[#ffc174] transition-colors hover:bg-[#2d3449] active:scale-95"
        aria-label="Menu"
      >
        <Menu className="h-7 w-7" />
      </button>

      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold tracking-wider text-[#ffc174] uppercase">RoamHaul</h1>
        {online ? (
          <span className="relative mt-0.5 flex h-3 w-3" aria-label="Status: Online">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#56e5a9] opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-[#56e5a9]" />
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onProfileClick}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#534434] transition-colors hover:border-[#ffc174] focus:ring-2 focus:ring-[#ffc174] focus:ring-offset-2 focus:ring-offset-[#0b1326] focus:outline-none"
        aria-label="Profile"
      >
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <User className="h-5 w-5 text-[#d8c3ad]" />
        )}
      </button>
    </header>
  );
}
