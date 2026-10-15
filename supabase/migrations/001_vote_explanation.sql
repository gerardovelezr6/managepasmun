-- Run once in Supabase -> SQL Editor if you already installed schema.sql before this update.
-- Adds "right of explanation" tracking for substantive votes.
alter table public.vote_records
  add column if not exists explanation text check (explanation in ('requested', 'given'));
