import type { JobStation } from '../../types/team';

export const MOCK_STORE_NAME = 'Island Spice Kitchen';
export const MOCK_PAIRING_CODE = 'ROAM-7K4M';

export const MOCK_STATION_LINKS: Record<JobStation, string> = {
  counter: 'https://partner.roamdash.co/tablet?code=ROAM-7K4M&station=counter',
  kitchen: 'https://partner.roamdash.co/tablet?code=ROAM-7K4M&station=kitchen',
  manager: 'https://partner.roamdash.co/tablet?code=ROAM-7K4M&station=manager',
};

export const MOCK_PAIRING_FLAGS = {
  staffOperationsEnabled: true,
  staffStationPinEnabled: true,
};
