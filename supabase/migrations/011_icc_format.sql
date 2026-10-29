-- 011: ICC bulk-add order is now Side, Representative (Country), Delegate name. Safe to re-run.
update public.settings set committee_catalog = jsonb_set(committee_catalog, '{types}', (
  select jsonb_agg(case when e->>'key' = 'icc' then jsonb_set(jsonb_set(e, '{bulk}', '["group","country","name"]'), '{label_field}', '"Representative (Country)"') else e end)
  from jsonb_array_elements(committee_catalog->'types') e))
where id = 1 and committee_catalog is not null;
