import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CircleDot, Clock, MapPin } from 'lucide-react';

import {
  CARD_SHADOW,
  HEADER_BG,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_FIXED_DIM,
  SECONDARY,
  SECONDARY_CONTAINER,
  SURFACE_DIM,
  SURFACE_LOW,
  SURFACE_LOWEST,
  TERTIARY,
} from '@/lib/passengerTheme';

const VEHICLE_CLASSES = [
  {
    id: 'standard' as const,
    name: 'Standard',
    details: '4 seats • 5 min wait',
    price: 42.5,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBKkpsiazHXCJ67vitY3Etr-r5ySFlOLQdzw0GAdPpBaxs9I35Ysifi5RGaMaVVgjZd7PouYmbdFhBT1A73KuSTUimWyF7AA1KnB2hs0xvzI_R2pf6YW3NYNACb3XdsG9Hx-ZkJHsZFwlZP8VQi51IB3CuNro1YRlfF7HS99HYSSURV_DQEKR3GwaICuuBTQ7Eog0ve4cScp5DGpR48uwCls-Zi4I6NmVGRH27tBBOSJ8DFcZa4JulFFoL7Wot_-OleKqhB4MQXs0D_',
    imageBg: SECONDARY_CONTAINER,
    recommended: false,
  },
  {
    id: 'premium' as const,
    name: 'Premium',
    details: '4 seats • Extra legroom',
    price: 58.9,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDeCl7vaa0uFOZvNyMW1wcdF-O_J0gaUUnCTXRmVE3fsJcC7qCxavcmo3zumCV4_nO8L96-VzkwtloM2PrBL81Zp_8nUi35ApmPygPh6vfj6Js54eZwU5_KXbV301WTrIeGSDOvcQRAm5t5Uv68p_dngZfIn-FkaZDgX6BmrQernSaCoP0a9WECRV70dzox4oTlSKfjb4uddG5IRTXEqwlcnetU-ar4gZfmX5dWxtMAO94EqMo4pltPi0lxkdw1Yzvkpxuv6VZIA-5C',
    imageBg: PRIMARY_FIXED_DIM,
    recommended: true,
  },
  {
    id: 'executive' as const,
    name: 'Executive',
    details: '6 seats • Premium interior',
    price: 84.2,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDv5xzFSz2zAGRI9EGgVBBuOxQI8s871a-KKSIY7a7RQhpK7w_AAYjoRUtVaI5ZHn59glfZ2aIDR5A15I8HtXQwN869yjTwgaWIoh9BIC0x3uYYsriqrDwlTUeDmGPOekbaC8P40rFKrk4yMrBDiIxw-2Xkl9cZEiid4TyOcD7LeEOQ15Mf3Rdslykj9WQhl3NSCjUGEiV7Gz7pbeCc61q-eMWQuH15ga21XMETug_a9q50fwjKb8CK28smA7UhBynfSkDpuFKztGSG',
    imageBg: SURFACE_DIM,
    recommended: false,
  },
];

type VehicleId = (typeof VEHICLE_CLASSES)[number]['id'];

function buildScheduleDays(count: number) {
  const days: { id: string; month: string; day: number; weekday: string }[] = [];
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', weekday: 'short' });
  for (let i = 0; i < count; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const parts = formatter.formatToParts(date);
    const month = parts.find((p) => p.type === 'month')?.value.toUpperCase() ?? '';
    const weekday = parts.find((p) => p.type === 'weekday')?.value.toUpperCase() ?? '';
    days.push({
      id: date.toISOString().slice(0, 10),
      month,
      day: date.getDate(),
      weekday,
    });
  }
  return days;
}

