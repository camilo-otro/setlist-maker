import {
  DEFAULT_CLONE_OPTIONS,
  localDateString,
  sortByPosition,
  type CloneOptions,
  type Gig,
  type Setlist,
  type Song,
} from '@setlist/core';
import { copySetlistInto } from '@setlist/storage';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { useBandRows } from '../storage/useBandRows';
import { useWorkspace } from '../storage/WorkspaceProvider';

/** A setlist to start from, with what to call it in the list. */
interface Source {
  setlist: Setlist;
  group: 'past' | 'upcoming' | 'template';
  title: string;
  /** Date and venue, or "Template". */
  detail: string;
  date: string;
}

const GROUP_LABELS: Record<Source['group'], string> = {
  past: 'Past gigs',
  upcoming: 'Upcoming gigs',
  template: 'Templates',
};

const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const formatDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return longDate.format(new Date(y!, m! - 1, d!));
};

/**
 * "Start from…" (#24): fills this gig's setlist with a copy of another gig's (past or upcoming)
 * or a template, picked from a searchable list with a preview. Says so before replacing songs
 * the setlist already has.
 */
export function StartFromDialog({
  gig,
  setlistId,
  songCount,
  songsById,
  onClose,
  onDone,
}: {
  gig: Gig;
  setlistId: string;
  /** Songs the setlist has now, which the copy replaces. */
  songCount: number;
  songsById: ReadonlyMap<string, Song>;
  onClose: () => void;
  /** After copying, with the source's name and the songs left out. */
  onDone: (from: string, dropped: string[]) => void;
}) {
  const { repository, band } = useWorkspace();
  const gigs = useBandRows('gigs');
  const venues = useBandRows('venues');
  const [setlists, setSetlists] = useState<Setlist[] | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Source | null>(null);
  const [preview, setPreview] = useState<{
    setlistId: string;
    sets: { name: string; songs: string[] }[];
  } | null>(null);
  const [options, setOptions] = useState<CloneOptions>(DEFAULT_CLONE_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void repository.setlists.list({ bandId: band.id }).then((rows) => current && setSetlists(rows));
    return () => {
      current = false;
    };
  }, [repository, band.id]);

  const sources = useMemo(() => {
    if (!setlists || !gigs.rows || !venues.rows) return null;
    const gigById = new Map(gigs.rows.map((g) => [g.id, g]));
    const venueName = new Map(venues.rows.map((v) => [v.id, v.name]));
    const today = localDateString();
    const list: Source[] = [];
    for (const setlist of setlists) {
      if (setlist.id === setlistId) continue;
      if (setlist.isTemplate) {
        list.push({
          setlist,
          group: 'template',
          title: setlist.name,
          detail: 'Template',
          date: '',
        });
        continue;
      }
      const other = setlist.gigId ? gigById.get(setlist.gigId) : undefined;
      if (!other || other.status === 'cancelled') continue;
      const past = other.status === 'played' || other.date < today;
      const venue = other.venueId ? venueName.get(other.venueId) : null;
      list.push({
        setlist,
        group: past ? 'past' : 'upcoming',
        title: other.title,
        detail: [formatDate(other.date), venue].filter(Boolean).join(' · '),
        date: other.date,
      });
    }
    // Most recent past gigs first, soonest upcoming first, templates by name.
    const order = { past: 0, upcoming: 1, template: 2 } as const;
    return list.sort(
      (a, b) =>
        order[a.group] - order[b.group] ||
        (a.group === 'past' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) ||
        a.title.localeCompare(b.title),
    );
  }, [setlists, gigs.rows, venues.rows, setlistId]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (sources ?? []).filter((source) => {
      const text = `${source.title} ${source.detail}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [sources, query]);

  // The picked setlist's sets and songs, to check before copying.
  useEffect(() => {
    if (!picked) return;
    let current = true;
    void (async () => {
      const blocks = sortByPosition(
        await repository.setBlocks.list({ setlistId: picked.setlist.id }),
      );
      const sets = await Promise.all(
        blocks.map(async (block) => ({
          name: block.name,
          songs: sortByPosition(await repository.setEntries.list({ setBlockId: block.id }))
            .filter((entry) => entry.kind === 'song' && entry.songId)
            .map((entry) => songsById.get(entry.songId!)?.title ?? 'Deleted song'),
        })),
      );
      if (current) setPreview({ setlistId: picked.setlist.id, sets });
    })();
    return () => {
      current = false;
    };
  }, [picked, repository, songsById]);

  // Only the picked setlist's preview; another's is still loading.
  const sets = preview && preview.setlistId === picked?.setlist.id ? preview.sets : null;

  async function copy() {
    if (!picked) return;
    setBusy(true);
    setFailure(null);
    try {
      const { dropped } = await copySetlistInto(repository, {
        sourceSetlistId: picked.setlist.id,
        targetSetlistId: setlistId,
        options,
      });
      onDone(picked.title, dropped);
      onClose();
    } catch (error) {
      setFailure(String(error));
    } finally {
      setBusy(false);
    }
  }

  const option = (key: keyof CloneOptions, label: string) => (
    <label className="start-from__option">
      <input
        type="checkbox"
        checked={options[key]}
        onChange={(e) => setOptions((current) => ({ ...current, [key]: e.target.checked }))}
      />
      {label}
    </label>
  );

  return (
    <Modal title={`Start ${gig.title} from…`} busy={busy} onClose={onClose} wide>
      <div className="start-from">
        <div className="start-from__pick">
          <label className="search-box">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              className="sm-input"
              autoFocus
              placeholder="Search gigs and templates"
              aria-label="Search gigs and templates"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {sources === null ? (
            <p className="muted">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="muted">
              {sources.length === 0 ? 'No other gigs or templates yet.' : 'No matches.'}
            </p>
          ) : (
            <ul className="start-from__list" aria-label="Setlists to start from">
              {shown.map((source, index) => (
                <li key={source.setlist.id}>
                  {(index === 0 || shown[index - 1]!.group !== source.group) && (
                    <h3 className="start-from__group">{GROUP_LABELS[source.group]}</h3>
                  )}
                  <button
                    type="button"
                    className="start-from__source"
                    aria-pressed={picked?.setlist.id === source.setlist.id}
                    onClick={() => setPicked(source)}
                  >
                    <span className="start-from__title">{source.title}</span>
                    <span className="muted">{source.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="start-from__preview" aria-live="polite">
          {!picked ? (
            <p className="muted">Pick a gig or template to see its setlist.</p>
          ) : sets === null ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <h3 className="start-from__preview-title">{picked.title}</h3>
              {sets.map((set) => (
                <section key={set.name} className="start-from__set" aria-label={set.name}>
                  <h4>{set.name}</h4>
                  {set.songs.length === 0 ? (
                    <p className="muted">No songs</p>
                  ) : (
                    <ol>
                      {set.songs.map((title, i) => (
                        <li key={`${title}-${i}`}>{title}</li>
                      ))}
                    </ol>
                  )}
                </section>
              ))}
              <div className="start-from__options" role="group" aria-label="Copy options">
                {option('dropRetired', 'Leave out archived songs')}
                {option('resetKeys', "Use each song's own key")}
                {option('keepNotes', 'Keep notes')}
              </div>
            </>
          )}
        </div>
      </div>

      {picked && songCount > 0 && (
        <p className="start-from__warning" role="alert">
          This replaces the {songCount} {songCount === 1 ? 'song' : 'songs'} already in this
          gig&apos;s setlist.
        </p>
      )}
      {failure && (
        <p className="sm-field__error" role="alert">
          Couldn&apos;t copy the setlist: {failure}
        </p>
      )}
      <div className="modal__actions">
        <button type="button" className="sm-button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="sm-button sm-button--primary"
          disabled={busy || !picked || sets === null}
          onClick={() => void copy()}
        >
          {songCount > 0 ? 'Replace setlist' : 'Use this setlist'}
        </button>
      </div>
    </Modal>
  );
}
