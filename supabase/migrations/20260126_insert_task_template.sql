-- Insert a sample WhatsApp template for task notifications
-- Replace <ORG_ID> with your organization UUID if needed

insert into meta_templates (id, organization_id, name, category, language, status, body, created_at)
values (
  gen_random_uuid(),
  '605a2c1c-4923-471c-ae79-135b4eaf27ff', -- replace with your org id or set to NULL
  'task_assignment',
  'utility',
  'es_ES',
  'approved',
  'Hola {{1}},\n\nSe te ha asignado la tarea: *{{2}}*.\nFecha de vencimiento: {{3}}.\n\nPor favor, revisa los detalles en la app.',
  now()
);

-- Notes:
-- 1) WhatsApp templates must be created and approved in Facebook Business Manager (WABA) to be usable.
-- 2) The `name` here (task_assignment) must match the template name configured in Meta.
-- 3) Placeholders here ({{1}}, {{2}}, {{3}}) are for human reference; actual template parameters are sent by the WhatsApp Cloud API when calling the template.
