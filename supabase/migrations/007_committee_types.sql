-- 007: committee categories and types (US Senate, Senado de México, ICC, crisis...), delegate groups
-- (parties / sides) and a confidential crisis topic. Additive and safe to re-run.

-- Category (General Assembly, Security Council, ECOSOC, Specialized...) and type of each committee.
-- Both are plain text keys that point into settings.committee_catalog, which High Command edits.
alter table public.committees add column if not exists category text;
alter table public.committees add column if not exists type text not null default 'standard';

-- Party / side of a delegate, a key from the committee type's groups.
alter table public.delegates add column if not exists group_key text;

-- The editable catalog of categories and types (colours, parties, sides, logos, field names...).
alter table public.settings add column if not exists committee_catalog jsonb;
update public.settings set committee_catalog = '{"categories":[{"key":"general_assembly","name":"General Assembly","name_es":"Asamblea General","color":"#2563eb"},{"key":"security_council","name":"Security Council","name_es":"Consejo de Seguridad","color":"#dc2626"},{"key":"ecosoc","name":"Economic and Social Council","name_es":"Consejo Económico y Social","color":"#059669"},{"key":"specialized","name":"Specialized Committees","name_es":"Comités Especializados","color":"#7c3aed"}],"types":[{"key":"standard","name":"Standard","name_es":"Estándar","default_category":null,"label_field":"Country","label_field_es":"País","flag":"country","groups":[],"bulk":["country","name"]},{"key":"specialized","name":"Specialized","name_es":"Especializado","default_category":"specialized","label_field":"Country","label_field_es":"País","flag":"country","groups":[],"bulk":["country","name"]},{"key":"us_senate","name":"US Senate","name_es":"Senado de EE. UU.","default_category":"specialized","label_field":"State","label_field_es":"Estado","flag":"us_state","group_label":"Party","group_label_es":"Partido","group_required":true,"bulk":["country","name","group"],"groups":[{"key":"democrat","name":"Democrat","name_es":"Demócrata","short":"D","color":"#1d4ed8"},{"key":"republican","name":"Republican","name_es":"Republicano","short":"R","color":"#dc2626"}]},{"key":"mx_senate","name":"Senado de México","name_es":"Senado de México","default_category":"specialized","label_field":"State","label_field_es":"Entidad","flag":"none","group_label":"Party","group_label_es":"Partido","group_required":true,"bulk":["country","name","group"],"groups":[{"key":"morena","name":"MORENA","short":"MORENA","color":"#8c1d2f"},{"key":"pvem","name":"PVEM","short":"PVEM","color":"#16a34a"},{"key":"pan","name":"PAN","short":"PAN","color":"#1d4ed8"},{"key":"pt","name":"PT","short":"PT","color":"#e11d48"},{"key":"mc","name":"MC","short":"MC","color":"#ea580c"},{"key":"pri","name":"PRI","short":"PRI","color":"#15803d"}]},{"key":"icc","name":"ICC","name_es":"CPI","default_category":"specialized","label_field":"Country","label_field_es":"País","flag":"country_in_text","group_label":"Side","group_label_es":"Parte","group_required":true,"bulk":["group","name","country"],"groups":[{"key":"prosecution","name":"Prosecution","name_es":"Fiscalía","short":"PRO","color":"#b45309"},{"key":"defense","name":"Defense","name_es":"Defensa","short":"DEF","color":"#0f766e"},{"key":"judges","name":"Judges","name_es":"Jueces","short":"JDG","color":"#4338ca"}]},{"key":"crisis","name":"Crisis committee","name_es":"Comité de crisis","default_category":"specialized","label_field":"Country","label_field_es":"País","flag":"country","secret_topic":true,"groups":[],"bulk":["country","name"]}]}'::jsonb where id = 1 and committee_catalog is null;

-- When half of all committees have been in session the conference counts as started. Latched so that
-- suspending committees later does not hide a revealed topic again. High Command can clear it.
alter table public.settings add column if not exists conference_started_at timestamptz;

create or replace function public.latch_conference_start() returns trigger
language plpgsql security definer set search_path = public as $$
declare live int; total int;
begin
  select count(*) filter (where status = 'in_session'), count(*) into live, total from public.committee_state;
  if total > 0 and live * 2 >= total then
    update public.settings set conference_started_at = now() where id = 1 and conference_started_at is null;
  end if;
  return null;
end $$;

drop trigger if exists latch_conference_start on public.committee_state;
create trigger latch_conference_start after insert or update of status on public.committee_state
  for each row execute function public.latch_conference_start();

create or replace function public.conference_started() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select conference_started_at is not null from public.settings where id = 1), false)
$$;
grant execute on function public.conference_started() to authenticated;

-- Confidential topics (crisis committees). Not readable with the public anon key: High Command and
-- advisors always, assigned chairs only once the conference has started.
create table if not exists public.committee_secrets (
  committee_id uuid primary key references public.committees(id) on delete cascade,
  topic text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.committee_secrets enable row level security;
drop policy if exists committee_secrets_read on public.committee_secrets;
create policy committee_secrets_read on public.committee_secrets for select to authenticated
  using (public.is_high_command() or (public.is_chair_of(committee_id) and public.conference_started()));
drop policy if exists committee_secrets_write on public.committee_secrets;
create policy committee_secrets_write on public.committee_secrets for all to authenticated
  using (public.is_high_command()) with check (public.is_high_command());

-- The live-analytics view also carries category and type, so High Command can group committees.
drop view if exists public.committee_analytics;
create view public.committee_analytics with (security_invoker = true) as
select
  c.id as committee_id, c.name, c.abbreviation, c.topic, c.category, c.type,
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
