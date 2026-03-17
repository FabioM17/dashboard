-- Add 'multiselect' to the allowed types for crm_property_definitions
-- (also re-includes 'country' added in the previous migration)
ALTER TABLE "public"."crm_property_definitions"
  DROP CONSTRAINT "crm_property_definitions_type_check";

ALTER TABLE "public"."crm_property_definitions"
  ADD CONSTRAINT "crm_property_definitions_type_check"
  CHECK (("type" = ANY (ARRAY[
    'text'::text,
    'number'::text,
    'date'::text,
    'select'::text,
    'multiselect'::text,
    'time'::text,
    'phone'::text,
    'percentage'::text,
    'country'::text
  ])));
