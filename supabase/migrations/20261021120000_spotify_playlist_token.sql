-- The refresh token of the app's own Spotify account, which holds every band's playlists. See the
-- playlist amendment in docs/adr/0003-spotify.md.
--
-- It lives in Supabase Vault, encrypted, and only the server reaches it: the app owner's sign-in
-- script stores it (pnpm spotify:connect), and the playlist Edge Function reads it and saves the
-- new one when Spotify replaces it. Clients can't call any of these functions.

create extension if not exists supabase_vault with schema vault;

/** The stored refresh token, or null when the account hasn't been signed in. */
create function public.spotify_playlist_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'spotify_playlist_refresh_token'
$$;

/** Stores the refresh token, replacing the one before. */
create function public.set_spotify_playlist_token(token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  if token is null or length(token) = 0 then
    raise exception 'A refresh token is required' using errcode = '22023';
  end if;
  select id into existing from vault.secrets where name = 'spotify_playlist_refresh_token';
  if existing is null then
    perform vault.create_secret(
      token,
      'spotify_playlist_refresh_token',
      'Refresh token of the app''s Spotify playlist account (ADR 0003)'
    );
  else
    perform vault.update_secret(existing, token);
  end if;
end;
$$;

/** Forgets the refresh token, e.g. once Spotify stops accepting it. */
create function public.clear_spotify_playlist_token()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = 'spotify_playlist_refresh_token'
$$;

revoke execute on function public.spotify_playlist_token() from public, anon, authenticated;
revoke execute on function public.set_spotify_playlist_token(text) from public, anon, authenticated;
revoke execute on function public.clear_spotify_playlist_token() from public, anon, authenticated;
grant execute on function public.spotify_playlist_token() to service_role;
grant execute on function public.set_spotify_playlist_token(text) to service_role;
grant execute on function public.clear_spotify_playlist_token() to service_role;
