-- Venue operations: templates, enabled stations, extended job stations

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS venue_style text
    CHECK (venue_style IS NULL OR venue_style IN (
      'fast_food', 'sports_bar', 'fine_dining', 'cafe',
      'ghost_kitchen', 'delivery_only', 'custom'
    )),
  ADD COLUMN IF NOT EXISTS enabled_stations text[] NOT NULL
    DEFAULT '{counter,kitchen,manager,pos}';

ALTER TABLE delivery.merchant_team_members
  ADD COLUMN IF NOT EXISTS display_title text;

-- Widen station device enrollment
ALTER TABLE delivery.merchant_station_devices
  DROP CONSTRAINT IF EXISTS merchant_station_devices_station_check;

ALTER TABLE delivery.merchant_station_devices
  ADD CONSTRAINT merchant_station_devices_station_check
  CHECK (station IN (
    'counter', 'kitchen', 'manager', 'pos', 'bar', 'expo', 'drive_thru'
  ));

-- Sync job_station CHECK on team tables
ALTER TABLE delivery.merchant_team_members
  DROP CONSTRAINT IF EXISTS merchant_team_members_job_station_check;

ALTER TABLE delivery.merchant_team_members
  ADD CONSTRAINT merchant_team_members_job_station_check
  CHECK (job_station IS NULL OR job_station IN (
    'counter', 'kitchen', 'manager', 'pos', 'bar', 'expo', 'drive_thru'
  ));

ALTER TABLE delivery.merchant_team_invites
  DROP CONSTRAINT IF EXISTS merchant_team_invites_job_station_check;

ALTER TABLE delivery.merchant_team_invites
  ADD CONSTRAINT merchant_team_invites_job_station_check
  CHECK (job_station IS NULL OR job_station IN (
    'counter', 'kitchen', 'manager', 'pos', 'bar', 'expo', 'drive_thru'
  ));
