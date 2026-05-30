import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  Globe,
  Info,
  Languages,
  Mail,
  MapPin,
  MessageSquare,
  Moon,
  Palette,
  Shield,
  Smartphone,
  Sun,
  SunDim,
} from 'lucide-react';

const PRIMARY = '#004ac6';
const ON_SURFACE = '#191c1e';
const ON_SURFACE_VARIANT = '#434655';
const ON_PRIMARY_FIXED_VARIANT = '#003ea8';
const ON_SECONDARY_FIXED_VARIANT = '#38485d';
const ON_TERTIARY_FIXED_VARIANT = '#7d2d00';
const SURFACE_LOWEST = '#ffffff';
const SURFACE_LOW = '#f2f4f6';
const SURFACE_CONTAINER_HIGH = '#e6e8ea';
const SECONDARY = '#505f76';
const SECONDARY_FIXED = '#d3e4fe';
const PRIMARY_FIXED = '#dbe1ff';
const TERTIARY_FIXED = '#ffdbcd';
const OUTLINE = '#737686';
const PAGE_BG = '#f7f9fb';
const CARD_SHADOW = '0px 4px 20px rgba(0, 0, 0, 0.05)';

type ThemeMode = 'light' | 'dark' | 'auto';

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 px-1">
      <span style={{ color: PRIMARY }}>{icon}</span>
      <h2
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: SECONDARY }}
      >
        {label}
      </h2>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ backgroundColor: checked ? PRIMARY : '#E2E8F0' }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
        style={{ left: checked ? 'calc(100% - 1.25rem - 2px)' : '2px' }}
      />
    </button>
  );
}

