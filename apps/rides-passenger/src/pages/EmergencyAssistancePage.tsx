import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  BadgeCheck,
  ChevronRight,
  Info,
  Mic,
  Phone,
  Share2,
  Shield,
  Users,
} from 'lucide-react';

const PRIMARY = '#004ac6';
const ON_SURFACE = '#191c1e';
const ON_SURFACE_VARIANT = '#434655';
const ON_PRIMARY = '#ffffff';
const ON_PRIMARY_CONTAINER = '#eeefff';
const SURFACE_LOWEST = '#ffffff';
const SURFACE_CONTAINER_HIGH = '#e6e8ea';
const SURFACE_CONTAINER_HIGHEST = '#e0e3e5';
const SECONDARY = '#505f76';
const SECONDARY_CONTAINER = '#d0e1fb';
const ON_SECONDARY_CONTAINER = '#54647a';
const ON_SECONDARY_FIXED_VARIANT = '#38485d';
const PRIMARY_CONTAINER = '#2563eb';
const PRIMARY_FIXED = '#dbe1ff';
const ERROR = '#ba1a1a';
const OUTLINE = '#737686';
const PAGE_BG = '#f7f9fb';
const CARD_SHADOW = '0px 4px 20px rgba(0, 0, 0, 0.05)';

const MAP_PREVIEW_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuA_ruTf_tgm1exT9JHlE91QlxE8N-TYTvm97uM4wxH83MkymFofJWXN1L_NjFi_dEO2VyiHZ3KXDB6Wj18jCQAzzKH-SiKdLM5AYcBpVTbvyg_IOli3FRzBWllmQIV8Bs7Qo5jq5LHGUsYTmWHfD0K6ixKoFkAjqCQh-_Nfnt4OxTptf4LeYNmKolMqDsz3erzR3te9dDZlQhuES-13AdqHAxvKfVThF5V-c0ygvGL4AKKreKnE5UtRgrC-JM2lNtB4QqT--RYs7c_7';

const TOOLKIT_ITEMS = [
  {
    id: 'identity',
    title: 'Identity Verification',
    description: 'Check driver credentials & vehicle PIN',
    icon: BadgeCheck,
  },
  {
    id: 'audio',
    title: 'Audio Recording',
    description: 'Securely record trip audio for safety',
    icon: Mic,
  },
  {
    id: 'safety-center',
    title: 'Safety Center',
    description: 'Emergency protocols & urban safety tips',
    icon: Shield,
  },
] as const;

function ToolkitRow({
  title,
  description,
  icon: Icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center rounded-[24px] p-4 text-left transition-colors hover:bg-[#f2f4f6] active:scale-[0.99]"
      style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
    >
      <div
        className="mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors group-hover:bg-[#dbe1ff]"
        style={{ backgroundColor: SURFACE_CONTAINER_HIGH }}
      >
        <Icon
          className="h-5 w-5 transition-colors group-hover:text-[#004ac6]"
          style={{ color: ON_SURFACE_VARIANT }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold" style={{ color: ON_SURFACE }}>
          {title}
        </h3>
        <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
          {description}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: OUTLINE }} aria-hidden />
    </button>
  );
}

