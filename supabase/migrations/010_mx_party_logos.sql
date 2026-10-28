-- 010: the Mexican party logos shipped with the app (public/logos/mx). Fills the logo of each
-- Senado de México party only where none has been uploaded yet. Safe to re-run.
update public.settings set committee_catalog = jsonb_set(committee_catalog, '{types}', (
  select jsonb_agg(case when t->>'key' = 'mx_senate' then jsonb_set(t, '{groups}', (
    select jsonb_agg(case when coalesce(g->>'logo', '') = '' and g->>'key' in ('morena','pvem','pan','pt','mc','pri')
      then jsonb_set(g, '{logo}', to_jsonb('/logos/mx/' || (g->>'key') || '.png')) else g end)
    from jsonb_array_elements(t->'groups') g)) else t end)
  from jsonb_array_elements(committee_catalog->'types') t))
where id = 1 and committee_catalog is not null;
