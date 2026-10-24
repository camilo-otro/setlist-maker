-- Only owners add songs to the repertorio directly (#89). Editors suggest songs instead, and the
-- band votes; an editor may still add the song of a suggestion they accept, which the app sends
-- after marking the suggestion as accepted with the song's ID. Editors still change songs.

drop policy "Owners and editors can add" on public.songs;

create policy "Owners add songs, editors their accepted suggestions" on public.songs
  for insert to authenticated
  with check (
    public.band_role(band_id) = 'owner'
    or (public.band_role(band_id) = 'editor'
        and exists (
          select 1 from public.suggestions s
          where s.band_id = songs.band_id
            and s.song_id = songs.id
            and s.status = 'accepted'
            and s.deleted_at is null))
  );
