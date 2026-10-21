-- Placeholder conference name becomes plain "PASMUN". Safe to re-run.
-- Only replaces the untouched default; a name you set in the Branding tab is left alone.
alter table public.settings alter column conference_name set default 'PASMUN';
update public.settings set conference_name = 'PASMUN' where conference_name = 'PASMUN 2026 (Placeholder Name)';
