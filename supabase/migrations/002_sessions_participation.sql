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
