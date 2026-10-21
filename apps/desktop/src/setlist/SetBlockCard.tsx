import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  formatDuration,
  setDuration,
  type EntryWarning,
  type SetEntry,
  type Song,
} from '@setlist/core';
import { Coffee, GripVertical, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react';
import { EntryRow } from './EntryRow';
import type { BlockWithEntries } from './useGigSetlist';

export function SetBlockCard({
  item,
  songsById,
  warnings,
  missing,
  onEditBlock,
  onRemoveBlock,
  onAddBreak,
  onAddNote,
  onAddSongs,
  onEditEntry,
  onRemoveEntry,
}: {
  item: BlockWithEntries;
  songsById: ReadonlyMap<string, Song>;
  warnings: ReadonlyMap<string, readonly EntryWarning[]>;
  /** The gig's missing tags (#88). */
  missing: readonly string[];
  onEditBlock: () => void;
  onRemoveBlock: () => void;
  onAddBreak: () => void;
  onAddNote: () => void;
  /** Opens the library to add songs to this set (on phones, where it isn't on screen). */
  onAddSongs: () => void;
  onEditEntry: (entry: SetEntry) => void;
  onRemoveEntry: (entry: SetEntry) => void;
}) {
  const { block, entries } = item;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `block:${block.id}`, data: { type: 'block', blockId: block.id } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${block.id}`,
    data: { type: 'drop', blockId: block.id },
  });
  const time = setDuration(entries, songsById);
  const target = block.targetDurationSec;
  const titleId = `set-${block.id}`;

  let songNumber = 0;

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: transition,
      }}
      className={isDragging ? 'set set--dragging' : 'set'}
      aria-labelledby={titleId}
    >
      <header className="set__header">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="drag-handle"
          aria-label={`Mover ${block.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
        <h2 id={titleId} className="set__name">
          {block.name}
        </h2>
        <span
          className={
            target !== null && time.totalSec > target ? 'set__time set__time--over' : 'set__time'
          }
          aria-label={`Duración total ${formatDuration(time.totalSec)}${target !== null ? ` de ${formatDuration(target)}` : ''}`}
        >
          {formatDuration(time.totalSec)}
          {target !== null && <span className="muted"> / {formatDuration(target)}</span>}
        </span>
        <span className="muted set__count">
          {time.songs} {time.songs === 1 ? 'canción' : 'canciones'}
          {time.missingLengths > 0 && ` · ${time.missingLengths} sin duración`}
        </span>
        <span className="set__actions">
          <button
            type="button"
            className="icon-button"
            aria-label={`Editar ${block.name}`}
            onClick={onEditBlock}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Eliminar ${block.name}`}
            onClick={onRemoveBlock}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </span>
      </header>

      <ul
        ref={setDropRef}
        className={isOver ? 'set__entries set__entries--over' : 'set__entries'}
        aria-label={`Canciones de ${block.name}`}
      >
        <SortableContext
          items={entries.map((entry) => entry.id)}
          strategy={verticalListSortingStrategy}
        >
          {entries.map((entry) => {
            const song = entry.songId ? songsById.get(entry.songId) : undefined;
            const number = entry.kind === 'song' ? ++songNumber : null;
            return (
              <EntryRow
                key={entry.id}
                entry={entry}
                number={number}
                song={song}
                warnings={warnings.get(entry.id) ?? []}
                missing={missing}
                onEdit={() => onEditEntry(entry)}
                onRemove={() => onRemoveEntry(entry)}
              />
            );
          })}
        </SortableContext>
        {entries.length === 0 && (
          <li className="set__empty muted">
            Arrastra canciones aquí desde el repertorio, o usa sus botones de Agregar.
          </li>
        )}
      </ul>

      <footer className="set__footer">
        <button type="button" className="sm-button set__add-songs" onClick={onAddSongs}>
          <Plus size={14} aria-hidden="true" />
          Agregar canciones
        </button>
        <button type="button" className="sm-button" onClick={onAddBreak}>
          <Coffee size={14} aria-hidden="true" />
          Agregar descanso
        </button>
        <button type="button" className="sm-button" onClick={onAddNote}>
          <StickyNote size={14} aria-hidden="true" />
          Agregar nota
        </button>
      </footer>
    </section>
  );
}
