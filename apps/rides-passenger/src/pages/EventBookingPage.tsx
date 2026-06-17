import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Bus, BusFront, Minus, Plus } from 'lucide-react';

import {
  CARD_SHADOW,
  ON_PRIMARY,
  ON_PRIMARY_CONTAINER,
  ON_SECONDARY_CONTAINER,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  ON_TERTIARY_FIXED_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SECONDARY,
  SECONDARY_CONTAINER,
  SURFACE_LOW,
  TERTIARY_FIXED,
} from '@/lib/passengerTheme';

const HERO_IMAGE_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDhQ5Zee_xBm1kMrybLfHH-NM8-tcw6rDRADhLalu3Rt2YZPKH0pETGXyOk1mo9Ixp7s2p2WUrSPHn4ZCzOdHoaPCemiU4YSO6r-GkjNHwy8zV373b-ddJQzEnjThInyTAhpO3v8T_6e61DrPC4vI6h3sWo4l2Vr6OPTUxNc2b6_q6X8XImSaHx---S5eGwtj3O3mF7hrsMT8sB5zOBzevbbFtAxlJXLHJA9Lbtys2B_XU94ytlEg-HzU6XewUHK3mloNIIOmOmtEpt';

type VehicleId = 'van' | 'minibus' | 'executive';

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[24px] p-5 ${className}`}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        boxShadow: CARD_SHADOW,
      }}
    >
      {children}
    </div>
  );
}

export default function EventBookingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('booking');
  const [passengers, setPassengers] = useState(8);
  const [eventType, setEventType] = useState<string>('wedding');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [vehicleId, setVehicleId] = useState<VehicleId>('minibus');

  const eventTypes = useMemo(
    () => [
      { id: 'wedding', label: t('event.types.wedding') },
      { id: 'corporate', label: t('event.types.corporate') },
      { id: 'birthday', label: t('event.types.birthday') },
      { id: 'airport', label: t('event.types.airport') },
      { id: 'tour', label: t('event.types.tour') },
    ],
    [t],
  );

  const vehicles = useMemo(
    () => [
      {
        id: 'van' as const,
        name: t('event.vehicles.van'),
        capacity: 8,
        capacityLabel: t('event.vehicles.vanCapacity'),
        description: t('event.vehicles.vanDescription'),
        icon: BusFront,
        iconBg: SECONDARY_CONTAINER,
        iconColor: ON_SECONDARY_CONTAINER,
      },
      {
        id: 'minibus' as const,
        name: t('event.vehicles.minibus'),
        capacity: 14,
        capacityLabel: t('event.vehicles.minibusCapacity'),
        description: t('event.vehicles.minibusDescription'),
        icon: Bus,
        iconBg: PRIMARY_CONTAINER,
        iconColor: ON_PRIMARY_CONTAINER,
      },
      {
        id: 'executive' as const,
        name: t('event.vehicles.executive'),
        capacity: 20,
        capacityLabel: t('event.vehicles.executiveCapacity'),
        description: t('event.vehicles.executiveDescription'),
        icon: Bus,
        iconBg: TERTIARY_FIXED,
        iconColor: ON_TERTIARY_FIXED_VARIANT,
      },
    ],
    [t],
  );

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicles[1];

  const adjustPassengers = (delta: number) => {
    setPassengers((n) => Math.min(20, Math.max(1, n + delta)));
  };

  const handleContinue = () => {
    if (!eventDate || !eventTime) {
      toast.error(t('event.selectDateTime'));
      return;
    }
    if (passengers > selectedVehicle.capacity) {
      toast.error(t('event.vehicleCapacity', { capacity: selectedVehicle.capacity }));
      return;
    }
    toast.message(t('event.comingSoon'));
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header className="fixed top-0 z-50 flex h-16 w-full items-center bg-[#f7f9fb] px-4 safe-t">
        <button
          type="button"
          onClick={() => navigate('/services')}
          className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
          style={{ color: PRIMARY }}
          aria-label={t('backToServices')}
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="ml-4 text-xl font-semibold tracking-tight" style={{ color: PRIMARY }}>
          {t('event.title')}
        </h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 pb-8 pt-20 safe-x">
        <section className="relative mb-2 h-48 overflow-hidden rounded-[24px] shadow-sm">
          <img src={HERO_IMAGE_URL} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-6">
            <div className="text-white">
              <p className="text-xs font-bold uppercase tracking-wide opacity-90">
                {t('event.specializedService')}
              </p>
              <h2 className="text-[30px] font-bold leading-tight tracking-tight">
                {t('event.groupExperiences')}
              </h2>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <GlassCard>
            <label
              className="mb-3 block text-xs font-bold tracking-wide"
              style={{ color: SECONDARY }}
            >
              {t('event.passengers')}
            </label>
            <div
              className="flex items-center justify-between rounded-xl p-2"
              style={{ backgroundColor: SURFACE_LOW }}
            >
              <button
                type="button"
                onClick={() => adjustPassengers(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm transition-transform active:scale-95"
                style={{ color: PRIMARY }}
                aria-label={t('event.fewerPassengersAria')}
              >
                <Minus className="h-5 w-5" aria-hidden />
              </button>
              <span className="text-xl font-semibold">{passengers}</span>
              <button
                type="button"
                onClick={() => adjustPassengers(1)}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm transition-transform active:scale-95"
                style={{ color: PRIMARY }}
                aria-label={t('event.morePassengersAria')}
              >
                <Plus className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </GlassCard>

          <GlassCard>
            <label
              className="mb-3 block text-xs font-bold tracking-wide"
              style={{ color: SECONDARY }}
            >
              {t('event.eventType')}
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="h-14 w-full rounded-xl border-none px-4 text-base outline-none focus:ring-2 focus:ring-[#004ac6]"
              style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
            >
              {eventTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </GlassCard>
        </div>

        <GlassCard>
          <label
            className="mb-3 block text-xs font-bold tracking-wide"
            style={{ color: SECONDARY }}
          >
            {t('event.schedule')}
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                {t('event.date')}
              </p>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="h-12 w-full rounded-xl border-none px-4 text-base outline-none focus:ring-2 focus:ring-[#004ac6]"
                style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                {t('event.time')}
              </p>
              <input
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="h-12 w-full rounded-xl border-none px-4 text-base outline-none focus:ring-2 focus:ring-[#004ac6]"
                style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
              />
            </div>
          </div>
        </GlassCard>

        <div className="space-y-3">
          <label
            className="block px-2 text-xs font-bold tracking-wide"
            style={{ color: SECONDARY }}
          >
            {t('event.selectVehicle')}
          </label>
          {vehicles.map((vehicle) => {
            const selected = vehicle.id === vehicleId;
            const Icon = vehicle.icon;
            return (
              <button
                key={vehicle.id}
                type="button"
                onClick={() => setVehicleId(vehicle.id)}
                className="flex w-full items-center gap-4 rounded-[24px] p-4 text-left transition-all active:scale-[0.99]"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  boxShadow: CARD_SHADOW,
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor: selected ? PRIMARY : 'transparent',
                }}
              >
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: vehicle.iconBg }}
                >
                  <Icon className="h-8 w-8" style={{ color: vehicle.iconColor }} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className="text-xl font-semibold"
                      style={{ color: selected ? PRIMARY : ON_SURFACE }}
                    >
                      {vehicle.name}
                    </h3>
                    <span className="shrink-0 text-xs font-bold tracking-wide" style={{ color: PRIMARY }}>
                      {vehicle.capacityLabel}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                    {vehicle.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="pt-4">
          <button
            type="button"
            onClick={handleContinue}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl text-lg font-semibold shadow-lg transition-transform active:scale-95"
            style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
          >
            {t('event.continueToBooking')}
            <ArrowRight className="h-5 w-5" aria-hidden />
          </button>
          <p className="mt-4 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {t('event.pricingNote')}
          </p>
        </div>
      </main>
    </div>
  );
}
