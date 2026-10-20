-- ManagePASMUN database schema
-- Run this whole file once in Supabase -> SQL Editor. It is safe to re-run on a fresh project.

-- ───────────────────────── Settings / branding ─────────────────────────
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  conference_name text not null default 'PASMUN 2026 (Placeholder Name)',
  short_name text not null default 'PASMUN',
  tagline text not null default 'Placeholder tagline - edit me in Admin > Branding',
  conference_dates text not null default '[Placeholder dates]',
  venue text not null default '[Placeholder venue]',
  logo_url text,
  primary_color text not null default '#1e40af',
  accent_color text not null default '#f59e0b',
  default_speaking_sec int not null default 90
);
insert into public.settings default values on conflict do nothing;

-- ───────────────────────── Users ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'pending' check (role in ('high_command', 'chair', 'pending')),
  created_at timestamptz not null default now()
);

-- Every new auth user starts as 'pending' (no access). Roles are only granted by High Command
-- through the server API (service role) or the bootstrap script. User metadata is never trusted.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'pending')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Committees ─────────────────────────
create table if not exists public.committees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbreviation text not null default '',
  topic text not null default '[Placeholder topic]',
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.committee_chairs (
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (committee_id, user_id)
);

create table if not exists public.committee_state (
  committee_id uuid primary key references public.committees(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_session', 'suspended', 'adjourned')),
  mode text not null default 'formal' check (mode in ('formal', 'moderated', 'unmoderated', 'voting')),
  current_speaker_id uuid,
  speaker_timer jsonb not null default '{"duration_ms":0,"remaining_ms":0,"running":false,"started_at":null}',
  caucus_timer jsonb not null default '{"duration_ms":0,"remaining_ms":0,"running":false,"started_at":null}',
  speaking_time_sec int not null default 90,
  caucus_topic text,
  caucus_speaking_sec int,
  session_started_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.create_committee_state() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.committee_state (committee_id, speaking_time_sec)
  values (new.id, (select default_speaking_sec from public.settings where id = 1))
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_committee_created on public.committees;
create trigger on_committee_created after insert on public.committees
  for each row execute function public.create_committee_state();

-- ───────────────────────── Floor data ─────────────────────────
create table if not exists public.delegates (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  name text not null default '',
  country text not null,
  attendance text not null default 'absent' check (attendance in ('absent', 'present', 'present_and_voting')),
  created_at timestamptz not null default now()
);

create table if not exists public.speakers_list (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  delegate_id uuid not null references public.delegates(id) on delete cascade,
  position double precision not null default (extract(epoch from now()) * 1000),
  status text not null default 'queued' check (status in ('queued', 'speaking', 'spoke')),
  source text not null default 'gsl' check (source in ('gsl', 'caucus')),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  kind text not null check (kind in ('motion', 'point')),
  type text not null,
  delegate_id uuid references public.delegates(id) on delete set null,
  details text,
  duration_sec int,
  speaking_sec int,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  title text not null,
  kind text not null default 'procedural' check (kind in ('procedural', 'substantive')),
  threshold text not null default 'simple' check (threshold in ('simple', 'two_thirds')),
  status text not null default 'open' check (status in ('open', 'closed')),
  result text check (result in ('passed', 'failed')),
  final_for int,
  final_against int,
  final_abstain int,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.vote_records (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references public.votes(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  delegate_id uuid not null references public.delegates(id) on delete cascade,
  choice text not null check (choice in ('for', 'against', 'abstain')),
  explanation text check (explanation in ('requested', 'given')),
  unique (vote_id, delegate_id)
);
-- For databases created before right-of-explanation existed:
alter table public.vote_records add column if not exists explanation text check (explanation in ('requested', 'given'));

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  severity text not null default 'info' check (severity in ('info', 'urgent')),
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- archive_id is set when a reset archives a document (file stays in storage).
create table if not exists public.archive_records (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  counts jsonb not null default '{}',
  snapshot jsonb not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid references public.committees(id) on delete set null,
  title text not null,
  kind text not null default 'draft_resolution' check (kind in ('draft_resolution', 'crisis', 'other')),
  file_path text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  archive_id uuid references public.archive_records(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Helper functions ─────────────────────────
create or replace function public.is_high_command() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'high_command')
$$;

create or replace function public.is_chair_of(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.committee_chairs cc
    join public.profiles p on p.id = cc.user_id
    where cc.committee_id = cid and cc.user_id = auth.uid() and p.role in ('chair', 'high_command')
  )
$$;

create or replace function public.can_run(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_high_command() or public.is_chair_of(cid)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('chair', 'high_command'))
$$;

-- Server clock so every device can correct for local clock drift (used by timers).
create or replace function public.server_now() returns timestamptz
language sql volatile as $$ select clock_timestamp() $$;

-- Document storage path rules: '<committee uuid>/<file>' or 'global/<file>'.
create or replace function public.can_access_doc_path(p text, p_write boolean default false) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare folder text := split_part(p, '/', 1);
begin
  if public.is_high_command() then return true; end if;
  if folder = 'global' then return (not p_write) and public.is_staff(); end if;
  if folder ~ '^[0-9a-fA-F-]{36}$' then return public.is_chair_of(folder::uuid); end if;
  return false;
end $$;

-- ───────────────────────── Row level security ─────────────────────────
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.committees enable row level security;
alter table public.committee_chairs enable row level security;
alter table public.committee_state enable row level security;
alter table public.delegates enable row level security;
alter table public.speakers_list enable row level security;
alter table public.events enable row level security;
alter table public.votes enable row level security;
alter table public.vote_records enable row level security;
alter table public.announcements enable row level security;
alter table public.documents enable row level security;
alter table public.archive_records enable row level security;

-- settings: public read (branding), High Command write
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for update using (public.is_high_command()) with check (public.is_high_command());

-- profiles: see yourself; High Command sees/edits everyone (role changes go through the server API)
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.is_high_command());
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for all using (public.is_high_command()) with check (public.is_high_command());

-- committees: public read (landing page + projection screen), High Command write
drop policy if exists committees_read on public.committees;
create policy committees_read on public.committees for select using (true);
drop policy if exists committees_write on public.committees;
create policy committees_write on public.committees for all using (public.is_high_command()) with check (public.is_high_command());

drop policy if exists chairs_read on public.committee_chairs;
create policy chairs_read on public.committee_chairs for select using (user_id = auth.uid() or public.is_high_command());
drop policy if exists chairs_write on public.committee_chairs;
create policy chairs_write on public.committee_chairs for all using (public.is_high_command()) with check (public.is_high_command());

-- announcements: public read, High Command write
drop policy if exists ann_read on public.announcements;
create policy ann_read on public.announcements for select using (true);
drop policy if exists ann_write on public.announcements;
create policy ann_write on public.announcements for all using (public.is_high_command()) with check (public.is_high_command());

-- floor tables: public read (projection screen), write only for that committee's chairs or High Command
do $$
declare t text;
begin
  foreach t in array array['committee_state', 'delegates', 'speakers_list', 'events', 'votes', 'vote_records'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using (public.can_run(committee_id)) with check (public.can_run(committee_id))', t || '_write', t);
  end loop;
end $$;

-- documents: staff only (never shown on the projection screen)
drop policy if exists docs_read on public.documents;
create policy docs_read on public.documents for select using (
  public.is_high_command()
  or (committee_id is not null and public.is_chair_of(committee_id))
  or (committee_id is null and archive_id is null and public.is_staff())
);
drop policy if exists docs_write on public.documents;
create policy docs_write on public.documents for all
  using (public.is_high_command() or (committee_id is not null and public.is_chair_of(committee_id)))
  with check (public.is_high_command() or (committee_id is not null and public.is_chair_of(committee_id)));

drop policy if exists archive_all on public.archive_records;
create policy archive_all on public.archive_records for all using (public.is_high_command()) with check (public.is_high_command());

-- ───────────────────────── Realtime ─────────────────────────
alter table public.committee_state replica identity full;
alter table public.delegates replica identity full;
alter table public.speakers_list replica identity full;
alter table public.events replica identity full;
alter table public.votes replica identity full;
alter table public.vote_records replica identity full;
alter table public.documents replica identity full;

do $$
declare t text;
begin
  foreach t in array array['settings', 'committees', 'committee_state', 'delegates', 'speakers_list', 'events', 'votes', 'vote_records', 'announcements', 'documents'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ───────────────────────── Live analytics view ─────────────────────────
drop view if exists public.committee_analytics;
create view public.committee_analytics with (security_invoker = true) as
select
  c.id as committee_id, c.name, c.abbreviation, c.topic,
  coalesce(s.status, 'not_started') as status, coalesce(s.mode, 'formal') as mode, s.session_started_at,
  (select count(*) from public.delegates d where d.committee_id = c.id) as delegates_total,
  (select count(*) from public.delegates d where d.committee_id = c.id and d.attendance <> 'absent') as delegates_present,
  (select count(*) from public.speakers_list l where l.committee_id = c.id and l.status = 'queued') as speakers_queued,
  (select count(*) from public.speakers_list l where l.committee_id = c.id and l.status = 'spoke') as speeches_given,
  (select count(*) from public.events e where e.committee_id = c.id and e.kind = 'motion') as motions_total,
  (select count(*) from public.events e where e.committee_id = c.id and e.kind = 'motion' and e.status = 'passed') as motions_passed,
  (select count(*) from public.events e where e.committee_id = c.id and e.kind = 'point') as points_total,
  (select count(*) from public.votes v where v.committee_id = c.id) as votes_total,
  (select count(*) from public.votes v where v.committee_id = c.id and v.status = 'open') as votes_open
from public.committees c
left join public.committee_state s on s.committee_id = c.id;

-- ───────────────────────── Archive + reset ─────────────────────────
create or replace function public.build_archive_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'taken_at', now(),
    'settings', (select to_jsonb(s) from public.settings s where id = 1),
    'committees', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.committees x),
    'committee_chairs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.committee_chairs x),
    'committee_state', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.committee_state x),
    'delegates', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.delegates x),
    'speakers_list', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.speakers_list x),
    'events', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.events x),
    'votes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.votes x),
    'vote_records', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.vote_records x),
    'announcements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.announcements x),
    'documents', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.documents x where archive_id is null)
  )
