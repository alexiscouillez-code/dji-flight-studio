-- DJI FLIGHT STUDIO — initial schema (Phase 1)
-- Principles: UUID keys, timestamps, constraints, RLS on every table, owner-only access.

-- gen_random_uuid() is built into Postgres ≥ 13: no extension needed.

-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := coalesce(new.updated_at, now());
  if tg_op = 'UPDATE' and new.updated_at = old.updated_at then new.updated_at := now(); end if;
  return new;
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- ---------- user_preferences ----------
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  graphics_quality text not null default 'medium' check (graphics_quality in ('low','medium','high','ultra')),
  units text not null default 'metric' check (units in ('metric')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- drone_profiles (public catalogue, read-only for clients) ----------
create table public.drone_profiles (
  id text primary key,
  name text not null,
  mode text not null check (mode in ('manual-companion','sdk-adapter')),
  capabilities jsonb not null,
  verified_on date not null,
  sources jsonb not null default '[]'::jsonb
);
insert into public.drone_profiles (id, name, mode, capabilities, verified_on, sources) values
  ('dji-neo-2', 'DJI Neo 2', 'manual-companion', '{"manual-companion": true}'::jsonb, '2026-11-17',
   '["https://www.dji.com/neo-2/faq"]'::jsonb);

-- ---------- projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  archived boolean not null default false,
  schema_version int not null check (schema_version >= 1),
  drone_profile_id text references public.drone_profiles(id),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 5242880),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------- project_versions (automatic snapshots) ----------
create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version int not null,
  schema_version int not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);
create index project_versions_project_idx on public.project_versions (project_id, version desc);

create or replace function public.snapshot_project() returns trigger
language plpgsql security definer set search_path = public as $$
declare next_v int;
begin
  select coalesce(max(version), 0) + 1 into next_v from public.project_versions where project_id = new.id;
  insert into public.project_versions (project_id, owner_id, version, schema_version, data)
  values (new.id, new.owner_id, next_v, new.schema_version, new.data);
  -- keep the 50 most recent snapshots per project
  delete from public.project_versions
   where project_id = new.id and version <= next_v - 50;
  return new;
end $$;
create trigger projects_snapshot after insert or update of data on public.projects
  for each row execute function public.snapshot_project();

-- ---------- missions (Phase 3+) ----------
create table public.missions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  altitude_reference text not null check (altitude_reference in ('terrain_msl','drone_amsl','takeoff_relative','agl','virtual')),
  interpolation text not null default 'catmull-rom' check (interpolation in ('linear','catmull-rom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index missions_project_idx on public.missions (project_id);
create trigger missions_updated_at before update on public.missions for each row execute function public.set_updated_at();

create table public.mission_waypoints (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seq int not null check (seq >= 0),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  altitude_m double precision not null,
  altitude_source text not null,
  heading_deg double precision check (heading_deg >= 0 and heading_deg < 360),
  gimbal_pitch_deg double precision check (gimbal_pitch_deg between -90 and 30),
  speed_ms double precision check (speed_ms > 0 and speed_ms <= 30),
  pause_s double precision not null default 0 check (pause_s between 0 and 600),
  camera_mode text not null default 'free' check (camera_mode in ('free','look-at-subject','fixed-heading')),
  unique (mission_id, seq)
);

create table public.mission_sequences (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  start_s double precision not null check (start_s >= 0),
  duration_s double precision not null check (duration_s > 0),
  move_type text not null,
  params jsonb not null default '{}'::jsonb
);
create index mission_sequences_mission_idx on public.mission_sequences (mission_id, start_s);

create table public.cinematic_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade, -- null = built-in preset
  move_type text not null,
  name text not null check (char_length(name) between 1 and 80),
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  created_at timestamptz not null default now()
);
create index saved_locations_owner_idx on public.saved_locations (owner_id);

create table public.gpx_tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text,
  storage_path text not null, -- file in the private 'gpx' bucket: <owner_id>/<uuid>.gpx
  point_count int not null check (point_count >= 2),
  distance_m double precision not null check (distance_m >= 0),
  ascent_m double precision,
  descent_m double precision,
  created_at timestamptz not null default now()
);
create index gpx_tracks_owner_idx on public.gpx_tracks (owner_id);

create table public.simulation_results (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  params jsonb not null,
  stats jsonb not null, -- always simulation estimates
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.drone_profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_versions enable row level security;
alter table public.missions enable row level security;
alter table public.mission_waypoints enable row level security;
alter table public.mission_sequences enable row level security;
alter table public.cinematic_presets enable row level security;
alter table public.saved_locations enable row level security;
alter table public.gpx_tracks enable row level security;
alter table public.simulation_results enable row level security;

create policy "own profile" on public.profiles for all using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own prefs" on public.user_preferences for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "catalogue readable" on public.drone_profiles for select to authenticated, anon using (true);

create policy "own projects" on public.projects for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own project versions (read)" on public.project_versions for select to authenticated
  using (owner_id = (select auth.uid()));

-- child tables: owner must match AND parent must belong to the same owner
create policy "own missions" on public.missions for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "own waypoints" on public.mission_waypoints for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.missions m where m.id = mission_id and m.owner_id = (select auth.uid())));
create policy "own sequences" on public.mission_sequences for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.missions m where m.id = mission_id and m.owner_id = (select auth.uid())));
create policy "presets read" on public.cinematic_presets for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "presets write" on public.cinematic_presets for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own locations" on public.saved_locations for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own gpx" on public.gpx_tracks for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own simulations" on public.simulation_results for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.missions m where m.id = mission_id and m.owner_id = (select auth.uid())));

-- ---------- Storage: private GPX bucket, one folder per user ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gpx', 'gpx', false, 10485760, array['application/gpx+xml','application/xml','text/xml'])
on conflict (id) do nothing;

create policy "gpx own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'gpx' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "gpx own folder write" on storage.objects for insert to authenticated
  with check (bucket_id = 'gpx' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "gpx own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'gpx' and (storage.foldername(name))[1] = (select auth.uid())::text);
