import { useCallback, useEffect, useRef, useState } from 'react';

/** A change that can be undone: `apply` makes it (again), `revert` takes it back. */
export interface Change {
  label: string;
  apply: () => Promise<unknown>;
  revert: () => Promise<unknown>;
}

const LIMIT = 50;

/**
 * Undo/redo for the last 50 changes. `run` applies a change and records it; after every change,
 * undo or redo, `onChanged` runs (to reload data). Ctrl/Cmd+Z undoes; Ctrl+Y or Ctrl/Cmd+Shift+Z
 * redoes, except while typing in a field, where the field's own undo applies.
 */
export function useHistory(onChanged: () => void) {
  const [past, setPast] = useState<Change[]>([]);
  const [future, setFuture] = useState<Change[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const busy = useRef(false);

  const step = useCallback(
    async (work: () => Promise<unknown>) => {
      if (busy.current) return false;
      busy.current = true;
      setFailure(null);
      try {
        await work();
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
    async (change: Change) => {
      if (await step(change.apply)) {
        setPast((list) => [...list, change].slice(-LIMIT));
        setFuture([]);
      }
    },
    [step],
  );

  const undo = useCallback(async () => {
    const change = past.at(-1);
    if (change && (await step(change.revert))) {
      setPast((list) => list.slice(0, -1));
      setFuture((list) => [...list, change]);
    }
  }, [past, step]);

  const redo = useCallback(async () => {
    const change = future.at(-1);
    if (change && (await step(change.apply))) {
      setFuture((list) => list.slice(0, -1));
      setPast((list) => [...list, change]);
    }
  }, [future, step]);

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
  };
}
