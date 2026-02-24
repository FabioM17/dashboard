-- Migration: Add Facebook auth columns to integration_settings table
-- This allows storing Facebook OAuth credentials per organization

-- Modify the integration_settings table structure to support Facebook auth
-- The credentials JSONB will store:
-- {
--   "facebook_access_token": "...",
--   "facebook_user_id": "...",
--   "facebook_expires_at": "2026-01-22T...",
--   "waba_id": "...",
--   "waba_name": "...",
--   "phone_number_id": "...",
--   "phone_number": "..."
-- }

-- Note: The table already exists, we're just adding documentation
-- To store Facebook auth, use service_name='facebook' in integration_settings

-- Example usage in code:
-- INSERT INTO public.integration_settings (service_name, organization_id, credentials)
-- VALUES ('facebook', org_id, jsonb_build_object(
--   'facebook_access_token', token,
--   'facebook_user_id', user_id,
--   'facebook_expires_at', expires_at,
--   'waba_id', waba_id
-- ))
-- ON CONFLICT (organization_id, service_name) 
-- DO UPDATE SET credentials = EXCLUDED.credentials, updated_at = now();
