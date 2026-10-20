import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { keyBetween, move, planDrop, type SetBlock, type SetEntry, type Song } from '@setlist/core';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BlockDialog } from './BlockDialog';
import { AT_END, type SetlistChanges } from './changes';
import { EntryDialog, type EntryValues } from './EntryDialog';
import { entryTitle } from './EntryRow';
import { LibraryPanel } from './LibraryPanel';
import type { SongHistory } from './songHistory';
import { SetBlockCard } from './SetBlockCard';
import type { BlockWithEntries } from './useGigSetlist';
import type { Change } from './useHistory';
import type { EntryWarning } from '@setlist/core';

type Editing =
  | { kind: 'entry'; entry: SetEntry }
  | { kind: 'new-note'; blockId: string }
  | { kind: 'block'; block: SetBlock }
  | null;

type DragData =
  | { type: 'entry'; blockId: string }
  | { type: 'library'; songId: string; title: string }
  | { type: 'block'; blockId: string }
  | { type: 'drop'; blockId: string };

/**
 * While dragging a set, only other sets are targets. While dragging a song or entry, entries and
 * set areas are: the pointer's position decides, preferring an entry over the set around it.
 * Keyboard dragging has no pointer, so the closest target wins.
 */
const collisionDetection: CollisionDetection = (args) => {
  const activeType = (args.active.data.current as DragData | undefined)?.type;
  const accepts = (type: DragData['type'] | undefined) =>
    activeType === 'block' ? type === 'block' : type === 'entry' || type === 'drop';
  const droppableContainers = args.droppableContainers.filter((container) =>
    accepts((container.data.current as DragData | undefined)?.type),
  );
  const filtered = { ...args, droppableContainers };
  if (activeType === 'block' || !args.pointerCoordinates) return closestCenter(filtered);

  const hits = pointerWithin(filtered);
  const entryHit = hits.find(
    (hit) =>
      (droppableContainers.find((c) => c.id === hit.id)?.data.current as DragData)?.type ===
      'entry',
  );
  return entryHit ? [entryHit] : hits;
};

/**
 * The set changed most recently: the last one added, renamed or moved, or the one whose songs,
 * breaks or notes were last added, edited or moved in. Ties go to the later set.
 */
function lastChangedBlock(blocks: readonly BlockWithEntries[]): { id: string; at: string } | null {
  let latest: { id: string; at: string } | null = null;
  for (const { block, entries } of blocks) {
    const at = entries.reduce((max, e) => (e.updatedAt > max ? e.updatedAt : max), block.updatedAt);
    if (!latest || at >= latest.at) latest = { id: block.id, at };
  }
  return latest;
}

