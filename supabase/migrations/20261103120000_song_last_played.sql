-- When the band last played a song before recording gigs in the app, set by hand (`YYYY-MM-DD`,
-- like gigs' dates). The app takes the later of this and the gigs marked as played, to tell songs
-- never played from ones played before the app.
--
-- Null by default, so installed apps that don't know the field keep syncing: their songs have no
-- date, and their changes never send one.
alter table public.songs
  add column last_played_on text check (last_played_on ~ '^\d{4}-\d{2}-\d{2}$');
