import {
  countActiveFilters,
  DEFAULT_SONG_FILTERS,
  keysInUse,
  SONG_STATUS_LABELS,
  tagCounts,
  type Song,
  type SongFilters,
  type SongStatus,
} from '@setlist/core';
import type { ReactNode } from 'react';

const ORIGINS: { value: SongFilters['origin']; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'original', label: 'Propias' },
  { value: 'cover', label: 'Covers' },
];

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function readBpm(text: string): number | null {
  const value = Number.parseInt(text, 10);
  return Number.isNaN(value) ? null : value;
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="filters__group" role="group" aria-label={label}>
      <span className="filters__label">{label}</span>
      <div className="filters__chips">{children}</div>
    </div>
  );
}

/** Status, origin, tag, key and tempo filters. Tags and keys offered are the ones the library uses. */
export function SongFiltersPanel({
  songs,
  filters,
  onChange,
}: {
  songs: readonly Song[];
  filters: SongFilters;
  onChange: (filters: SongFilters) => void;
}) {
  const update = (changes: Partial<SongFilters>) => onChange({ ...filters, ...changes });
  const tags = tagCounts(songs);
  const keys = keysInUse(songs);
  const selectedTags = filters.tags.map((tag) => tag.toLowerCase());

  return (
    <div className="filters" id="song-filters">
      <Group label="Estado">
        {(Object.keys(SONG_STATUS_LABELS) as SongStatus[]).map((status) => (
          <Chip
            key={status}
            pressed={filters.statuses.includes(status)}
            onClick={() => update({ statuses: toggle(filters.statuses, status) })}
          >
            {SONG_STATUS_LABELS[status]}
          </Chip>
        ))}
      </Group>

      <Group label="Canciones">
        {ORIGINS.map(({ value, label }) => (
          <Chip
            key={value}
            pressed={filters.origin === value}
            onClick={() => update({ origin: value })}
          >
            {label}
          </Chip>
        ))}
      </Group>

      {tags.length > 0 && (
        <Group label="Etiquetas">
          {tags.map(({ tag, count }) => (
            <Chip
              key={tag}
              pressed={selectedTags.includes(tag.toLowerCase())}
              onClick={() =>
                update({
                  tags: selectedTags.includes(tag.toLowerCase())
                    ? filters.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
                    : [...filters.tags, tag],
                })
              }
            >
              {tag} <span className="chip__count">{count}</span>
            </Chip>
          ))}
        </Group>
      )}

      {keys.length > 0 && (
        <Group label="Tono">
          {keys.map((key) => (
            <Chip
              key={key}
              pressed={filters.keys.includes(key)}
              onClick={() => update({ keys: toggle(filters.keys, key) })}
            >
              {key}
            </Chip>
          ))}
        </Group>
      )}

      <div className="filters__group" role="group" aria-label="Tempo">
        <span className="filters__label">Tempo</span>
        <div className="filters__range">
          <input
            className="sm-input"
            inputMode="numeric"
            aria-label="BPM mínimo"
            placeholder="Mín."
            value={filters.bpmMin ?? ''}
            onChange={(e) => update({ bpmMin: readBpm(e.target.value) })}
          />
          <span className="muted">a</span>
          <input
            className="sm-input"
            inputMode="numeric"
            aria-label="BPM máximo"
            placeholder="Máx."
            value={filters.bpmMax ?? ''}
            onChange={(e) => update({ bpmMax: readBpm(e.target.value) })}
          />
          <span className="muted">BPM</span>
        </div>
      </div>

      {countActiveFilters(filters) > 0 && (
        <button
          type="button"
          className="sm-button filters__reset"
          onClick={() => onChange(DEFAULT_SONG_FILTERS)}
        >
          Quitar filtros
        </button>
      )}
    </div>
  );
}
