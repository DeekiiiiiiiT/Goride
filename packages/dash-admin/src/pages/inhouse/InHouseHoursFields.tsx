export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type DayHours = { open: string; close: string; isClosed: boolean };

export function defaultWeek(): DayHours[] {
  return DAY_NAMES.map(() => ({ open: '11:00', close: '21:00', isClosed: false }));
}

export function weekFromRows(rows: unknown): DayHours[] {
  const week = defaultWeek();
  if (!Array.isArray(rows)) return week;
  for (const raw of rows) {
    const row = raw as { day_of_week?: number; open_time?: string; close_time?: string; is_closed?: boolean };
    const day = Number(row.day_of_week);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    week[day] = {
      open: String(row.open_time || '11:00').slice(0, 5),
      close: String(row.close_time || '21:00').slice(0, 5),
      isClosed: Boolean(row.is_closed),
    };
  }
  return week;
}

export function InHouseHoursFields({
  hours,
  onChange,
}: {
  hours: DayHours[];
  onChange: (hours: DayHours[]) => void;
}) {
  function update(index: number, patch: Partial<DayHours>) {
    const next = hours.map((day, dayIndex) => (dayIndex === index ? { ...day, ...patch } : day));
    onChange(next);
  }
  return (
    <div className="space-y-2 md:col-span-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-300">Hours for each day</p>
        <button
          type="button"
          className="rounded bg-slate-800 px-3 py-1 text-sm"
          onClick={() => onChange(hours.map(() => ({ ...hours[1] })))}
        >
          Use Monday for every day
        </button>
      </div>
      {DAY_NAMES.map((name, index) => {
        const day = hours[index];
        return (
          <div key={name} className="grid grid-cols-[7rem_auto_1fr_1fr] items-center gap-2">
            <span className="text-sm">{name}</span>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input type="checkbox" checked={!day.isClosed} onChange={(event) => update(index, { isClosed: !event.target.checked })} />
              Open
            </label>
            {day.isClosed ? (
              <span className="col-span-2 text-sm text-slate-500">Closed</span>
            ) : (
              <>
                <input type="time" className="rounded bg-slate-900 p-2" value={day.open} onChange={(event) => update(index, { open: event.target.value })} />
                <input type="time" className="rounded bg-slate-900 p-2" value={day.close} onChange={(event) => update(index, { close: event.target.value })} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
