-- Tabla mejorada para scheduled_notifications
create table if not exists scheduled_notifications (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid references organizations(id) on delete cascade,  -- opcional: FK si tienes tabla organizations
  assignee_id         uuid references profiles(id),                         -- FK a quien recibe la notificación
  task_id             uuid references tasks(id) on delete cascade,          -- FK a la tarea
  payload             jsonb not null,
  send_at             timestamptz not null,
  sent                boolean default false,
  sent_at             timestamptz,                                          -- cuándo se envió con éxito
  attempts            integer default 0,                                    -- número de intentos
  last_error          text,                                                 -- último mensaje de error (para debug)
  failed              boolean default false,                                -- marcado como fallido permanente
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Índices útiles (agrega si no existen)
create index if not exists idx_scheduled_notifications_send_at_sent 
  on scheduled_notifications (send_at) 
  where sent = false and failed = false;

create index if not exists idx_scheduled_notifications_organization 
  on scheduled_notifications (organization_id);

create index if not exists idx_scheduled_notifications_assignee 
  on scheduled_notifications (assignee_id);

-- Trigger opcional para updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trig_scheduled_notifications_updated_at
  before update on scheduled_notifications
  for each row execute function update_updated_at();