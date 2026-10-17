import {
  formatDuration,
  SONG_STATUS_LABELS,
  type Song,
  type SongSortKey,
  type SortDirection,
} from '@setlist/core';
import { ArrowDown, ArrowUp } from 'lucide-react';

export interface SongSort {
  key: SongSortKey;
  direction: SortDirection;
}

const COLUMNS: { key: SongSortKey; label: string; numeric?: boolean }[] = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'key', label: 'Key' },
  { key: 'tempoBpm', label: 'BPM', numeric: true },
  { key: 'durationSec', label: 'Length', numeric: true },
  { key: 'status', label: 'Status' },
];

export function SongTable({
  songs,
  sort,
  selectedId,
  onSort,
  onOpen,
}: {
  songs: readonly Song[];
  sort: SongSort;
  selectedId?: string;
  onSort: (key: SongSortKey) => void;
  onOpen: (song: Song) => void;
}) {
  return (
    <table className="song-table">
      <thead>
        <tr>
          {COLUMNS.map(({ key, label, numeric }) => {
            const active = sort.key === key;
            const Arrow = sort.direction === 'asc' ? ArrowUp : ArrowDown;
            return (
              <th
                key={key}
                scope="col"
                className={numeric ? 'song-table__numeric' : undefined}
                aria-sort={
                  active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                }
              >
                <button type="button" className="song-table__sort" onClick={() => onSort(key)}>
                  {label}
                  {active && <Arrow size={14} aria-hidden="true" />}
                </button>
              </th>
            );
          })}
          <th scope="col">Tags</th>
        </tr>
      </thead>
      <tbody>
        {songs.map((song) => (
          <tr
            key={song.id}
            className={
              [
                song.status === 'retired' && 'song-table__retired',
                song.id === selectedId && 'song-table__selected',
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
          >
            <td>
              <button
                type="button"
                className="song-table__title"
                aria-current={song.id === selectedId ? 'true' : undefined}
                onClick={() => onOpen(song)}
              >
                {song.title}
              </button>
              {song.isOriginal && <span className="badge">Original</span>}
            </td>
            <td>{song.artist}</td>
            <td>{song.key}</td>
            <td className="song-table__numeric">{song.tempoBpm}</td>
            <td className="song-table__numeric">
              {song.durationSec === null ? '' : formatDuration(song.durationSec)}
            </td>
            <td>{SONG_STATUS_LABELS[song.status]}</td>
            <td>
              {song.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
