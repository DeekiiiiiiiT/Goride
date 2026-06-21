export interface MerchantHour {
  day_of_week: number;
  open_time?: string | null;
  close_time?: string | null;
  is_closed?: boolean;
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

function formatTimeLabel(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes || 0, 0, 0);
  return date.toLocaleTimeString('en-JM', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function isWithinBusinessHours(hours: MerchantHour[], now = new Date()) {
  if (hours.length === 0) return true;

  const day = now.getDay();
  const dayHours = hours.find((entry) => entry.day_of_week === day);
  if (!dayHours || dayHours.is_closed || !dayHours.open_time || !dayHours.close_time) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = parseTimeToMinutes(dayHours.open_time.slice(0, 5));
  const closeMinutes = parseTimeToMinutes(dayHours.close_time.slice(0, 5));

  if (closeMinutes > openMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }

  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

export function getNextOpenLabel(hours: MerchantHour[], now = new Date()) {
  if (hours.length === 0) {
    return 'Set your business hours in Settings';
  }

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const day = date.getDay();
    const dayHours = hours.find((entry) => entry.day_of_week === day);

    if (!dayHours || dayHours.is_closed || !dayHours.open_time) continue;

    const [openHour, openMinute] = dayHours.open_time.split(':').map(Number);
    const openAt = new Date(date);
    openAt.setHours(openHour, openMinute || 0, 0, 0);

    if (offset === 0 && openAt <= now) continue;

    const timeLabel = formatTimeLabel(dayHours.open_time);
    if (offset === 0) return `Opens today at ${timeLabel}`;
    if (offset === 1) return `Opens tomorrow at ${timeLabel}`;
    return `Opens ${DAY_NAMES[day]} at ${timeLabel}`;
  }

  return 'No upcoming hours scheduled';
}

export function shouldShowStoreClosedView(
  isAcceptingOrders: boolean,
  hours: MerchantHour[],
  now = new Date(),
) {
  if (!isAcceptingOrders) return true;
  return !isWithinBusinessHours(hours, now);
}

export function getStoreClosedSubtitle(
  isAcceptingOrders: boolean,
  hours: MerchantHour[],
  now = new Date(),
) {
  if (!isAcceptingOrders) {
    return isWithinBusinessHours(hours, now)
      ? 'Orders are paused — open early to start accepting again'
      : getNextOpenLabel(hours, now);
  }

  return getNextOpenLabel(hours, now);
}
