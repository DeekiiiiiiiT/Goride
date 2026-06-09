import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { AssignedDriverSummaryDto } from '@roam/types/delegatedRide';

const DEFAULT_DRIVER_PHOTO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCZXJaKjzUahPFtn_kc0z6cep2KPKb-SRt6C82Jf5Wb_QcXpkDchP-XLOzCLpQ_ZCSYX_hKaY3SOy_eU3DI9Aw-mPvQXY_msvtgtg8mygaRhuUztTvwyPJs_WF8hPUfcfCXgGgqNFSkWNT4-LUTbDIeZQ5npAXE9r7X07puWio3_zSV55EVQblkv_c1GGLN92BkCOL4WbeqmtVgi03Bwotpi_jOTvtFCL8miF6A7bM4_4t4Bxabz8VOLfioyWC7jgw_DdS5VynI4EB7';

type Props = {
  assignedDriver?: AssignedDriverSummaryDto | null;
  serviceLabel: string;
  nameFallback?: string;
};

export function LiveRideDriverCard({
  assignedDriver,
  serviceLabel,
  nameFallback = 'Your driver',
}: Props) {
  const [vehicleDetailMode, setVehicleDetailMode] = useState<'plate' | 'vehicle'>('plate');

  const driverPhoto = assignedDriver?.profile_photo_url?.trim() || DEFAULT_DRIVER_PHOTO;
  const driverName = assignedDriver?.display_name?.trim() || nameFallback;
  const licensePlate = assignedDriver?.license_plate?.trim() || null;
  const vehicleLabel = assignedDriver?.vehicle_label?.trim() || serviceLabel;
  const plateDisplay = licensePlate ?? '—';
  const vehicleSecondary =
    vehicleDetailMode === 'plate'
      ? vehicleLabel
      : licensePlate ?? 'Plate unavailable';
  const primaryDisplay = vehicleDetailMode === 'plate' ? plateDisplay : vehicleLabel;

  return (
    <div className="live-ride-driver">
      <div className="live-ride-driver__left">
        <div className="live-ride-driver__avatar-wrap">
          <img src={driverPhoto} alt="Driver" className="live-ride-driver__avatar" />
          <span className="live-ride-driver__rating">
            4.9 <span className="live-ride-driver__rating-star" aria-hidden>★</span>
          </span>
        </div>
        <div>
          <p className="live-ride-driver__name">{driverName}</p>
          <p className="live-ride-driver__vehicle">{vehicleSecondary}</p>
        </div>
      </div>
      <button
        type="button"
        className="live-ride-driver__plate-col touch-manipulation active:opacity-80"
        onClick={() =>
          setVehicleDetailMode((mode) => (mode === 'plate' ? 'vehicle' : 'plate'))
        }
        aria-label={
          vehicleDetailMode === 'plate' ? 'Show vehicle details' : 'Show license plate'
        }
      >
        <span className="live-ride-driver__plate-icon" aria-hidden>
          <ArrowLeftRight className="size-6" strokeWidth={2} />
        </span>
        <p className="live-ride-driver__plate">{primaryDisplay}</p>
      </button>
    </div>
  );
}
