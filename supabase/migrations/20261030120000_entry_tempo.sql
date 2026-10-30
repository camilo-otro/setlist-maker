-- A setlist song's tempo for the gig, when it isn't the song's usual one (BPM), next to its key.
--
-- Null by default, so installed apps that don't know the field keep syncing: their entries have
-- no gig tempo, and their changes never send one.
alter table public.set_entries
  add column tempo_override integer check (tempo_override between 20 and 400),
  add constraint set_entries_tempo_only_for_songs check (kind = 'song' or tempo_override is null);