export function SetlistEditor({
  setlistId,
  blocks,
  songs,
  songsById,
  warnings,
  missing = [],
  history,
  changes,
  run,
  readOnly = false,
}: {
  setlistId: string;
  blocks: readonly BlockWithEntries[];
  songs: readonly Song[];
  songsById: ReadonlyMap<string, Song>;
  warnings: ReadonlyMap<string, readonly EntryWarning[]>;
  /** Tags the band can't cover at this gig (#88): flagged in the sets, hideable in the library. */
  missing?: readonly string[];
  /** The band's history, for hints in the library panel (#33). */
  history?: SongHistory;
  changes: SetlistChanges;
  run: (change: Change) => Promise<void>;
  /** For viewers: shows the setlist without any way to change it. */
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // A set picked in the library's "Add to" stays the target until something else changes.
  const [chosen, setChosen] = useState<{ id: string; at: string } | null>(null);
  // Phones: the library is a sheet over the sets, opened from a set's Add songs button.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const entriesById = useMemo(
    () => new Map(blocks.flatMap(({ entries }) => entries.map((entry) => [entry.id, entry]))),
    [blocks],
  );
  const usedSongIds = useMemo(
    () =>
      new Set([...entriesById.values()].flatMap((entry) => (entry.songId ? [entry.songId] : []))),
    [entriesById],
  );
  const lastChanged = lastChangedBlock(blocks);
  const chosenBlock = blocks.some(({ block }) => block.id === chosen?.id) ? chosen : null;
  const targetBlockId =
    chosenBlock && (!lastChanged || chosenBlock.at >= lastChanged.at)
      ? chosenBlock.id
      : lastChanged?.id;

  const positioned = blocks.map(({ block, entries }) => ({ id: block.id, entries }));

  function addSong(songId: string, blockId: string) {
    const title = songsById.get(songId)?.title ?? 'song';
    void run(changes.addEntry(`Add ${title}`, blockId, AT_END, { kind: 'song', songId }));
  }

  function onDragStart({ active }: DragStartEvent) {
    const data = active.data.current as DragData;
    if (data.type === 'library') setDragging(data.title);
    else if (data.type === 'entry') {
      const entry = entriesById.get(String(active.id));
      setDragging(
        entry ? entryTitle(entry, entry.songId ? songsById.get(entry.songId) : undefined) : null,
      );
    } else if (data.type === 'block') {
      setDragging(blocks.find((b) => b.block.id === data.blockId)?.block.name ?? null);
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const from = active.data.current as DragData | undefined;
    const to = over?.data.current as DragData | undefined;
    if (!over || !from || !to || to.type === 'library') return;

    if (from.type === 'block') {
      if (to.type !== 'block') return;
      const order = blocks.map(({ block }) => ({ id: block.id, position: block.position }));
      const fromIndex = order.findIndex((b) => b.id === from.blockId);
      const toIndex = order.findIndex((b) => b.id === to.blockId);
      if (fromIndex === toIndex) return;
      const block = blocks[fromIndex]!.block;
      void run(
        changes.updateBlock(`Move ${block.name}`, block, {
          position: move(order, fromIndex, toIndex),
        }),
      );
      return;
    }

    const target =
      to.type === 'entry'
        ? { kind: 'entry' as const, id: String(over.id) }
        : { kind: 'block' as const, id: to.blockId };
    const plan = planDrop(positioned, from.type === 'entry' ? String(active.id) : null, target);
    if (!plan) return;

    if (from.type === 'library') {
      void run(
        changes.addEntry(`Add ${from.title}`, plan.blockId, plan.position, {
          kind: 'song',
          songId: from.songId,
        }),
      );
    } else if (from.type === 'entry') {
      const entry = entriesById.get(String(active.id));
      if (entry) void run(changes.moveEntry(entry, plan));
    }
  }

  function saveEntry(values: EntryValues) {
    if (!editing) return;
    if (editing.kind === 'new-note') {
      void run(
        changes.addEntry('Add note', editing.blockId, AT_END, {
          kind: 'note',
          label: values.label,
        }),
      );
    } else if (editing.kind === 'entry') {
      const { entry } = editing;
      const patch = Object.fromEntries(
        Object.entries(values).filter(([key, value]) => entry[key as keyof EntryValues] !== value),
      );
      if (Object.keys(patch).length > 0) void run(changes.updateEntry('Edit entry', entry, patch));
    }
    setEditing(null);
  }

  const addSet = () => {
    const last = blocks.at(-1)?.block.position ?? null;
    void run(changes.addBlock(setlistId, `Set ${blocks.length + 1}`, keyBetween(last, null)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div
        className={[
          'setlist-editor',
          readOnly && 'setlist-editor--readonly',
          libraryOpen && 'setlist-editor--library-open',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="setlist-editor__sets">
          <SortableContext
            items={blocks.map(({ block }) => `block:${block.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {blocks.map((item) => (
              <SetBlockCard
                key={item.block.id}
                item={item}
                songsById={songsById}
                warnings={warnings}
                missing={missing}
                onEditBlock={() => setEditing({ kind: 'block', block: item.block })}
                onRemoveBlock={() => void run(changes.removeBlock(item.block))}
                onAddBreak={() =>
                  void run(
                    changes.addEntry('Add break', item.block.id, AT_END, {
                      kind: 'break',
                    }),
                  )
                }
                onAddNote={() => setEditing({ kind: 'new-note', blockId: item.block.id })}
                onAddSongs={() => {
                  setChosen({ id: item.block.id, at: new Date().toISOString() });
                  setLibraryOpen(true);
                }}
                onEditEntry={(entry) => setEditing({ kind: 'entry', entry })}
                onRemoveEntry={(entry) =>
                  void run(
                    changes.removeEntry(
                      `Remove ${entryTitle(entry, entry.songId ? songsById.get(entry.songId) : undefined)}`,
                      entry,
                    ),
                  )
                }
              />
            ))}
          </SortableContext>
          {!readOnly && (
            <button type="button" className="sm-button setlist-editor__add-set" onClick={addSet}>
              <Plus size={16} aria-hidden="true" />
              Add set
            </button>
          )}
        </div>
        {!readOnly && (
          <LibraryPanel
            songs={songs}
            blocks={blocks.map(({ block }) => block)}
            usedSongIds={usedSongIds}
            missing={missing}
            history={history}
            targetId={targetBlockId}
            onTargetChange={(id) => setChosen({ id, at: new Date().toISOString() })}
            onAdd={addSong}
            onClose={() => setLibraryOpen(false)}
          />
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && <div className="drag-overlay">{dragging}</div>}
      </DragOverlay>

      {editing?.kind === 'block' && (
        <BlockDialog
          block={editing.block}
          onClose={() => setEditing(null)}
          onSave={(values) => {
            void run(changes.updateBlock(`Edit ${editing.block.name}`, editing.block, values));
            setEditing(null);
          }}
        />
      )}
      {(editing?.kind === 'entry' || editing?.kind === 'new-note') && (
        <EntryDialog
          kind={editing.kind === 'entry' ? editing.entry.kind : 'note'}
          entry={editing.kind === 'entry' ? editing.entry : null}
          song={
            editing.kind === 'entry' && editing.entry.songId
              ? songsById.get(editing.entry.songId)
              : undefined
          }
          onClose={() => setEditing(null)}
          onSave={saveEntry}
        />
      )}
    </DndContext>
  );
}