export default function ScheduleRidePage() {
  const navigate = useNavigate();
  const scheduleDays = useMemo(() => buildScheduleDays(7), []);
  const [selectedDayId, setSelectedDayId] = useState(scheduleDays[0]?.id ?? '');
  const [departTime] = useState('08:30 AM');
  const [pickup, setPickup] = useState('350 5th Ave, New York, NY');
  const [destination, setDestination] = useState('John F. Kennedy International Airport');
  const [vehicleId, setVehicleId] = useState<VehicleId>('premium');

  const selectedVehicle = VEHICLE_CLASSES.find((v) => v.id === vehicleId) ?? VEHICLE_CLASSES[1];

  const handleSchedule = () => {
    if (!pickup.trim() || !destination.trim()) {
      toast.error('Enter pickup and destination.');
      return;
    }
    toast.message('Scheduled rides are coming soon.');
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header className="sticky top-0 z-50 flex h-16 w-full items-center bg-[#f7f9fb] px-4 safe-t">
        <button
          type="button"
          onClick={() => navigate('/services')}
          className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
          style={{ color: PRIMARY }}
          aria-label="Back to services"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="ml-4 text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
          Schedule Ride
        </h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-36 pt-4 safe-x">
        <section className="mb-4">
          <div
            className="rounded-[24px] p-6"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <span
              className="mb-4 block text-xs font-bold tracking-wide"
              style={{ color: SECONDARY }}
            >
              PICKUP DATE &amp; TIME
            </span>
            <div className="flex flex-col gap-4">
              <div className="-mx-1 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {scheduleDays.map((day) => {
                  const selected = day.id === selectedDayId;
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => setSelectedDayId(day.id)}
                      className="flex h-24 w-20 shrink-0 flex-col items-center justify-center rounded-xl transition-colors"
                      style={{
                        backgroundColor: selected ? PRIMARY : SURFACE_LOW,
                        color: selected ? ON_PRIMARY : ON_SURFACE_VARIANT,
                        boxShadow: selected ? '0 4px 12px rgba(0, 74, 198, 0.25)' : undefined,
                      }}
                    >
                      <span className="text-[10px] font-bold">{day.month}</span>
                      <span className="text-2xl font-bold">{day.day}</span>
                      <span className="text-[10px] font-bold">{day.weekday}</span>
                    </button>
                  );
                })}
              </div>
              <div
                className="flex items-center justify-between rounded-xl p-4"
                style={{ backgroundColor: SURFACE_LOW }}
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold tracking-wide" style={{ color: SECONDARY }}>
                    DEPART AT
                  </span>
                  <span className="text-2xl font-bold" style={{ color: PRIMARY }}>
                    {departTime}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toast.message('Time picker coming soon')}
                  className="rounded-lg border bg-white p-2 shadow-sm transition-transform active:scale-95"
                  style={{ borderColor: `${OUTLINE_VARIANT}33`, color: PRIMARY }}
                  aria-label="Change departure time"
                >
                  <Clock className="h-6 w-6" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-4">
          <div
            className="rounded-[24px] p-6"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <div className="relative flex flex-col gap-6">
              <div
                className="absolute bottom-6 left-[11px] top-6 w-0.5 opacity-40"
                style={{ backgroundColor: OUTLINE_VARIANT }}
                aria-hidden
              />
              <div className="flex items-start gap-4">
                <div className="z-10 rounded-full bg-white ring-4 ring-white">
                  <CircleDot className="h-6 w-6" style={{ color: PRIMARY }} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <label
                    className="mb-1 block text-xs font-bold tracking-wide"
                    style={{ color: SECONDARY }}
                  >
                    PICKUP LOCATION
                  </label>
                  <input
                    type="text"
                    value={pickup}
                    onChange={(e) => setPickup(e.target.value)}
                    className="w-full rounded-xl border-none px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#004ac6]"
                    style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
                  />
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="z-10 rounded-full bg-white ring-4 ring-white">
                  <MapPin className="h-6 w-6" style={{ color: TERTIARY }} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <label
                    className="mb-1 block text-xs font-bold tracking-wide"
                    style={{ color: SECONDARY }}
                  >
                    DESTINATION
                  </label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Enter destination..."
                    className="w-full rounded-xl border-none px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#004ac6]"
                    style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-4">
          <span
            className="mb-3 block px-2 text-xs font-bold tracking-wide"
            style={{ color: SECONDARY }}
          >
            SELECT VEHICLE CLASS
          </span>
          <div className="flex flex-col gap-3">
            {VEHICLE_CLASSES.map((vehicle) => {
              const selected = vehicle.id === vehicleId;
              return (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => setVehicleId(vehicle.id)}
                  className="relative flex items-center gap-4 rounded-[24px] p-4 text-left transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: SURFACE_LOWEST,
                    boxShadow: CARD_SHADOW,
                    borderWidth: 2,
                    borderStyle: 'solid',
                    borderColor: selected ? PRIMARY : 'transparent',
                  }}
                >
                  {vehicle.recommended && selected ? (
                    <span
                      className="absolute -top-3 right-6 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
                    >
                      Recommended
                    </span>
                  ) : null}
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: vehicle.imageBg }}
                  >
                    <img src={vehicle.image} alt="" className="h-12 w-12 object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold">{vehicle.name}</h3>
                    <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                      {vehicle.details}
                    </p>
                  </div>
                  <span className="shrink-0 text-xl font-semibold" style={{ color: PRIMARY }}>
                    ${vehicle.price.toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <footer
        className="fixed bottom-[4.5rem] left-0 z-40 w-full border-t p-4 backdrop-blur-md safe-x"
        style={{
          backgroundColor: HEADER_BG,
          borderColor: `${OUTLINE_VARIANT}33`,
        }}
      >
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={handleSchedule}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-xl text-base font-semibold shadow-lg transition-transform active:scale-[0.98]"
            style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
          >
            <span>Schedule Ride for ${selectedVehicle.price.toFixed(2)}</span>
            <ArrowRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </footer>
    </div>
  );
}
