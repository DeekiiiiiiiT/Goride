import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Bus, BusFront, Minus, Plus } from 'lucide-react';

const PRIMARY = '#004ac6';
const PRIMARY_CONTAINER = '#2563eb';
const ON_SURFACE = '#191c1e';
const ON_SURFACE_VARIANT = '#434655';
const ON_PRIMARY = '#ffffff';
const ON_PRIMARY_CONTAINER = '#eeefff';
const ON_SECONDARY_CONTAINER = '#54647a';
const ON_TERTIARY_FIXED_VARIANT = '#7d2d00';
const SURFACE_LOW = '#f2f4f6';
const SECONDARY = '#505f76';
const SECONDARY_CONTAINER = '#d0e1fb';
const TERTIARY_FIXED = '#ffdbcd';
const PAGE_BG = '#f7f9fb';
const CARD_SHADOW = '0px 4px 20px rgba(0, 0, 0, 0.05)';

const HERO_IMAGE_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDhQ5Zee_xBm1kMrybLfHH-NM8-tcw6rDRADhLalu3Rt2YZPKH0pETGXyOk1mo9Ixp7s2p2WUrSPHn4ZCzOdHoaPCemiU4YSO6r-GkjNHwy8zV373b-ddJQzEnjThInyTAhpO3v8T_6e61DrPC4vI6h3sWo4l2Vr6OPTUxNc2b6_q6X8XImSaHx---S5eGwtj3O3mF7hrsMT8sB5zOBzevbbFtAxlJXLHJA9Lbtys2B_XU94ytlEg-HzU6XewUHK3mloNIIOmOmtEpt';

const EVENT_TYPES = [
  'Wedding Ceremony',
  'Corporate Trip',
  'Birthday Gala',
  'Airport Shuttle (Group)',
  'Private Tour',
] as const;

const VEHICLES = [
  {
    id: 'van' as const,
    name: 'Luxury Van',
    capacity: 8,
    capacityLabel: 'UP TO 8',
    description: 'Perfect for smaller groups and weddings.',
    icon: BusFront,
    iconBg: SECONDARY_CONTAINER,
    iconColor: ON_SECONDARY_CONTAINER,
  },
  {
    id: 'minibus' as const,
    name: 'Minibus',
    capacity: 14,
    capacityLabel: 'UP TO 14',
    description: 'Optimal for corporate team transport.',
    icon: Bus,
    iconBg: PRIMARY_CONTAINER,
    iconColor: ON_PRIMARY_CONTAINER,
  },
  {
    id: 'executive' as const,
    name: 'Executive Bus',
    capacity: 20,
    capacityLabel: 'UP TO 20',
    description: 'Premium comfort for large delegations.',
    icon: Bus,
    iconBg: TERTIARY_FIXED,
    iconColor: ON_TERTIARY_FIXED_VARIANT,
  },
] as const;

type VehicleId = (typeof VEHICLES)[number]['id'];

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
  const [passengers, setPassengers] = useState(8);
  const [eventType, setEventType] = useState<string>(EVENT_TYPES[0]);
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [vehicleId, setVehicleId] = useState<VehicleId>('minibus');

  const selectedVehicle = VEHICLES.find((v) => v.id === vehicleId) ?? VEHICLES[1];

  const adjustPassengers = (delta: number) => {
    setPassengers((n) => Math.min(20, Math.max(1, n + delta)));
  };

  const handleContinue = () => {
    if (!eventDate || !eventTime) {
      toast.error('Select event date and time.');
      return;
    }
    if (passengers > selectedVehicle.capacity) {
      toast.error(`This vehicle fits up to ${selectedVehicle.capacity} passengers.`);
      return;
    }
    toast.message('Event bookings are coming soon.');
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
          className="rounded-full p-2 transition-colors active:scale-95 hover:bg-[#f2f4f6]"
          style={{ color: PRIMARY }}
          aria-label="Back to services"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="ml-4 text-xl font-semibold tracking-tight" style={{ color: PRIMARY }}>
          Event Booking
        </h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 pb-8 pt-20 safe-x">
        <section className="relative mb-2 h-48 overflow-hidden rounded-[24px] shadow-sm">
          <img src={HERO_IMAGE_URL} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-6">
            <div className="text-white">
              <p className="text-xs font-bold uppercase tracking-wide opacity-90">
                Specialized service
              </p>
              <h2 className="text-[30px] font-bold leading-tight tracking-tight">
                Group Experiences
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
              PASSENGERS
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
                aria-label="Fewer passengers"
              >
                <Minus className="h-5 w-5" aria-hidden />
              </button>
              <span className="text-xl font-semibold">{passengers}</span>
              <button
                type="button"
                onClick={() => adjustPassengers(1)}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm transition-transform active:scale-95"
                style={{ color: PRIMARY }}
                aria-label="More passengers"
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
              EVENT TYPE
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="h-14 w-full rounded-xl border-none px-4 text-base outline-none focus:ring-2 focus:ring-[#004ac6]"
              style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
            >
              {EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
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
            SCHEDULE
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                Date
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
                Time
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
            SELECT VEHICLE
          </label>
          {VEHICLES.map((vehicle) => {
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
            Continue to Booking
            <ArrowRight className="h-5 w-5" aria-hidden />
          </button>
          <p className="mt-4 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            Prices include professional chauffeur and insurance.
          </p>
        </div>
      </main>
    </div>
  );
}
