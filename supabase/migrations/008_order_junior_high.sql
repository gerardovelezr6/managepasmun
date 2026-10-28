-- 008: Junior High category, ECOSOC first, new delegate columns for the US and Mexican Senate, committee order.
-- Additive and safe to re-run. Patches the stored catalog only where it still has the original 007 defaults.

-- Manual order of committees (drag and drop in High Command → Committees).
alter table public.committees add column if not exists sort_order int not null default 0;
update public.committees c set sort_order = r.rn
  from (select id, row_number() over (order by name) as rn from public.committees) r
  where c.id = r.id and (select coalesce(max(sort_order), 0) from public.committees) = 0;

do $$
declare c jsonb; added boolean := false;
begin
  select committee_catalog into c from public.settings where id = 1;
  if c is null then return; end if;

  -- Junior High category; on this first run also put ECOSOC at the top (drag to reorder afterwards).
  if not exists (select 1 from jsonb_array_elements(c->'categories') e where e->>'key' = 'junior_high') then
    c := jsonb_set(c, '{categories}', (c->'categories') || '[{"key":"junior_high","name":"Junior High","name_es":"Secundaria","color":"#d97706"}]'::jsonb);
    c := jsonb_set(c, '{categories}', (
      select jsonb_agg(e order by case e->>'key' when 'ecosoc' then 0 when 'general_assembly' then 1 when 'security_council' then 2 when 'junior_high' then 3 when 'specialized' then 4 else 5 end)
      from jsonb_array_elements(c->'categories') e));
  end if;

  -- US Senate: "Senator (State), Party, Delegate name". Senado de México: "Entidad, Partido, Nombre del delegado".
  c := jsonb_set(c, '{types}', (
    select jsonb_agg(case
      when e->>'key' = 'us_senate' and e->'bulk' = '["country","name","group"]'::jsonb then '{"key":"us_senate","name":"US Senate","name_es":"Senado de EE. UU.","default_category":"specialized","label_field":"Senator (State)","label_field_es":"Senador (Estado)","flag":"us_state","group_label":"Party","group_label_es":"Partido","group_required":true,"bulk":["country","group","name"],"groups":[{"key":"democrat","name":"Democratic Party","name_es":"Partido Demócrata","short":"D","color":"#1d4ed8","aliases":["democrat","democratic","dem"]},{"key":"republican","name":"Republican Party","name_es":"Partido Republicano","short":"R","color":"#dc2626","aliases":["republican","rep","gop"]}]}'::jsonb
      when e->>'key' = 'mx_senate' and e->'bulk' = '["country","name","group"]'::jsonb then '{"key":"mx_senate","name":"Senado de México","name_es":"Senado de México","default_category":"specialized","label_field":"Entidad","label_field_es":"Entidad","flag":"none","group_label":"Partido","group_label_es":"Partido","group_required":true,"bulk":["country","group","name"],"groups":[{"key":"morena","name":"MORENA","short":"MORENA","color":"#8c1d2f"},{"key":"pvem","name":"PVEM","short":"PVEM","color":"#16a34a"},{"key":"pan","name":"PAN","short":"PAN","color":"#1d4ed8"},{"key":"pt","name":"PT","short":"PT","color":"#e11d48"},{"key":"mc","name":"MC","short":"MC","color":"#ea580c"},{"key":"pri","name":"PRI","short":"PRI","color":"#15803d"}]}'::jsonb
      else e end)
    from jsonb_array_elements(c->'types') e));

  update public.settings set committee_catalog = c where id = 1;
end $$;

-- The live-analytics view also carries the manual order.
drop view if exists public.committee_analytics;
create view public.committee_analytics with (security_invoker = true) as
select
  c.id as committee_id, c.name, c.abbreviation, c.topic, c.category, c.type, c.sort_order,
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
