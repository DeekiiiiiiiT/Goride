-- Migration: Add suspend metadata columns to driver_profiles
-- Enables admin actions: suspend, unsuspend with audit trail

-- Add suspend tracking columns
ALTER TABLE public.driver_profiles 
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add deactivation tracking (separate from suspend for audit clarity)
ALTER TABLE public.driver_profiles 
ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deactivated_reason TEXT,
ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for admin queries filtering by suspend/deactivate status
CREATE INDEX IF NOT EXISTS idx_driver_profiles_suspended_at ON public.driver_profiles(suspended_at) WHERE suspended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_profiles_deactivated_at ON public.driver_profiles(deactivated_at) WHERE deactivated_at IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.driver_profiles.suspended_at IS 'Timestamp when driver was suspended by admin';
COMMENT ON COLUMN public.driver_profiles.suspended_reason IS 'Admin-provided reason for suspension';
COMMENT ON COLUMN public.driver_profiles.suspended_by IS 'User ID of admin who suspended the driver';
COMMENT ON COLUMN public.driver_profiles.deactivated_at IS 'Timestamp when driver was deactivated by admin';
COMMENT ON COLUMN public.driver_profiles.deactivated_reason IS 'Admin-provided reason for deactivation';
COMMENT ON COLUMN public.driver_profiles.deactivated_by IS 'User ID of admin who deactivated the driver';
