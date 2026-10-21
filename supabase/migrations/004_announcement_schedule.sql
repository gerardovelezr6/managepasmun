-- Scheduled announcements: starts_at is when an announcement goes live (null = immediately). Safe to re-run.
alter table public.announcements add column if not exists starts_at timestamptz;
