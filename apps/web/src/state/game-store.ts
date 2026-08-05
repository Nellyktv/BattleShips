import { create } from 'zustand';
import type { GameState } from './types.js';
import { getSessionStorage } from './session.js';

export const TAB_ID_STORAGE_KEY = 'battleships.tabId';
export const SERVER_RUNTIME_ID_STORAGE_KEY = 'battleships.runtimeId';

const removeTabIdentity = () => {
  getSessionStorage().removeItem(TAB_ID_STORAGE_KEY);
  getSessionStorage().removeItem(SERVER_RUNTIME_ID_STORAGE_KEY);
};

export const useGameStore = create<GameState>((set) => ({
  snapshot: null,
  name: '',
  connection: 'idle',
  recoveryNotice: null,
  commandError: null,
  pendingActionId: null,
  applySnapshot: (snapshot) =>
    set({
      snapshot,
      name:
        snapshot.kind === 'lobby' ? snapshot.player.name : snapshot.self.name,
      pendingActionId: null,
      recoveryNotice: null,
      commandError: null,
    }),
  setName: (name) => set({ name }),
  setConnection: (connection) => set({ connection }),
  setPendingAction: (pendingActionId) =>
    set({
      pendingActionId,
      ...(pendingActionId ? { commandError: null } : {}),
    }),
  setCommandError: (commandError) => set({ commandError }),
  runtimeReset: () => {
    removeTabIdentity();
    set({
      snapshot: null,
      name: '',
      pendingActionId: null,
      recoveryNotice: 'runtime-reset',
      commandError: null,
    });
  },
  sessionReplaced: () => {
    removeTabIdentity();
    set({
      snapshot: null,
      name: '',
      pendingActionId: null,
      recoveryNotice: 'session-replaced',
      commandError: null,
    });
  },
  reset: () =>
    set({
      snapshot: null,
      name: '',
      connection: 'idle',
      recoveryNotice: null,
      pendingActionId: null,
      commandError: null,
    }),
}));
