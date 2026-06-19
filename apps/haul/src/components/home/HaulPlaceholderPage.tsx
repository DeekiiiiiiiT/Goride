import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useHauler } from '../../contexts/HaulerContext';
import { haulPrimaryBtn } from '../auth/haulAuthUi';

type Props = {
  title: string;
  description?: string;
};

export function HaulPlaceholderPage({ title, description }: Props) {
  return (
    <div className="flex flex-col gap-4 py-8 text-center">
      <h2 className="text-xl font-bold text-[#dae2fd]">{title}</h2>
      {description ? <p className="text-[#d8c3ad]">{description}</p> : null}
    </div>
  );
}

export function HaulProfilePage({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth();
  const { profile } = useHauler();

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[#dae2fd]">{profile?.displayName ?? 'Your profile'}</h2>
        <p className="mt-1 text-[#d8c3ad]">{user?.email ?? user?.phone}</p>
      </div>
      <p className="text-center text-sm text-[#d8c3ad]">
        Compliance documents from onboarding are stored in your account.
      </p>
      <button type="button" onClick={onSignOut} className={haulPrimaryBtn}>
        Sign out
      </button>
    </div>
  );
}
