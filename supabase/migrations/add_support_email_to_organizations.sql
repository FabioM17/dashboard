-- Migration: Add support_email column to organizations table
-- Description: Adds support_email field to store the organization's support email address

ALTER TABLE public.organizations
ADD COLUMN support_email text;

-- Create index for potential queries by support email
CREATE INDEX idx_organizations_support_email ON public.organizations(support_email);
