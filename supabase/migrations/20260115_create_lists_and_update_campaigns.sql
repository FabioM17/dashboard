-- Crear tabla lists para CRM
create table if not exists public.lists (
  id uuid not null default gen_random_uuid(),
  name text not null,
  filters jsonb default '[]'::jsonb, -- Array de objetos {field, comparison, value}
  manual_contact_ids text[] default '{}'::text[], -- IDs de contactos agregados manualmente
  inactive_contact_ids text[] default '{}'::text[], -- IDs de contactos desactivados
  organization_id uuid not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint lists_pkey primary key (id),
  constraint lists_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade
);

-- Índices para lists
create index if not exists lists_organization_id_idx on public.lists(organization_id);
create index if not exists lists_created_at_idx on public.lists(created_at desc);

-- Actualizar tabla campaigns (agregar campos faltantes)
do $$ 
begin
  -- Agregar template_language si no existe
  if not exists (select 1 from information_schema.columns 
                 where table_schema='public' and table_name='campaigns' and column_name='template_language') then
    alter table public.campaigns add column template_language text;
  end if;
  
  -- Agregar created_by si no existe
  if not exists (select 1 from information_schema.columns 
                 where table_schema='public' and table_name='campaigns' and column_name='created_by') then
    alter table public.campaigns add column created_by uuid;
  end if;
end $$;

-- Agregar foreign key a organization_id en campaigns si no existe
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_schema='public' 
    and table_name='campaigns' 
    and constraint_name='campaigns_organization_id_fkey'
  ) then
    alter table public.campaigns 
    add constraint campaigns_organization_id_fkey 
    foreign key (organization_id) references public.organizations(id) on delete cascade;
  end if;
  
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_schema='public' 
    and table_name='campaigns' 
    and constraint_name='campaigns_created_by_fkey'
  ) then
    alter table public.campaigns 
    add constraint campaigns_created_by_fkey 
    foreign key (created_by) references public.profiles(id) on delete set null;
  end if;
end $$;

-- Índices para campaigns (crear solo si no existen)
create index if not exists campaigns_organization_id_idx on public.campaigns(organization_id);
create index if not exists campaigns_status_idx on public.campaigns(status);
create index if not exists campaigns_created_at_idx on public.campaigns(created_at desc);

-- Habilitar RLS en ambas tablas
alter table public.lists enable row level security;
alter table public.campaigns enable row level security;

-- Políticas RLS para lists
-- Política de SELECT: los usuarios pueden ver las listas de su organización
create policy "Users can view lists from their organization"
  on public.lists for select
  using (
    organization_id in (
      select organization_id 
      from public.profiles 
      where id = auth.uid()
    )
  );

-- Política de INSERT: los usuarios pueden crear listas en su organización
create policy "Users can create lists in their organization"
  on public.lists for insert
  with check (
    organization_id in (
      select organization_id 
      from public.profiles 
      where id = auth.uid()
    )
  );

-- Política de UPDATE: los usuarios pueden actualizar listas de su organización
create policy "Users can update lists from their organization"
  on public.lists for update
  using (
    organization_id in (
      select organization_id 
      from public.profiles 
      where id = auth.uid()
    )
  );

-- Política de DELETE: los usuarios pueden eliminar listas de su organización
create policy "Users can delete lists from their organization"
  on public.lists for delete
  using (
    organization_id in (
      select organization_id 
      from public.profiles 
      where id = auth.uid()
    )
  );

-- Políticas RLS para campaigns
-- Política de SELECT: los usuarios pueden ver las campañas de su organización
create policy "Users can view campaigns from their organization"
  on public.campaigns for select
  using (
    organization_id in (
      select organization_id 
      from public.profiles 
      where id = auth.uid()
    )
  );

-- Política de INSERT: los usuarios pueden crear campañas en su organización
create policy "Users can create campaigns in their organization"
  on public.campaigns for insert
  with check (
    organization_id in (
      select organization_id 
      from public.profiles 
      where id = auth.uid()
    )
  );

-- Política de UPDATE: los usuarios pueden actualizar campañas de su organización
create policy "Users can update campaigns from their organization"
  on public.campaigns for update
  using (
    organization_id in (
      select organization_id 
      from public.profiles 
      where id = auth.uid()
    )
  );

-- Política de DELETE: los usuarios pueden eliminar campañas de su organización
create policy "Users can delete campaigns from their organization"
  on public.campaigns for delete
  using (
    organization_id in (
      select organization_id 
      from public.profiles 
      where id = auth.uid()
    )
  );

-- Trigger para actualizar updated_at en lists
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_lists_updated_at before update on public.lists
  for each row execute function update_updated_at_column();

-- Comentarios para documentación
comment on table public.lists is 'Listas dinámicas del CRM basadas en filtros y selección manual';
comment on column public.lists.filters is 'Array JSON de objetos de filtro {field, comparison, value}';
comment on column public.lists.manual_contact_ids is 'IDs de contactos agregados manualmente a la lista';
comment on column public.lists.inactive_contact_ids is 'IDs de contactos desactivados en la lista';

comment on table public.campaigns is 'Campañas masivas de email y WhatsApp';
comment on column public.campaigns.stats is 'Estadísticas de la campaña: {sent, delivered, read, failed}';
comment on column public.campaigns.recipient_ids is 'Array de IDs de contactos destinatarios';
