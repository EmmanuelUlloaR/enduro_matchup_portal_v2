-- ==============================================================================
-- Enduro Evolution 2026 — Match Up en Llamas
-- Supabase Schema & Realtime Configuration
-- ==============================================================================

-- 1. Extensiones necesarias
create extension if not exists "uuid-ossp";

-- 2. Tabla de Matchups
create table if not exists public.matchups (
    id uuid primary key default uuid_generate_v4(),
    nombre text not null,
    estado text not null default 'PRE-RACE' check (estado in ('PRE-RACE', 'EN CURSO', 'FINALIZADA')),
    fecha timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 3. Tabla de Participantes
create table if not exists public.participants (
    id uuid primary key default uuid_generate_v4(),
    matchup_id uuid not null references public.matchups(id) on delete cascade,
    nombre text not null,
    apodo text not null,
    apellido text not null,
    foto_url text not null,
    orden int not null default 1,
    created_at timestamptz not null default now()
);

-- 4. Tabla de Etapas (Stages)
create table if not exists public.stages (
    id uuid primary key default uuid_generate_v4(),
    matchup_id uuid not null references public.matchups(id) on delete cascade,
    numero int not null check (numero between 1 and 4),
    estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'EN CURSO', 'FINALIZADA')),
    created_at timestamptz not null default now(),
    unique(matchup_id, numero)
);

-- 5. Tabla de Tiempos de Etapa (Stage Times)
-- Almacena el tiempo en milisegundos (time_ms)
create table if not exists public.stage_times (
    id uuid primary key default uuid_generate_v4(),
    stage_id uuid not null references public.stages(id) on delete cascade,
    participant_id uuid not null references public.participants(id) on delete cascade,
    time_ms bigint not null check (time_ms >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(stage_id, participant_id)
);

-- 6. Habilitar Row Level Security (RLS)
alter table public.matchups enable row level security;
alter table public.participants enable row level security;
alter table public.stages enable row level security;
alter table public.stage_times enable row level security;

-- Políticas de lectura pública (anon)
create policy "Lectura pública para matchups" on public.matchups
    for select to anon, authenticated using (true);

create policy "Lectura pública para participants" on public.participants
    for select to anon, authenticated using (true);

create policy "Lectura pública para stages" on public.stages
    for select to anon, authenticated using (true);

create policy "Lectura pública para stage_times" on public.stage_times
    for select to anon, authenticated using (true);

-- Políticas de escritura (insert/update/delete)
-- Para este portal web de evento, permitimos acceso con la anon key configurada en el portal.
create policy "Modificación de matchups" on public.matchups
    for all to anon, authenticated using (true) with check (true);

create policy "Modificación de participants" on public.participants
    for all to anon, authenticated using (true) with check (true);

create policy "Modificación de stages" on public.stages
    for all to anon, authenticated using (true) with check (true);

create policy "Modificación de stage_times" on public.stage_times
    for all to anon, authenticated using (true) with check (true);

-- 7. Habilitar Realtime para las tablas relevantes
-- Full replica identity para recibir valores previos y actualizados
alter table public.matchups replica identity full;
alter table public.stages replica identity full;
alter table public.stage_times replica identity full;

-- Agregar a la publicación supabase_realtime
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table public.matchups, public.stages, public.stage_times;
commit;

-- 8. Datos semilla (Seed Data Inicial)
do $$
declare
    v_matchup_id uuid;
    v_fabio_id uuid;
    v_luis_id uuid;
    v_stage1_id uuid;
    v_stage2_id uuid;
    v_stage3_id uuid;
    v_stage4_id uuid;
begin
    -- Matchup 1: Fabio Silvestri vs Luis Peña
    select id into v_matchup_id from public.matchups limit 1;

    if v_matchup_id is null then
        insert into public.matchups (nombre, estado)
        values ('Enduro Evolution 2026 — Match Up en Llamas', 'PRE-RACE')
        returning id into v_matchup_id;

        insert into public.participants (matchup_id, nombre, apodo, apellido, foto_url, orden)
        values (v_matchup_id, 'Fabio', '“La Polinada”', 'SILVESTRI', 'assets/fabio.png', 1)
        returning id into v_fabio_id;

        insert into public.participants (matchup_id, nombre, apodo, apellido, foto_url, orden)
        values (v_matchup_id, 'Luis', '“Don Gata”', 'PEÑA', 'assets/luis.png', 2)
        returning id into v_luis_id;

        insert into public.stages (matchup_id, numero, estado) values (v_matchup_id, 1, 'PENDIENTE') returning id into v_stage1_id;
        insert into public.stages (matchup_id, numero, estado) values (v_matchup_id, 2, 'PENDIENTE') returning id into v_stage2_id;
        insert into public.stages (matchup_id, numero, estado) values (v_matchup_id, 3, 'PENDIENTE') returning id into v_stage3_id;
        insert into public.stages (matchup_id, numero, estado) values (v_matchup_id, 4, 'PENDIENTE') returning id into v_stage4_id;
    end if;

    -- Matchup 2: Ramón Reyes vs Ricky Tarrazo
    if (select count(*) from public.matchups) < 2 then
        declare
            v_m2_id uuid;
            v_ramon_id uuid;
            v_ricky_id uuid;
        begin
            insert into public.matchups (nombre, estado)
            values ('Matchup 2 — Ramón Reyes vs Ricky Tarrazo', 'PRE-RACE')
            returning id into v_m2_id;

            insert into public.participants (matchup_id, nombre, apodo, apellido, foto_url, orden)
            values (v_m2_id, 'Ramón', '“El Patrón”', 'REYES', 'assets/ramon.png', 1)
            returning id into v_ramon_id;

            insert into public.participants (matchup_id, nombre, apodo, apellido, foto_url, orden)
            values (v_m2_id, 'Ricky', '“Chuquiton”', 'TARRAZO', 'assets/ricky.png', 2)
            returning id into v_ricky_id;

            insert into public.stages (matchup_id, numero, estado) values (v_m2_id, 1, 'PENDIENTE');
            insert into public.stages (matchup_id, numero, estado) values (v_m2_id, 2, 'PENDIENTE');
            insert into public.stages (matchup_id, numero, estado) values (v_m2_id, 3, 'PENDIENTE');
            insert into public.stages (matchup_id, numero, estado) values (v_m2_id, 4, 'PENDIENTE');
        end;
    end if;
end $$;
