/** Failed-delivery steps the server checks before a post-pickup outcome. */
export type AttemptRow = {
  attempt_type?: string | null;
  at?: string | null;
  wait_seconds?: number | null;
  photo_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function kmBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function stamp(row: AttemptRow): number | null {
  if (!row.at) return null;
  const ms = Date.parse(row.at);
  return Number.isFinite(ms) ? ms : null;
}

/** Wait is the gap between the first call or text and the photo. The phone's timer is ignored. */
export function protocolReady(
  attempts: AttemptRow[],
  dropoff?: { latitude?: number | null; longitude?: number | null } | null,
): boolean {
  const contacts = attempts.filter((row) => row.attempt_type === "call" || row.attempt_type === "sms");
  const photos = attempts.filter((row) => row.attempt_type === "photo" && Boolean(row.photo_url));
  const contactAt = contacts.map(stamp).filter((ms): ms is number => ms != null);
  const photoAt = photos.map(stamp).filter((ms): ms is number => ms != null);
  const waited = contactAt.length > 0 && photoAt.length > 0
    && Math.min(...photoAt) - Math.min(...contactAt) >= 300_000;
  const dropLat = dropoff?.latitude != null ? Number(dropoff.latitude) : null;
  const dropLng = dropoff?.longitude != null ? Number(dropoff.longitude) : null;
  if (dropLat == null || dropLng == null || !Number.isFinite(dropLat) || !Number.isFinite(dropLng)) return false;
  const place = attempts.some((row) => {
    if (row.latitude == null || row.longitude == null) return false;
    return kmBetween(Number(row.latitude), Number(row.longitude), dropLat, dropLng) <= 0.3;
  });
  return contacts.length >= 2 && waited && photos.length > 0 && place;
}
