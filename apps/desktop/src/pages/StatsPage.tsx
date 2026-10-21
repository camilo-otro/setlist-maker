import {
  gigsPerMonth,
  gigsSinceLastPlayed,
  localDateString,
  originalsAndCovers,
  playedGigs,
  songStatistics,
  sortByHistory,
  type Song,
  type SongStats,
} from '@setlist/core';
import { EmptyState, PageHeader } from '@setlist/ui';
import { ChartColumn } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useBandRows } from '../storage/useBandRows';

/** How many songs the most and least played lists show. */
const TOP = 10;
/** The choices for "not played in the last N gigs". */
const GIG_COUNTS = [3, 5, 10, 20];

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'short' });
const monthYearFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
/** A `YYYY-MM-DD` date (or `YYYY-MM`) as a local date, so it isn't shifted by the time zone. */
const localDate = (date: string) => {
  const [y, m, d = 1] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d);
};
const times = (n: number) => (n === 1 ? 'once' : `${n} times`);
const percent = (part: number, whole: number) =>
  whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;

function Card({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={wide ? 'stats-card stats-card--wide' : 'stats-card'} aria-label={title}>
      <h2 className="stats-card__title">{title}</h2>
      {children}
    </section>
  );
}

function SongList({ songs, detail }: { songs: Song[]; detail: (song: Song) => string }) {
  return (
    <ol className="stats-list">
      {songs.map((song, i) => (
        <li key={song.id}>
          <span className="stats-list__rank" aria-hidden="true">
            {i + 1}
          </span>
          <span className="stats-list__title">
            {song.title}
            {song.artist && <span className="muted"> · {song.artist}</span>}
          </span>
          <span className="stats-list__value">{detail(song)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Played gigs per month as a bar chart, with every value also readable as text. */
function GigsPerMonth({ months }: { months: { month: string; gigs: number }[] }) {
  const max = Math.max(1, ...months.map((m) => m.gigs));
  return (
    <ol className="month-chart">
      {months.map(({ month, gigs }) => {
        const label = `${monthYearFormat.format(localDate(month))}: ${gigs} ${gigs === 1 ? 'gig' : 'gigs'}`;
        return (
          <li key={month} className="month-chart__month" title={label}>
            <span className="visually-hidden">{label}</span>
            <span className="month-chart__track" aria-hidden="true">
              <span className="month-chart__value">{gigs > 0 ? gigs : ''}</span>
              <span
                className="month-chart__bar"
                style={{ height: gigs > 0 ? `${(gigs / max) * 100}%` : 0 }}
              />
            </span>
            <span className="month-chart__label" aria-hidden="true">
              {monthFormat.format(localDate(month))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** What the band's history says (#31): most and least played, songs left out, gigs per month. */
export function StatsPage() {
  const songs = useBandRows('songs');
  const gigs = useBandRows('gigs');
  const performances = useBandRows('performances');
  const [gigCount, setGigCount] = useState(5);
  const today = localDateString();

  const stats = useMemo(
    () =>
      performances.rows && gigs.rows
        ? songStatistics(performances.rows, gigs.rows)
        : new Map<string, SongStats>(),
    [performances.rows, gigs.rows],
  );
  const played = useMemo(() => playedGigs(gigs.rows ?? []), [gigs.rows]);
  // Alphabetical first, so ties in the lists below read in order.
  const allSongs = useMemo(
    () => [...(songs.rows ?? [])].sort((a, b) => a.title.localeCompare(b.title)),
    [songs.rows],
  );
  // Archived and still-being-learned songs aren't expected in a set, so they're left out of
  // "least played" and "not played in a while".
  const activeSongs = useMemo(() => allSongs.filter((s) => s.status === 'active'), [allSongs]);
  const since = useMemo(
    () =>
      gigsSinceLastPlayed(
        activeSongs.map((s) => s.id),
        stats,
        gigs.rows ?? [],
      ),
    [activeSongs, stats, gigs.rows],
  );

  const error = songs.error ?? gigs.error ?? performances.error;
  if (error) {
    return (
      <>
        <PageHeader title="Stats" />
        <p className="sm-field__error" role="alert">
          Couldn&apos;t load stats: {String(error)}
        </p>
      </>
    );
  }
  if (!songs.rows || !gigs.rows || !performances.rows) {
    return (
      <>
        <PageHeader title="Stats" />
        <p className="muted">Loading stats…</p>
      </>
    );
  }
  if (played.length === 0) {
    return (
      <>
        <PageHeader title="Stats" />
        <EmptyState icon={<ChartColumn size={24} />} title="Nothing to show yet">
          Stats appear once you&apos;ve marked gigs as played: most and least played songs, and what
          you haven&apos;t played in a while.
        </EmptyState>
      </>
    );
  }

  const timesPlayed = (song: Song) => stats.get(song.id)?.timesPlayed ?? 0;
  const mostPlayed = sortByHistory(allSongs, stats, 'most-played')
    .filter((song) => timesPlayed(song) > 0)
    .slice(0, TOP);
  // At most half the active songs, so a small library doesn't list its favourites here too.
  const leastPlayed = sortByHistory(activeSongs, stats, 'least-played').slice(
    0,
    Math.min(TOP, Math.ceil(activeSongs.length / 2)),
  );
  const leftOut = activeSongs
    .filter((song) => since.get(song.id)! >= gigCount)
    .sort((a, b) => since.get(b.id)! - since.get(a.id)!);
  const lastGig = [...played].sort((a, b) => b.date.localeCompare(a.date))[0]!;
  const songsPlayed = allSongs.filter((song) => timesPlayed(song) > 0).length;
  const kinds = originalsAndCovers(allSongs, stats);
  const totalPlays = kinds.originals.plays + kinds.covers.plays;
  const repertoire = kinds.originals.songs + kinds.covers.songs;

  return (
    <>
      <PageHeader title="Stats" />
      <dl className="stats-tiles">
        <div className="stats-tile">
          <dt>Gigs played</dt>
          <dd>{played.length}</dd>
        </div>
        <div className="stats-tile">
          <dt>Songs played</dt>
          <dd>
            {songsPlayed} <span className="muted">of {allSongs.length}</span>
          </dd>
        </div>
        <div className="stats-tile">
          <dt>Last gig</dt>
          <dd>{dateFormat.format(localDate(lastGig.date))}</dd>
        </div>
      </dl>

      <div className="stats-grid">
        <Card title="Most played">
          <SongList songs={mostPlayed} detail={(song) => times(timesPlayed(song))} />
        </Card>

        <Card title="Least played">
          {leastPlayed.length > 0 ? (
            <SongList
              songs={leastPlayed}
              detail={(song) => {
                const s = stats.get(song.id);
                return s
                  ? `${times(s.timesPlayed)}, last ${dateFormat.format(localDate(s.lastPlayed))}`
                  : 'Never played';
              }}
            />
          ) : (
            <p className="muted">No active songs in the library.</p>
          )}
        </Card>

        <Card title="Not played lately">
          <label className="stats-card__control">
            Not played in the last
            <select
              className="sm-input"
              value={gigCount}
              onChange={(e) => setGigCount(Number(e.target.value))}
            >
              {GIG_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n} gigs
                </option>
              ))}
            </select>
          </label>
          {leftOut.length > 0 ? (
            <SongList
              songs={leftOut}
              detail={(song) =>
                stats.has(song.id)
                  ? `${since.get(song.id)} ${since.get(song.id) === 1 ? 'gig' : 'gigs'}`
                  : 'Never played'
              }
            />
          ) : (
            <p className="muted">Every active song was played in the last {gigCount} gigs.</p>
          )}
        </Card>

        <Card title="Originals and covers">
          <dl className="stats-split">
            {(['originals', 'covers'] as const).map((kind) => (
              <div key={kind}>
                <dt>{kind === 'originals' ? 'Originals' : 'Covers'}</dt>
                <dd>
                  {kinds[kind].songs} {kinds[kind].songs === 1 ? 'song' : 'songs'} (
                  {percent(kinds[kind].songs, repertoire)} of the repertoire)
                </dd>
                <dd className="muted">
                  Played {times(kinds[kind].plays)} ({percent(kinds[kind].plays, totalPlays)} of
                  plays)
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Gigs per month" wide>
          <GigsPerMonth months={gigsPerMonth(gigs.rows, today)} />
        </Card>
      </div>
    </>
  );
}
