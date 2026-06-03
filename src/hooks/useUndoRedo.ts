import { useRef, useReducer, useCallback } from 'react';

// Tiny snapshot-based undo/redo. The caller records a deep-cloned snapshot of
// its editable state *before* each edit, and applies the snapshot returned by
// undo/redo. State lives in refs (no re-render on record) with a force-update
// only so the can-undo/redo button states refresh.
export function useUndoRedo<T>(limit = 100) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, force] = useReducer((x: number) => x + 1, 0);

  const clone = (v: T): T =>
    (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

  // Record the pre-edit state. Clears the redo stack (new branch).
  const record = useCallback((current: T) => {
    past.current.push(clone(current));
    if (past.current.length > limit) past.current.shift();
    future.current = [];
    force();
  }, [limit]);

  // Returns the snapshot to apply, or undefined if nothing to undo/redo.
  const undo = useCallback((current: T): T | undefined => {
    if (!past.current.length) return undefined;
    future.current.push(clone(current));
    const snap = past.current.pop()!;
    force();
    return snap;
  }, []);

  const redo = useCallback((current: T): T | undefined => {
    if (!future.current.length) return undefined;
    past.current.push(clone(current));
    const snap = future.current.pop()!;
    force();
    return snap;
  }, []);

  const clear = useCallback(() => {
    past.current = [];
    future.current = [];
    force();
  }, []);

  return {
    record, undo, redo, clear,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
