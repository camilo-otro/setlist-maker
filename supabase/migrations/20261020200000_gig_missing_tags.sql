-- What a gig is missing (#88): tags the band can't cover at that gig, such as 'piano' when the
-- keyboardist can't come. Songs with one of them are flagged in the gig's setlist.
--
-- The default keeps installed apps that don't know the field working: their new gigs get an
-- empty list, and their changes never send it.
alter table public.gigs
  add column missing_tags text[] not null default '{}'
    check (cardinality(missing_tags) <= 30);
