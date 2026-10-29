import {
  Currency,
  EstateAssetItem,
  EstateDeductionItem,
  HeirsInput,
} from '../types/inheritance';
import { LandSubdivisionState } from '../types/landSubdivision';

export interface CaseWorkspaceSnapshot {
  caseId: string;
  heirsInput: HeirsInput;
  assets: EstateAssetItem[];
  deductions: EstateDeductionItem[];
  currency: Currency;
  subdivisionState: LandSubdivisionState;
}

export interface UndoHistoryEntry<T> {
  snapshot: T;
  actionLabelSomali: string;
  timestampIso: string;
}

export interface UndoRedoState<T> {
  past: UndoHistoryEntry<T>[];
  present: UndoHistoryEntry<T>;
  future: UndoHistoryEntry<T>[];
  maxDepth: number;
}

function deepCloneSnapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function areSnapshotsIdentical<T>(a: T, b: T): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Initializes a clean Undo/Redo history stack for the active case workspace.
 * Resetting when switching cases guarantees Undo never leaks state across cases.
 */
export function createUndoRedoHistory<T>(
  initialState: T,
  initialLabelSomali = 'Bilowga Kiiska',
  maxDepth = 35
): UndoRedoState<T> {
  return {
    past: [],
    present: {
      snapshot: deepCloneSnapshot(initialState),
      actionLabelSomali: initialLabelSomali,
      timestampIso: new Date().toISOString(),
    },
    future: [],
    maxDepth,
  };
}

/**
 * Records a new workspace snapshot onto the Undo stack and clears Redo future,
 * ignoring duplicate consecutive snapshots.
 */
export function pushUndoSnapshot<T>(
  history: UndoRedoState<T>,
  nextState: T,
  actionLabelSomali: string
): UndoRedoState<T> {
  if (areSnapshotsIdentical(history.present.snapshot, nextState)) {
    return history;
  }

  const nextPast = [...history.past, history.present];
  const trimmedPast =
    nextPast.length > history.maxDepth
      ? nextPast.slice(nextPast.length - history.maxDepth)
      : nextPast;

  return {
    past: trimmedPast,
    present: {
      snapshot: deepCloneSnapshot(nextState),
      actionLabelSomali: actionLabelSomali.trim() || 'Wax-ka-beddel',
      timestampIso: new Date().toISOString(),
    },
    future: [],
    maxDepth: history.maxDepth,
  };
}

/**
 * Steps backward one state on the Undo stack without mutating calculation rules.
 */
export function performUndo<T>(history: UndoRedoState<T>): {
  ok: boolean;
  nextHistory: UndoRedoState<T>;
  restoredState: T | null;
  undoneActionSomali?: string;
} {
  if (history.past.length === 0) {
    return {
      ok: false,
      nextHistory: history,
      restoredState: null,
    };
  }

  const previousEntry = history.past[history.past.length - 1];
  const remainingPast = history.past.slice(0, -1);
  const undoneLabel = history.present.actionLabelSomali;

  const nextHistory: UndoRedoState<T> = {
    past: remainingPast,
    present: {
      snapshot: deepCloneSnapshot(previousEntry.snapshot),
      actionLabelSomali: previousEntry.actionLabelSomali,
      timestampIso: previousEntry.timestampIso,
    },
    future: [history.present, ...history.future].slice(0, history.maxDepth),
    maxDepth: history.maxDepth,
  };

  return {
    ok: true,
    nextHistory,
    restoredState: deepCloneSnapshot(previousEntry.snapshot),
    undoneActionSomali: undoneLabel,
  };
}

/**
 * Steps forward one state on the Redo stack.
 */
export function performRedo<T>(history: UndoRedoState<T>): {
  ok: boolean;
  nextHistory: UndoRedoState<T>;
  restoredState: T | null;
  redoneActionSomali?: string;
} {
  if (history.future.length === 0) {
    return {
      ok: false,
      nextHistory: history,
      restoredState: null,
    };
  }

  const [nextEntry, ...remainingFuture] = history.future;

  const nextHistory: UndoRedoState<T> = {
    past: [...history.past, history.present].slice(-history.maxDepth),
    present: {
      snapshot: deepCloneSnapshot(nextEntry.snapshot),
      actionLabelSomali: nextEntry.actionLabelSomali,
      timestampIso: nextEntry.timestampIso,
    },
    future: remainingFuture,
    maxDepth: history.maxDepth,
  };

  return {
    ok: true,
    nextHistory,
    restoredState: deepCloneSnapshot(nextEntry.snapshot),
    redoneActionSomali: nextEntry.actionLabelSomali,
  };
}
