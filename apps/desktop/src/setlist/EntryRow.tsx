import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ENTRY_WARNING_LABELS,
  formatDuration,
  type EntryWarning,
  type SetEntry,
  type Song,
} from '@setlist/core';
import {
  AlertTriangle,
  ArrowDown,
  Coffee,
  GripVertical,
  Pencil,
  StickyNote,
  X,
} from 'lucide-react';
import { SongTags } from '../components/SongTags';

/** What an entry is called: the song title, the break's label, or the note. */
export function entryTitle(entry: SetEntry, song: Song | undefined): string {
  if (entry.kind === 'song') return song?.title ?? 'Canción eliminada';
  if (entry.kind === 'break') return entry.label ?? 'Descanso';
  return entry.label ?? 'Nota';
}

export function EntryRow({
  entry,
  number,
  song,
  warnings,
  missing = [],
  onEdit,
  onRemove,
}: {
  entry: SetEntry;
  /** Position among the set's songs; breaks and notes aren't numbered. */
  number: number | null;
  song: Song | undefined;
  warnings: readonly EntryWarning[];
  /** The gig's missing tags, to mark the song's tags that need them. */
  missing?: readonly string[];
  onEdit: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, data: { type: 'entry', blockId: entry.setBlockId } });
  const title = entryTitle(entry, song);
  const key = entry.keyOverride ?? song?.key ?? null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`entry entry--${entry.kind}${isDragging ? ' entry--dragging' : ''}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="drag-handle"
        aria-label={`Mover ${title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <span className="entry__number">{number ?? ''}</span>
      <span className="entry__main">
        {entry.kind === 'break' && <Coffee size={14} aria-hidden="true" />}
        {entry.kind === 'note' && <StickyNote size={14} aria-hidden="true" />}
        <span className="entry__title" title={title}>
          {title}
        </span>
        {entry.kind === 'song' && song?.artist && (
          <span className="entry__artist muted">· {song.artist}</span>
        )}
        {entry.notes && <span className="entry__notes muted">{entry.notes}</span>}
        {entry.kind === 'song' && song && (
          <SongTags tags={song.tags} missing={missing} className="entry__tags" />
        )}
      </span>
      {entry.segueToNext && (
        <span className="entry__segue" title="Enlaza con la siguiente canción">
          <ArrowDown size={14} aria-hidden="true" />
          <span className="visually-hidden">Enlaza con la siguiente canción</span>
        </span>
      )}
      {warnings.length > 0 && (
        <span
          className="entry__warning"
          title={warnings.map((w) => ENTRY_WARNING_LABELS[w]).join('\n')}
        >
          <AlertTriangle size={14} aria-hidden="true" />
          <span className="visually-hidden">
            {warnings.map((w) => ENTRY_WARNING_LABELS[w]).join('. ')}
          </span>
        </span>
      )}
      <span className={entry.keyOverride ? 'entry__key entry__key--override' : 'entry__key'}>
        {key}
        {entry.keyOverride && song?.key && song.key !== entry.keyOverride && (
          <span className="visually-hidden"> (normalmente {song.key})</span>
        )}
      </span>
      <span className="entry__length">
        {entry.kind === 'song' && song?.durationSec != null ? formatDuration(song.durationSec) : ''}
      </span>
      <span className="entry__actions">
        <button
          type="button"
          className="icon-button"
          aria-label={`Editar ${title}`}
          onClick={onEdit}
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Quitar ${title}`}
          onClick={onRemove}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </span>
    </li>
  );
}
