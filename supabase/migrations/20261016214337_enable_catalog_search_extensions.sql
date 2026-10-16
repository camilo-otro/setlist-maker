-- Extensions for searching the shared song catalog (#55): trigram matching tolerates typos and
-- partial words, and unaccent lets "cancion" find "canción". Supabase keeps extensions in their
-- own schema.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
