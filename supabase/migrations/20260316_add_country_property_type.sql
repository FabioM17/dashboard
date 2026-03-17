-- Add 'country' to the allowed types for crm_property_definitions
ALTER TABLE "public"."crm_property_definitions"
  DROP CONSTRAINT "crm_property_definitions_type_check";

ALTER TABLE "public"."crm_property_definitions"
  ADD CONSTRAINT "crm_property_definitions_type_check"
  CHECK (("type" = ANY (ARRAY[
    'text'::text,
    'number'::text,
    'date'::text,
    'select'::text,
    'time'::text,
    'phone'::text,
    'percentage'::text,
    'country'::text
  ])));
