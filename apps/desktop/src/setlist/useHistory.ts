import { useCallback, useEffect, useRef, useState } from 'react';

/** A field undo or redo left as it was, because someone changed it after this change. */
export interface KeptField {
  field: string;
  /** The band member who last changed the row, when known. */
  by: string | null;
}

/** What undoing or redoing a change did, when it couldn't do all of it. */
export interface Outcome {
  kept: KeptField[];
}

/**
 * A change that can be undone: `apply` makes it (again), `revert` takes it back. Either can
 * report fields it left alone (`Outcome`), so a bandmate's later change isn't overwritten.
 */
export interface Change {
  label: string;
  apply: () => Promise<unknown>;
  revert: () => Promise<unknown>;
}

/** The last undo or redo that left fields alone, to say so. */
export interface KeptNotice {
  undid: boolean;
  label: string;
  kept: KeptField[];
}

const keptFrom = (result: unknown): KeptField[] =>
  result && typeof result === 'object' && 'kept' in result ? (result as Outcome).kept : [];

const LIMIT = 50;

/**
 * Undo/redo for the last 50 changes. `run` applies a change and records it, one at a time in the
 * order they come (quick taps queue up rather than being lost); after every change,
 * undo or redo, `onChanged` runs (to reload data). Ctrl/Cmd+Z undoes; Ctrl+Y or Ctrl/Cmd+Shift+Z
 * redoes, except while typing in a field, where the field's own undo applies. Undo and redo
 * leave alone any field someone changed since (`notice` says which), so they never overwrite a
 * bandmate's change.
 */
export function useHistory(
  onChanged: () => void,
  /** Before undo or redo, brings in bandmates' latest changes, so the check sees them. */
  catchUp: () => Promise<unknown> = () => Promise.resolve(),
) {
  const [past, setPast] = useState<Change[]>([]);
  const [future, setFuture] = useState<Change[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<KeptNotice | null>(null);
  const busy = useRef(false);
  // New changes wait their turn instead of being dropped, so quick taps all count.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const step = useCallback(
    async (work: () => Promise<unknown>, said?: Omit<KeptNotice, 'kept'>) => {
      busy.current = true;
      setFailure(null);
      setNotice(null);
      try {
        const kept = keptFrom(await work());
        if (said && kept.length > 0) setNotice({ ...said, kept });
        return true;
      } catch (error) {
        setFailure(String(error));
        return false;
      } finally {
        busy.current = false;
        onChanged();
      }
    },
    [onChanged],
  );

  const run = useCallback(
    (change: Change) => {
      const done = queue.current.then(async () => {
        if (await step(change.apply)) {
          setPast((list) => [...list, change].slice(-LIMIT));
          setFuture([]);
        }
      });
      queue.current = done;
      return done;
    },
    [step],
  );

  // Undo and redo act on the history as it is now, so they're ignored while a change is saving.
  const undo = useCallback(async () => {
    if (busy.current) return;
    const change = past.at(-1);
    if (!change) return;
    busy.current = true;
    await catchUp().catch(() => {});
    if (await step(change.revert, { undid: true, label: change.label })) {
      setPast((list) => list.slice(0, -1));
      setFuture((list) => [...list, change]);
    }
  }, [past, step, catchUp]);

  const redo = useCallback(async () => {
    if (busy.current) return;
    const change = future.at(-1);
    if (!change) return;
    busy.current = true;
    await catchUp().catch(() => {});
    if (await step(change.apply, { undid: false, label: change.label })) {
      setFuture((list) => list.slice(0, -1));
      setPast((list) => [...list, change]);
    }
  }, [future, step, catchUp]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        void undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        void redo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return {
    run,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoLabel: past.at(-1)?.label,
    redoLabel: future.at(-1)?.label,
    failure,
    notice,
  };
}