$$;

create or replace function public.build_archive_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'committees', (select count(*) from public.committees),
    'delegates', (select count(*) from public.delegates),
    'speeches', (select count(*) from public.speakers_list where status = 'spoke'),
    'motions_and_points', (select count(*) from public.events),
    'votes', (select count(*) from public.votes),
    'announcements', (select count(*) from public.announcements),
    'documents', (select count(*) from public.documents where archive_id is null)
  )
$$;

create or replace function public.admin_create_archive(p_label text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_high_command() then raise exception 'Only High Command can archive'; end if;
  insert into public.archive_records (label, counts, snapshot, created_by)
  values (coalesce(nullif(trim(p_label), ''), 'Archive ' || to_char(now(), 'YYYY-MM-DD HH24:MI')),
          public.build_archive_counts(), public.build_archive_snapshot(), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Archives everything, then purges live session data. Optionally wipes the committee structure too.
-- User accounts, branding and uploaded files are kept (documents are marked as archived).
create or replace function public.admin_reset_system(p_label text, p_wipe_structure boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_high_command() then raise exception 'Only High Command can reset the system'; end if;
  v_id := public.admin_create_archive(p_label);

  update public.documents set archive_id = v_id where archive_id is null;
  delete from public.vote_records where true;
  delete from public.votes where true;
  delete from public.events where true;
  delete from public.speakers_list where true;
  delete from public.announcements where true;

  update public.committee_state set
    status = 'not_started', mode = 'formal', current_speaker_id = null,
    speaker_timer = '{"duration_ms":0,"remaining_ms":0,"running":false,"started_at":null}',
    caucus_timer = '{"duration_ms":0,"remaining_ms":0,"running":false,"started_at":null}',
    caucus_topic = null, caucus_speaking_sec = null, session_started_at = null, updated_at = now()
  where true;
  update public.delegates set attendance = 'absent' where true;

  if p_wipe_structure then
    delete from public.delegates where true;
    delete from public.committee_chairs where true;
    delete from public.committees where true;
  end if;
  return v_id;
end $$;

grant execute on function public.admin_create_archive(text) to authenticated;
grant execute on function public.admin_reset_system(text, boolean) to authenticated;
grant execute on function public.server_now() to anon, authenticated;

-- ───────────────────────── Storage ─────────────────────────
insert into storage.buckets (id, name, public) values ('branding', 'branding', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;

drop policy if exists branding_read on storage.objects;
create policy branding_read on storage.objects for select using (bucket_id = 'branding');
drop policy if exists branding_write on storage.objects;
create policy branding_write on storage.objects for all
  using (bucket_id = 'branding' and public.is_high_command())
  with check (bucket_id = 'branding' and public.is_high_command());

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects for select
  using (bucket_id = 'documents' and public.can_access_doc_path(name, false));
drop policy if exists documents_insert on storage.objects;
create policy documents_insert on storage.objects for insert
  with check (bucket_id = 'documents' and public.can_access_doc_path(name, true));
drop policy if exists documents_update on storage.objects;
create policy documents_update on storage.objects for update
  using (bucket_id = 'documents' and public.can_access_doc_path(name, true));
drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects for delete
  using (bucket_id = 'documents' and public.can_access_doc_path(name, true));

-- ═════════════ 002: sessions, participation grading, rubric ═════════════
-- 002: sessions, roll call per session, participation grading, warnings, awards, rubric.
-- Run once in Supabase -> SQL Editor on your LIVE database. Additive and re-runnable:
-- nothing existing is dropped or rewritten except the archive/reset functions (replaced to include new data).

-- ───────────── Settings ─────────────
alter table public.settings add column if not exists explanation_points numeric not null default 1;

-- ───────────── Sessions ─────────────
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  number int not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (committee_id, number)
);

alter table public.committee_state
  add column if not exists current_session_id uuid references public.sessions(id) on delete set null;

-- Roll call per session (the live roll call stays on delegates.attendance; this keeps the history).
create table if not exists public.session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  delegate_id uuid not null references public.delegates(id) on delete cascade,
  attendance text not null default 'absent' check (attendance in ('absent', 'present', 'present_and_voting')),
  late boolean not null default false,
  unique (session_id, delegate_id)
);

-- "Left room / returned" log.
create table if not exists public.delegate_absences (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  delegate_id uuid not null references public.delegates(id) on delete cascade,
  left_at timestamptz not null default now(),
  returned_at timestamptz
);

-- ───────────── Participation grading ─────────────
create table if not exists public.participation_entries (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  delegate_id uuid not null references public.delegates(id) on delete cascade,
  category text not null check (category in ('sl_speech', 'sl_question', 'mc', 'umc', 'wp', 'rp')),
  level_key text not null,
  score numeric not null,
  label text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists participation_entries_idx on public.participation_entries (committee_id, session_id, delegate_id);

create table if not exists public.participation_notes (
  committee_id uuid not null references public.committees(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  delegate_id uuid not null references public.delegates(id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (session_id, delegate_id)
);

create table if not exists public.warnings (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  delegate_id uuid not null references public.delegates(id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.awards (
  committee_id uuid not null references public.committees(id) on delete cascade,
  award text not null check (award in ('best_delegate', 'outstanding_delegate', 'honorific_mention', 'best_position_paper')),
  delegate_id uuid not null references public.delegates(id) on delete cascade,
  primary key (committee_id, award)
);

-- Editable rubric (High Command edits it under Admin -> Grading rubric).
create table if not exists public.rubric_levels (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('sl_speech', 'sl_question', 'mc', 'umc', 'wp', 'rp')),
  level_key text not null,
  label text not null,
  description text not null default '',
  score numeric not null,
  sort int not null default 0,
  unique (category, level_key)
);

-- ───────────── Existing tables: new columns ─────────────
alter table public.events add column if not exists session_id uuid references public.sessions(id) on delete set null;
alter table public.events add column if not exists reason text;
alter table public.votes add column if not exists session_id uuid references public.sessions(id) on delete set null;
alter table public.votes add column if not exists label text;

-- ───────────── Right of explanation: In favor / Against only ─────────────
-- Abstentions never carry an explanation, whatever the client sends.
update public.vote_records set explanation = null where choice = 'abstain' and explanation is not null;

create or replace function public.clear_abstain_explanation() returns trigger
language plpgsql as $$
begin
  if new.choice = 'abstain' then new.explanation := null; end if;
  return new;
end $$;

drop trigger if exists vote_records_no_abstain_explanation on public.vote_records;
create trigger vote_records_no_abstain_explanation before insert or update on public.vote_records
  for each row execute function public.clear_abstain_explanation();

-- ───────────── Triggers ─────────────
create or replace function public.set_current_session() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.session_id is null then
    select current_session_id into new.session_id from public.committee_state where committee_id = new.committee_id;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['events', 'votes', 'warnings', 'delegate_absences', 'participation_entries'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_session', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.set_current_session()', t || '_session', t);
  end loop;
end $$;

-- Keeps the per-session roll call in step with the live roll call.
-- A delegate who goes from absent to present while a session is open is flagged late.
create or replace function public.sync_session_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_session uuid;
begin
  select current_session_id into v_session from public.committee_state where committee_id = new.committee_id;
  if v_session is not null then
    insert into public.session_attendance (session_id, committee_id, delegate_id, attendance)
    values (v_session, new.committee_id, new.id, new.attendance)
    on conflict (session_id, delegate_id) do update set
      attendance = excluded.attendance,
      late = case
        when excluded.attendance = 'absent' then false
        when public.session_attendance.attendance = 'absent' then true
        else public.session_attendance.late
      end;
  end if;
  return new;
end $$;

drop trigger if exists delegates_attendance_sync on public.delegates;
create trigger delegates_attendance_sync after update of attendance on public.delegates
  for each row when (old.attendance is distinct from new.attendance)
  execute function public.sync_session_attendance();

-- ───────────── Session functions ─────────────
-- Opens the next numbered session (snapshots the roll call just taken) and puts the committee in session.
create or replace function public.open_session(p_committee uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num int;
begin
  if not public.can_run(p_committee) then raise exception 'Not allowed to run this committee'; end if;
  update public.sessions set closed_at = now() where committee_id = p_committee and closed_at is null;
  select coalesce(max(number), 0) + 1 into v_num from public.sessions where committee_id = p_committee;
  insert into public.sessions (committee_id, number) values (p_committee, v_num) returning id into v_id;
  insert into public.session_attendance (session_id, committee_id, delegate_id, attendance)
    select v_id, committee_id, id, attendance from public.delegates where committee_id = p_committee;
  update public.committee_state set
    current_session_id = v_id, status = 'in_session',
    session_started_at = coalesce(session_started_at, now()), updated_at = now()
  where committee_id = p_committee;
  return v_id;
end $$;

-- Ends the current session (suspend or adjourn). The next session starts with a fresh roll call.
create or replace function public.close_session(p_committee uuid, p_status text default 'suspended') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_run(p_committee) then raise exception 'Not allowed to run this committee'; end if;
  if p_status not in ('suspended', 'adjourned') then raise exception 'Invalid status'; end if;
  update public.sessions set closed_at = now() where committee_id = p_committee and closed_at is null;
  update public.delegate_absences set returned_at = now() where committee_id = p_committee and returned_at is null;
  update public.committee_state set status = p_status, current_session_id = null, updated_at = now() where committee_id = p_committee;
  update public.delegates set attendance = 'absent' where committee_id = p_committee;
end $$;

grant execute on function public.open_session(uuid) to authenticated;
grant execute on function public.close_session(uuid, text) to authenticated;

-- ───────────── Row level security ─────────────
alter table public.sessions enable row level security;
alter table public.session_attendance enable row level security;
alter table public.delegate_absences enable row level security;
alter table public.participation_entries enable row level security;
alter table public.participation_notes enable row level security;
alter table public.warnings enable row level security;
alter table public.awards enable row level security;
alter table public.rubric_levels enable row level security;

-- sessions: public read (the projection screen shows "Session N"); only chairs/HC write.
drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions for select using (true);
drop policy if exists sessions_write on public.sessions;
create policy sessions_write on public.sessions for all using (public.can_run(committee_id)) with check (public.can_run(committee_id));

-- Grades, warnings, notes, attendance history, awards: that committee's chairs + High Command ONLY.
-- (Unlike the floor tables, these are NOT readable with the public anon key.)
do $$
declare t text;
begin
  foreach t in array array['session_attendance', 'delegate_absences', 'participation_entries', 'participation_notes', 'warnings', 'awards'] loop
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format('create policy %I on public.%I for all using (public.can_run(committee_id)) with check (public.can_run(committee_id))', t || '_staff', t);
  end loop;
end $$;

drop policy if exists rubric_read on public.rubric_levels;
create policy rubric_read on public.rubric_levels for select using (public.is_staff());
drop policy if exists rubric_write on public.rubric_levels;
create policy rubric_write on public.rubric_levels for all using (public.is_high_command()) with check (public.is_high_command());

-- ───────────── Realtime ─────────────
alter table public.sessions replica identity full;
alter table public.session_attendance replica identity full;
alter table public.delegate_absences replica identity full;
alter table public.participation_entries replica identity full;
alter table public.participation_notes replica identity full;
alter table public.warnings replica identity full;
alter table public.awards replica identity full;

do $$
declare t text;
begin
  foreach t in array array['sessions', 'session_attendance', 'delegate_absences', 'participation_entries', 'participation_notes', 'warnings', 'awards'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ───────────── Archive + reset now include the new data ─────────────
create or replace function public.build_archive_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'taken_at', now(),
    'settings', (select to_jsonb(s) from public.settings s where id = 1),
    'committees', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.committees x),
    'committee_chairs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.committee_chairs x),
    'committee_state', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.committee_state x),
    'delegates', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.delegates x),
    'speakers_list', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.speakers_list x),
    'events', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.events x),
    'votes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.votes x),
    'vote_records', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.vote_records x),
    'announcements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.announcements x),
    'documents', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.documents x where archive_id is null),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.sessions x),
    'session_attendance', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.session_attendance x),
    'delegate_absences', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.delegate_absences x),
    'participation_entries', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.participation_entries x),
    'participation_notes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.participation_notes x),
    'warnings', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.warnings x),
    'awards', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.awards x),
    'rubric_levels', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.rubric_levels x)
  )
