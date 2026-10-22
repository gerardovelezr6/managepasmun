-- 005: "advisor" role. Advisors can do everything High Command can, and only advisors can run
-- the full administrative reset or create/modify/delete other advisors. Safe to re-run.

-- Allow the new role value.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('advisor', 'high_command', 'chair', 'pending'));

create or replace function public.is_advisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'advisor')
$$;

-- Everything that already checks "High Command" now also accepts advisors.
create or replace function public.is_high_command() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('high_command', 'advisor'))
$$;

create or replace function public.is_chair_of(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.committee_chairs cc
    join public.profiles p on p.id = cc.user_id
    where cc.committee_id = cid and cc.user_id = auth.uid() and p.role in ('chair', 'high_command', 'advisor')
  )
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('chair', 'high_command', 'advisor'))
$$;

-- High Command may edit profiles, but must never be able to create, change, demote or delete an advisor
-- (that would be a way to promote themselves). The server API (service role, no auth.uid()) and the
-- SQL Editor are not affected; the API enforces the same rule itself.
create or replace function public.guard_advisor_profiles() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or public.is_advisor() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' and new.role = 'advisor' then
    raise exception 'Only an advisor can create an advisor';
  elsif tg_op = 'UPDATE' and (old.role = 'advisor' or new.role = 'advisor') then
    raise exception 'Only an advisor can change an advisor account';
  elsif tg_op = 'DELETE' and old.role = 'advisor' then
    raise exception 'Only an advisor can remove an advisor account';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists profiles_guard_advisor on public.profiles;
create trigger profiles_guard_advisor before insert or update or delete on public.profiles
  for each row execute function public.guard_advisor_profiles();

-- Full administrative reset (archive + wipe): advisors only. Archive-only stays available to High Command.
create or replace function public.admin_reset_system(p_label text, p_wipe_structure boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_advisor() then raise exception 'Only an advisor can reset the system'; end if;
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
