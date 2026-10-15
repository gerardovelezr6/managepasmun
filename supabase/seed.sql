-- OPTIONAL placeholder data so the app is not empty on day one.
-- Everything here is fake: rename committees/topics/delegates in the Admin panel (or edit this file).
do $$
declare
  cid uuid;
  i int;
  c int;
  names text[] := array['Placeholder Committee A', 'Placeholder Committee B', 'Placeholder Committee C'];
  abbrs text[] := array['COM-A', 'COM-B', 'COM-C'];
  topics text[] := array['[Placeholder Topic A: edit me]', '[Placeholder Topic B: edit me]', '[Placeholder Topic C: edit me]'];
  countries text[] := array['Argentina', 'Brazil', 'Canada', 'Egypt', 'France', 'Germany', 'India', 'Japan', 'Kenya', 'Mexico', 'Nigeria', 'Spain'];
begin
  if exists (select 1 from public.committees) then
    raise notice 'Committees already exist, skipping seed.';
    return;
  end if;

  update public.settings set
    conference_name = 'PASMUN 2026 (Placeholder Name)',
    short_name = 'PASMUN',
    tagline = 'Placeholder tagline - edit me in Admin > Branding',
    conference_dates = '[Placeholder dates]',
    venue = '[Placeholder venue]'
  where id = 1;

  for c in 1..3 loop
    insert into public.committees (name, abbreviation, topic, description)
    values (names[c], abbrs[c], topics[c], 'Placeholder description for ' || names[c])
    returning id into cid;

    for i in 1..12 loop
      insert into public.delegates (committee_id, name, country)
      values (cid, 'Delegate Name ' || i, countries[i]);
    end loop;
  end loop;

  insert into public.announcements (message, severity)
  values ('Welcome to the conference! (placeholder announcement - edit or delete in Admin)', 'info');
end $$;
