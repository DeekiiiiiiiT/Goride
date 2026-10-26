import { useEffect, useState } from 'react';
import { plugSend } from '../api';
import { onPlugClick } from '../shell/actions';

type Vehicle = { id: string; nickname?: string; make?: string; model?: string };
type Reminder = { kind?: string; due_on?: string | null };

export function CarStrip() {
  const [signedIn, setSignedIn] = useState(document.body.dataset.signedIn === '1');
  const [carName, setCarName] = useState<string | null>(null);
  const [reminder, setReminder] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      const signed = document.body.dataset.signedIn === '1';
      setSignedIn(signed);
      if (!signed) {
        setCarName(null);
        setReminder(null);
        return;
      }
      void plugSend<{ vehicles: Vehicle[] }>('/garage', 'GET')
        .then(async (body) => {
          const car = body.vehicles?.[0];
          if (!car) {
            setCarName(null);
            setReminder(null);
            return;
          }
          if (car.id) sessionStorage.setItem('plug-vehicle', car.id);
          setCarName(car.nickname || `${car.make || ''} ${car.model || ''}`.trim() || 'Your car');
          const reminders = await plugSend<{ reminders: Reminder[] }>(`/reminders?vehicleId=${encodeURIComponent(car.id)}`, 'GET').catch(() => ({ reminders: [] as Reminder[] }));
          const next = reminders.reminders?.[0];
          setReminder(next ? [next.kind, next.due_on].filter(Boolean).join(' · ') : 'No reminder yet');
        })
        .catch(() => {
          setCarName(null);
          setReminder(null);
        });
    };
    load();
    window.addEventListener('plug-refresh', load);
    return () => window.removeEventListener('plug-refresh', load);
  }, []);

  if (!signedIn) return null;
  if (!carName) {
    return (
      <button type="button" onClick={onPlugClick} data-act="add-a-car" className="pressable min-h-12 w-full rounded-xl bg-surface-container-high px-3 text-left font-bold">
        Add a car
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-container-high p-3">
      <span>
        <span className="block font-bold">{carName}</span>
        <span className="text-sm text-on-surface-variant">{reminder}</span>
      </span>
      <button type="button" onClick={onPlugClick} data-act="log-a-service" className="pressable min-h-11 shrink-0 rounded-xl bg-primary px-3 font-bold text-on-primary">
        Log a service or fill-up
      </button>
    </div>
  );
}