$$;

create or replace function public.build_archive_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'committees', (select count(*) from public.committees),
    'delegates', (select count(*) from public.delegates),
    'sessions', (select count(*) from public.sessions),
    'speeches', (select count(*) from public.speakers_list where status = 'spoke'),
    'motions_and_points', (select count(*) from public.events),
    'votes', (select count(*) from public.votes),
    'participation_entries', (select count(*) from public.participation_entries),
    'warnings', (select count(*) from public.warnings),
    'announcements', (select count(*) from public.announcements),
    'documents', (select count(*) from public.documents where archive_id is null)
  )
$$;

create or replace function public.admin_reset_system(p_label text, p_wipe_structure boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_high_command() then raise exception 'Only High Command can reset the system'; end if;
  v_id := public.admin_create_archive(p_label);

  update public.documents set archive_id = v_id where archive_id is null;
  delete from public.vote_records where true;
  delete from public.votes where true;
  delete from public.events where true;
  delete from public.speakers_list where true;
  delete from public.announcements where true;

  update public.committee_state set
    status = 'not_started', mode = 'formal', current_speaker_id = null, current_session_id = null,
    speaker_timer = '{"duration_ms":0,"remaining_ms":0,"running":false,"started_at":null}',
    caucus_timer = '{"duration_ms":0,"remaining_ms":0,"running":false,"started_at":null}',
    caucus_topic = null, caucus_speaking_sec = null, session_started_at = null, updated_at = now()
  where true;

  delete from public.participation_entries where true;
  delete from public.participation_notes where true;
  delete from public.warnings where true;
  delete from public.delegate_absences where true;
  delete from public.awards where true;
  delete from public.session_attendance where true;
  delete from public.sessions where true;

  update public.delegates set attendance = 'absent' where true;

  if p_wipe_structure then
    delete from public.delegates where true;
    delete from public.committee_chairs where true;
    delete from public.committees where true;
  end if;
  return v_id;
end $$;

-- ───────────── Analytics view: add sessions count ─────────────
drop view if exists public.committee_analytics;
create view public.committee_analytics with (security_invoker = true) as
select
  c.id as committee_id, c.name, c.abbreviation, c.topic,
  coalesce(s.status, 'not_started') as status, coalesce(s.mode, 'formal') as mode, s.session_started_at,
  (select count(*) from public.delegates d where d.committee_id = c.id) as delegates_total,
  (select count(*) from public.delegates d where d.committee_id = c.id and d.attendance <> 'absent') as delegates_present,
  (select count(*) from public.speakers_list l where l.committee_id = c.id and l.status = 'queued') as speakers_queued,
  (select count(*) from public.speakers_list l where l.committee_id = c.id and l.status = 'spoke') as speeches_given,
  (select count(*) from public.events e where e.committee_id = c.id and e.kind = 'motion') as motions_total,
  (select count(*) from public.events e where e.committee_id = c.id and e.kind = 'motion' and e.status = 'passed') as motions_passed,
  (select count(*) from public.events e where e.committee_id = c.id and e.kind = 'point') as points_total,
  (select count(*) from public.votes v where v.committee_id = c.id) as votes_total,
  (select count(*) from public.votes v where v.committee_id = c.id and v.status = 'open') as votes_open,
  (select count(*) from public.sessions x where x.committee_id = c.id) as sessions_total
from public.committees c
left join public.committee_state s on s.committee_id = c.id;
grant select on public.committee_analytics to authenticated;

-- ───────────── Default rubric (from the PASMUN grading log) ─────────────
insert into public.rubric_levels (category, level_key, label, description, score, sort) values
  ('sl_speech', '6', 'Clear, well structured, strong response to questions', 'The position paper and speech are coherent, clear, and effective in accurately describing the country’s position and its relevance to proposed solutions. Solutions are well-aligned with national policy. The delegate delivers strong, well-structured responses to questions and demonstrates full command of the topic.', 6, 1),
  ('sl_speech', '5', 'Clear reading, lacks depth, strong response', 'The position paper and speech are coherent and effective, but either: (a) the proposed solutions are not fully relevant or representative of the country’s position, or (b) the solutions are fully relevant, but the speech lacks clarity or effectiveness. The delegate provides effective responses to questions.', 5, 2),
  ('sl_speech', '4', 'Clear reading, so-so solution (non concrete), some question responses', 'The position paper and speech lack clarity, but the proposed solutions are somewhat related and relevant to the topic. The delegate answers most questions, though responses may be incomplete or lack depth.', 4, 3),
  ('sl_speech', '3s', 'Not clear, incomplete, unable to answer / avoided answering', 'The position paper and speech are unclear, and proposed solutions are not relevant, poorly developed, or not presented. The delegate does not respond to questions or avoids answering.', 3, 4),
  ('sl_question', '3q', 'Well structured question (+ follow-up)', 'Well-structured questions, including relevant follow-up questions.', 3, 1),
  ('sl_question', '2', 'Coherent question', 'Coherent question that contributes to the discussion.', 2, 2),
  ('sl_question', '1', 'Poor structure, unrelated to topic', 'Poor structure; intervention is unrelated to the topic.', 1, 3),
  ('mc', '3', 'Strong idea / adds context / complete question', 'Strongly relevant contribution that introduces new information, data, or analysis that advances the debate by helping draft new solutions or significantly refine existing ones.', 3, 1),
  ('mc', '2', 'Relevant question / strong idea but lacked context or info', 'Relevant contribution that helps refine already existing solutions, but lacks depth, detailed analysis, or does not introduce truly new information.', 2, 2),
  ('mc', '1', 'Irrelevant / unimpactful', 'Irrelevant, repetitive, or unimpactful intervention that adds little or no value to the debate.', 1, 3),
  ('umc', '3', 'Leads discussion / active participation', 'Actively leads or substantively advances discussion by introducing new information, data, or concrete proposals that help create or meaningfully improve solutions.', 3, 1),
  ('umc', '2', 'Active participation', 'Actively participates and contributes to refining or organizing existing ideas or proposals, but does not introduce new or substantive information or lacks analytical depth.', 2, 2),
  ('umc', '1', 'Not participating / low input', 'Little to no participation or involvement that does not contribute meaningfully to the discussion or drafting process.', 1, 3),
  ('wp', '16', 'Leads discussion / active work / presents paper / strong question response', 'Leads discussion and active work; presents paper and delivers strong responses to questions.', 16, 1),
  ('wp', '15', 'Leads / active work / presents / answers most questions', 'Leads or actively works on papers; presents and answers most questions effectively.', 15, 2),
  ('wp', '7', 'Leads / writes / organizes proposals', 'Leads, writes, and organizes proposals.', 7, 3),
  ('wp', '6', 'Active work / adds valuable points & ideas', 'Active work; adds valuable points and ideas.', 6, 4),
  ('wp', '5', 'Active help / constant participation', 'Active help and constant participation.', 5, 5),
  ('wp', '4', 'Limited participation in drafting or collaboration', 'Limited participation in drafting or collaboration.', 4, 6),
  ('wp', '3', 'Very little participation', 'Very little participation.', 3, 7),
  ('wp', '2', 'Minimal involvement in the working process', 'Minimal involvement in the working process.', 2, 8),
  ('wp', '1', 'No meaningful participation', 'No meaningful participation.', 1, 9),
  ('rp', '16', 'Leads discussion / active work / presents paper / strong question response', 'Leads discussion and active work; presents paper and delivers strong responses to questions.', 16, 1),
  ('rp', '15', 'Leads / active work / presents / answers most questions', 'Leads or actively works on papers; presents and answers most questions effectively.', 15, 2),
  ('rp', '7', 'Leads / writes / organizes proposals', 'Leads, writes, and organizes proposals.', 7, 3),
  ('rp', '6', 'Active work / adds valuable points & ideas', 'Active work; adds valuable points and ideas.', 6, 4),
  ('rp', '5', 'Active help / constant participation', 'Active help and constant participation.', 5, 5),
  ('rp', '4', 'Limited participation in drafting or collaboration', 'Limited participation in drafting or collaboration.', 4, 6),
  ('rp', '3', 'Very little participation', 'Very little participation.', 3, 7),
  ('rp', '2', 'Minimal involvement in the working process', 'Minimal involvement in the working process.', 2, 8),
  ('rp', '1', 'No meaningful participation', 'No meaningful participation.', 1, 9)
on conflict (category, level_key) do nothing;