export default function EmergencyAssistancePage() {
  const navigate = useNavigate();
  const [calling, setCalling] = useState(false);

  const notifySoon = () => {
    toast.message('Coming soon');
  };

  const handleEmergencyCall = () => {
    const confirmed = window.confirm(
      'Confirm: You are about to call emergency services (911). This action cannot be undone.',
    );
    if (!confirmed) return;
    setCalling(true);
    window.location.href = 'tel:911';
    setCalling(false);
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <style>{`
        @keyframes emergency-pulse-ring {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 0.3; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
        .emergency-pulse-ring {
          animation: emergency-pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      <header
        className="sticky top-0 z-50 flex h-16 w-full items-center justify-between px-5 shadow-sm safe-t"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="rounded-full p-2 transition-colors active:scale-95 hover:bg-[#f2f4f6]"
          style={{ color: PRIMARY }}
          aria-label="Back to account"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1
          className="flex-1 truncate px-2 text-center text-xl font-semibold tracking-tight"
          style={{ color: PRIMARY }}
        >
          Emergency Assistance
        </h1>
        <div className="w-10 shrink-0" aria-hidden />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-6 safe-x">
        <div
          className="relative mb-2 h-48 w-full overflow-hidden rounded-[24px]"
          style={{ backgroundColor: SURFACE_CONTAINER_HIGH, boxShadow: CARD_SHADOW }}
        >
          <img
            src={MAP_PREVIEW_URL}
            alt=""
            className="h-full w-full object-cover opacity-60 grayscale-[30%]"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-[#f7f9fb]/80 to-transparent"
            aria-hidden
          />
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 animate-pulse rounded-full"
              style={{ backgroundColor: ERROR }}
              aria-hidden
            />
            <p
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color: ON_SURFACE }}
            >
              Live Location Sharing Active
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleEmergencyCall}
            disabled={calling}
            className="group relative w-full overflow-hidden rounded-[24px] py-6 shadow-lg transition-all duration-300 active:scale-95 disabled:opacity-70"
            style={{ backgroundColor: ERROR, color: ON_PRIMARY }}
          >
            <div
              className="emergency-pulse-ring pointer-events-none absolute inset-0 opacity-30"
              style={{ backgroundColor: ERROR }}
              aria-hidden
            />
            <div className="relative z-10 flex flex-col items-center justify-center gap-2">
              <Phone className="h-10 w-10" fill="currentColor" aria-hidden />
              <span className="text-[30px] font-bold tracking-tight">Call 911</span>
              <span className="text-xs font-bold uppercase tracking-widest opacity-90">
                Connect to Emergency Services
              </span>
            </div>
          </button>
          <p className="px-4 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            This will immediately dial local emergency services and share your precise GPS
            coordinates.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={notifySoon}
            className="flex flex-col items-center justify-center rounded-[24px] p-6 transition-colors active:scale-95 hover:bg-[#f2f4f6]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: SECONDARY_CONTAINER }}
            >
              <Users className="h-6 w-6" style={{ color: ON_SECONDARY_CONTAINER }} aria-hidden />
            </div>
            <span className="text-center text-sm font-semibold" style={{ color: ON_SURFACE }}>
              Alert Contacts
            </span>
            <span className="mt-1 text-center text-[10px]" style={{ color: ON_SURFACE_VARIANT }}>
              Text trusted network
            </span>
          </button>
          <button
            type="button"
            onClick={notifySoon}
            className="flex flex-col items-center justify-center rounded-[24px] p-6 transition-colors active:scale-95 hover:bg-[#f2f4f6]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: PRIMARY_CONTAINER }}
            >
              <Share2 className="h-6 w-6" style={{ color: ON_PRIMARY_CONTAINER }} aria-hidden />
            </div>
            <span className="text-center text-sm font-semibold" style={{ color: ON_SURFACE }}>
              Share Link
            </span>
            <span className="mt-1 text-center text-[10px]" style={{ color: ON_SURFACE_VARIANT }}>
              Live tracking via URL
            </span>
          </button>
        </div>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
              Safety Toolkit
            </h2>
            <span
              className="rounded-full px-2 py-1 text-[10px] font-bold"
              style={{ backgroundColor: SURFACE_CONTAINER_HIGHEST, color: SECONDARY }}
            >
              4 TOOLS AVAILABLE
            </span>
          </div>
          <div className="space-y-3">
            {TOOLKIT_ITEMS.map((item) => (
              <ToolkitRow
                key={item.id}
                title={item.title}
                description={item.description}
                icon={item.icon}
                onClick={notifySoon}
              />
            ))}
          </div>
        </section>

        <div
          className="rounded-[24px] p-6"
          style={{ backgroundColor: 'rgba(211, 228, 254, 0.3)' }}
        >
          <div className="flex items-start gap-4">
            <Info
              className="mt-1 h-5 w-5 shrink-0"
              style={{ color: ON_SECONDARY_FIXED_VARIANT }}
              aria-hidden
            />
            <p className="text-sm leading-relaxed" style={{ color: ON_SECONDARY_FIXED_VARIANT }}>
              Our response team is monitoring this ride. If we detect an unusual stop or route
              deviation, we will check in via the app.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
