-- 012: projection-screen timer toggle and optional speaking time during unmoderated caucus. Safe to re-run.
alter table public.committee_state add column if not exists show_timer boolean not null default true;
alter table public.committee_state add column if not exists unmod_speaking boolean not null default false;