function BentoCard({
  children,
  className = '',
  fullWidth = false,
  highlighted,
}: {
  children: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-[24px] p-5 transition-all active:scale-[0.98] ${fullWidth ? 'col-span-2' : ''} ${className}`}
      style={{
        backgroundColor: highlighted ? 'rgba(0, 74, 198, 0.02)' : SURFACE_LOWEST,
        boxShadow: CARD_SHADOW,
      }}
    >
      {children}
    </div>
  );
}

export default function AppSettingsPage() {
  const navigate = useNavigate();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [dataSharing, setDataSharing] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');

  const notifySoon = () => {
    toast.message('Coming soon');
  };

  const themeLabel =
    themeMode === 'light' ? 'Light' : themeMode === 'dark' ? 'Dark' : 'System';

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header
        className="sticky top-0 z-50 flex h-16 w-full items-center px-4 backdrop-blur-md safe-t"
        style={{ backgroundColor: 'rgba(247, 249, 251, 0.9)' }}
      >
        <div className="flex w-full items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/account')}
            className="rounded-full p-2 transition-colors active:opacity-70 hover:bg-[#f2f4f6]"
            style={{ color: PRIMARY }}
            aria-label="Back to account"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
            Settings
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 safe-x">
        <div className="flex flex-col gap-6">
          <section>
            <SectionHeader icon={<Bell className="h-5 w-5" aria-hidden />} label="Notifications" />
            <div className="grid grid-cols-2 gap-3">
              <BentoCard fullWidth highlighted={pushEnabled}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: PRIMARY_FIXED }}
                    >
                      <Smartphone
                        className="h-5 w-5"
                        style={{ color: ON_PRIMARY_FIXED_VARIANT }}
                        aria-hidden
                      />
                    </div>
                    <div>
                      <p className="font-semibold">Push Notifications</p>
                      <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                        Real-time ride updates
                      </p>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={pushEnabled}
                    onChange={setPushEnabled}
                    ariaLabel="Push notifications"
                  />
                </div>
              </BentoCard>
              <BentoCard highlighted={emailEnabled}>
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: SECONDARY_FIXED }}
                >
                  <Mail
                    className="h-5 w-5"
                    style={{ color: ON_SECONDARY_FIXED_VARIANT }}
                    aria-hidden
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Email</span>
                  <ToggleSwitch
                    checked={emailEnabled}
                    onChange={setEmailEnabled}
                    ariaLabel="Email notifications"
                  />
                </div>
              </BentoCard>
              <BentoCard highlighted={smsEnabled}>
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: SECONDARY_FIXED }}
                >
                  <MessageSquare
                    className="h-5 w-5"
                    style={{ color: ON_SECONDARY_FIXED_VARIANT }}
                    aria-hidden
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">SMS</span>
                  <ToggleSwitch
                    checked={smsEnabled}
                    onChange={setSmsEnabled}
                    ariaLabel="SMS notifications"
                  />
                </div>
              </BentoCard>
            </div>
          </section>

          <section>
            <SectionHeader icon={<Shield className="h-5 w-5" aria-hidden />} label="Privacy & Safety" />
            <div className="grid grid-cols-2 gap-3">
              <BentoCard fullWidth>
                <button
                  type="button"
                  onClick={notifySoon}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: TERTIARY_FIXED }}
                    >
                      <MapPin
                        className="h-5 w-5"
                        style={{ color: ON_TERTIARY_FIXED_VARIANT }}
                        aria-hidden
                      />
                    </div>
                    <div>
                      <p className="font-semibold">Location Permissions</p>
                      <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                        Manage GPS access
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0" style={{ color: OUTLINE }} />
                </button>
              </BentoCard>
              <BentoCard fullWidth highlighted={dataSharing}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: SURFACE_CONTAINER_HIGH }}
                    >
                      <Database className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} aria-hidden />
                    </div>
                    <div>
                      <p className="font-semibold">Data Sharing</p>
                      <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                        Third-party integrations
                      </p>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={dataSharing}
                    onChange={setDataSharing}
                    ariaLabel="Data sharing"
                  />
                </div>
              </BentoCard>
            </div>
          </section>

          <section>
            <SectionHeader icon={<Palette className="h-5 w-5" aria-hidden />} label="Display" />
            <BentoCard fullWidth>
              <div className="mb-4 flex items-center justify-between">
                <p className="font-semibold">Theme Mode</p>
                <span className="text-sm font-medium" style={{ color: PRIMARY }}>
                  {themeLabel}
                </span>
              </div>
              <div
                className="flex gap-1 rounded-xl p-1"
                style={{ backgroundColor: SURFACE_LOW }}
                role="group"
                aria-label="Theme mode"
              >
                {(
                  [
                    { id: 'light' as const, label: 'Light', icon: Sun },
                    { id: 'dark' as const, label: 'Dark', icon: Moon },
                    { id: 'auto' as const, label: 'Auto', icon: SunDim },
                  ] as const
                ).map(({ id, label, icon: Icon }) => {
                  const active = themeMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setThemeMode(id)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold tracking-wide transition-colors ${
                        active ? 'shadow-sm' : ''
                      }`}
                      style={{
                        backgroundColor: active ? SURFACE_LOWEST : 'transparent',
                        color: active ? PRIMARY : ON_SURFACE_VARIANT,
                      }}
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden />
                      {label}
                    </button>
                  );
                })}
              </div>
            </BentoCard>
          </section>

          <section>
            <SectionHeader icon={<Globe className="h-5 w-5" aria-hidden />} label="Preferences" />
            <BentoCard fullWidth>
              <button
                type="button"
                onClick={notifySoon}
                className="flex w-full items-center justify-between text-left"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: SECONDARY_FIXED }}
                  >
                    <Languages
                      className="h-5 w-5"
                      style={{ color: ON_SECONDARY_FIXED_VARIANT }}
                      aria-hidden
                    />
                  </div>
                  <p className="font-semibold">App Language</p>
                </div>
                <div className="flex items-center gap-2 font-medium" style={{ color: PRIMARY }}>
                  <span>English (US)</span>
                  <ChevronDown className="h-5 w-5" aria-hidden />
                </div>
              </button>
            </BentoCard>
          </section>

          <section>
            <SectionHeader icon={<Info className="h-5 w-5" aria-hidden />} label="Legal & Information" />
            <div
              className="overflow-hidden rounded-[24px]"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            >
              <button
                type="button"
                onClick={notifySoon}
                className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-[#f2f4f6]"
              >
                <span className="font-medium">Terms of Service</span>
                <ExternalLink className="h-5 w-5" style={{ color: OUTLINE }} aria-hidden />
              </button>
              <button
                type="button"
                onClick={notifySoon}
                className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-[#f2f4f6]"
              >
                <span className="font-medium">Privacy Policy</span>
                <ExternalLink className="h-5 w-5" style={{ color: OUTLINE }} aria-hidden />
              </button>
              <button
                type="button"
                onClick={notifySoon}
                className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-[#f2f4f6]"
              >
                <span className="font-medium">Software Licenses</span>
                <ChevronRight className="h-5 w-5" style={{ color: OUTLINE }} aria-hidden />
              </button>
            </div>
            <p className="mt-6 text-center text-sm" style={{ color: OUTLINE }}>
              App Version 0.1.0 (2026)
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
