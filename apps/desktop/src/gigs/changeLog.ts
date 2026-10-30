import {
  formatDate,
  formatDuration,
  formatList,
  formatTime,
  type ChangeLogEntry,
  type FieldChange,
  type SetEntryKind,
} from '@setlist/core';

/** What the log's sentences look up: names for the IDs it records. */
export interface ChangeLogNames {
  member: (memberId: string) => string;
  song: (songId: string) => string | undefined;
  /** An entry as it is now (or was, when deleted): what it is and where. */
  entry: (
    entryId: string,
  ) => { kind: SetEntryKind; songId: string | null; label: string | null } | undefined;
  set: (blockId: string) => string | undefined;
  venue: (venueId: string) => string | undefined;
}

/** One line of the log: who, when, and what they did. */
export interface ChangeLine {
  id: string;
  who: string;
  at: Date;
  text: string;
}

// Additions or removals of entries by one person this close together read as one line.
const BATCH_MS = 2 * 60 * 1000;

const value = (change: FieldChange | undefined) => change?.new as unknown;
const text = (change: FieldChange | undefined) => {
  const v = value(change);
  return typeof v === 'string' ? v : null;
};

const entryKind = (entry: ChangeLogEntry, names: ChangeLogNames): SetEntryKind =>
  (text(entry.changes.kind) as SetEntryKind | null) ?? names.entry(entry.rowId)?.kind ?? 'song';

function entrySubject(entry: ChangeLogEntry, names: ChangeLogNames): string {
  const now = names.entry(entry.rowId);
  const kind = entryKind(entry, names);
  const songId = text(entry.changes.song_id) ?? now?.songId ?? null;
  if (kind === 'song') return (songId && names.song(songId)) ?? 'una canción';
  const label = text(entry.changes.label) ?? now?.label;
  if (kind === 'break') return label ? `el descanso «${label}»` : 'un descanso';
  return label ? `la nota «${label}»` : 'una nota';
}

function describeEntry(entry: ChangeLogEntry, names: ChangeLogNames): string {
  const what = entrySubject(entry, names);
  const { changes } = entry;
  switch (entry.action) {
    case 'add': {
      const set = text(changes.set_block_id) && names.set(text(changes.set_block_id)!);
      return set ? `agregó ${what} a ${set}` : `agregó ${what}`;
    }
    case 'remove':
      return `quitó ${what}`;
    case 'restore':
      return `volvió a poner ${what}`;
    default: {
      const parts: string[] = [];
      if ('set_block_id' in changes) {
        const set = names.set(text(changes.set_block_id) ?? '');
        parts.push(set ? `movió ${what} a ${set}` : `movió ${what}`);
      } else if ('position' in changes) {
        parts.push(`movió ${what}`);
      }
      if ('key_override' in changes) {
        const key = text(changes.key_override);
        parts.push(
          key ? `cambió el tono de ${what} a ${key}` : `volvió al tono habitual de ${what}`,
        );
      }
      if ('tempo_override' in changes) {
        const bpm = value(changes.tempo_override);
        parts.push(
          typeof bpm === 'number'
            ? `cambió el tempo de ${what} a ${bpm} bpm`
            : `volvió al tempo habitual de ${what}`,
        );
      }
      if ('segue_to_next' in changes) {
        parts.push(
          value(changes.segue_to_next)
            ? `enlazó ${what} con la siguiente`
            : `quitó el enlace de ${what}`,
        );
      }
      if ('notes' in changes) parts.push(`cambió las notas de ${what}`);
      if ('label' in changes) parts.push(`cambió el texto de ${what}`);
      return parts.length > 0 ? formatList(parts) : `cambió ${what}`;
    }
  }
}

function describeSet(entry: ChangeLogEntry, names: ChangeLogNames): string {
  const { changes } = entry;
  const name =
    entry.action === 'change' && 'name' in changes
      ? (changes.name?.old as string | undefined)
      : (text(changes.name) ?? names.set(entry.rowId));
  const set = name ? `«${name}»` : 'un set';
  switch (entry.action) {
    case 'add':
      return `agregó ${set}`;
    case 'remove':
      return `eliminó ${set}`;
    case 'restore':
      return `volvió a poner ${set}`;
    default: {
      const parts: string[] = [];
      if ('name' in changes) parts.push(`cambió el nombre de ${set} a «${text(changes.name)}»`);
      if ('target_duration_sec' in changes) {
        const target = value(changes.target_duration_sec);
        parts.push(
          typeof target === 'number'
            ? `cambió la duración objetivo de ${set} a ${formatDuration(target)}`
            : `quitó la duración objetivo de ${set}`,
        );
      }
      if ('position' in changes) parts.push(`movió ${set}`);
      return parts.length > 0 ? formatList(parts) : `cambió ${set}`;
    }
  }
}

