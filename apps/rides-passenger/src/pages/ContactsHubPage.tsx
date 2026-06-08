import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Contact, ShieldCheck } from 'lucide-react';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

function HubRow({
  icon,
  iconColor,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="passenger-row-hover flex w-full items-center justify-between px-5 py-4 text-left transition-colors"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span style={{ color: iconColor }}>{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
            {label}
          </p>
          <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            {description}
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: OUTLINE_VARIANT }} aria-hidden />
    </button>
  );
}

export default function ContactsHubPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header
        className="sticky top-0 z-50 flex h-14 items-center px-4 safe-t"
        style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
      >
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="rounded-full p-2"
          style={{ color: PRIMARY }}
          aria-label="Back"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: PRIMARY }}>
          Contacts
        </h1>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-4 safe-x">
        <div
          className="overflow-hidden rounded-[20px]"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
        >
          <HubRow
            icon={<Contact className="h-5 w-5" />}
            iconColor={PRIMARY}
            label="Roam Contacts"
            description="People you book rides for"
            onClick={() => navigate('/account/contacts/roam')}
          />
          <div className="mx-5 h-px" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }} />
          <HubRow
            icon={<ShieldCheck className="h-5 w-5" />}
            iconColor={PRIMARY}
            label="Trusted Contacts"
            description="Safety alerts & emergency sharing"
            onClick={() => navigate('/account/contacts/trusted')}
          />
        </div>
      </main>
    </div>
  );
}
