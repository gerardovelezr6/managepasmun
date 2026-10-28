-- 009: the Senado de México shows each party's logo where other committees show a flag.
-- Upload the logos under High Command → Types & categories. Safe to re-run.
update public.settings set committee_catalog = jsonb_set(committee_catalog, '{types}', (
  select jsonb_agg(case when e->>'key' = 'mx_senate' and e->>'flag' = 'none' then jsonb_set(e, '{flag}', '"group_logo"') else e end)
  from jsonb_array_elements(committee_catalog->'types') e))
where id = 1 and committee_catalog is not null;