function describeGig(entry: ChangeLogEntry, names: ChangeLogNames): string {
  const { changes } = entry;
  switch (entry.action) {
    case 'add':
      return 'creó el toque';
    case 'remove':
      return 'eliminó el toque';
    case 'restore':
      return 'volvió a poner el toque';
    default: {
      const parts: string[] = [];
      if ('status' in changes) {
        const status = text(changes.status);
        parts.push(status === 'cancelled' ? 'canceló el toque' : 'volvió a programar el toque');
      }
      if ('title' in changes) parts.push(`cambió el nombre del toque a «${text(changes.title)}»`);
      if ('date' in changes) {
        const date = text(changes.date);
        parts.push(date ? `cambió la fecha a ${formatDate(date, 'short')}` : 'cambió la fecha');
      }
      if ('start_time' in changes) {
        const time = text(changes.start_time);
        parts.push(
          time ? `cambió la hora de inicio a ${formatTime(time)}` : 'quitó la hora de inicio',
        );
      }
      if ('load_in_time' in changes) {
        const time = text(changes.load_in_time);
        parts.push(
          time ? `cambió la hora de llegada a ${formatTime(time)}` : 'quitó la hora de llegada',
        );
      }
      if ('venue_id' in changes) {
        const venue = text(changes.venue_id) && names.venue(text(changes.venue_id)!);
        parts.push(venue ? `cambió el lugar a ${venue}` : 'cambió el lugar');
      }
      if ('missing_tags' in changes) parts.push('cambió lo que falta para el toque');
      if ('notes' in changes) parts.push('cambió las notas del toque');
      return parts.length > 0 ? formatList(parts) : 'cambió los detalles del toque';
    }
  }
}

/** One log entry in words, without who: "cambió el tono de Basurita a C". */
export function describeChange(entry: ChangeLogEntry, names: ChangeLogNames): string {
  switch (entry.tableName) {
    case 'set_entries':
      return describeEntry(entry, names);
    case 'set_blocks':
      return describeSet(entry, names);
    case 'setlists':
      return 'notes' in entry.changes ? 'cambió las notas del setlist' : 'cambió el setlist';
    default:
      return describeGig(entry, names);
  }
}

/**
 * A gig's log as lines to read, newest first (#50). Songs added or taken out in one go, as when
 * starting from another gig, read as one line: "agregó 12 canciones".
 */
export function changeLines(
  entries: readonly ChangeLogEntry[],
  names: ChangeLogNames,
): ChangeLine[] {
  const live = entries
    .filter((entry) => !entry.deletedAt)
    // In the order the server applied them.
    .sort((a, b) => a.seq - b.seq);
  type Batch = { key: string; count: number; songs: number; last: number };
  const lines: (ChangeLine & { batch?: Batch })[] = [];
  for (const entry of live) {
    const at = new Date(entry.createdAt);
    const who = entry.memberId ? names.member(entry.memberId) : 'Alguien';
    const batchable =
      entry.tableName === 'set_entries' && (entry.action === 'add' || entry.action === 'remove');
    const key = `${entry.memberId}:${entry.action}`;
    const previous = lines.at(-1);
    if (
      batchable &&
      previous?.batch?.key === key &&
      at.getTime() - previous.batch.last <= BATCH_MS
    ) {
      const batch = previous.batch;
      batch.count += 1;
      if (entryKind(entry, names) === 'song') batch.songs += 1;
      batch.last = at.getTime();
      previous.at = at;
      const items = batch.songs === batch.count ? 'canciones' : 'elementos';
      previous.text = `${entry.action === 'add' ? 'agregó' : 'quitó'} ${batch.count} ${items}`;
      continue;
    }
    lines.push({
      id: entry.id,
      who,
      at,
      text: describeChange(entry, names),
      ...(batchable
        ? {
            batch: {
              key,
              count: 1,
              songs: entryKind(entry, names) === 'song' ? 1 : 0,
              last: at.getTime(),
            },
          }
        : {}),
    });
  }
  return lines.reverse().map(({ id, who, at, text }) => ({ id, who, at, text }));
}
