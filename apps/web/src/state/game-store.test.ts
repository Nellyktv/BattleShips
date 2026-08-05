import { beforeEach, describe, expect, it } from 'vitest';
import { SERVER_RUNTIME_ID_STORAGE_KEY, useGameStore } from './game-store.js';
import { getSessionStorage } from '../socket/client.js';
import type { LobbySnapshot } from '@battleships/contracts';

const lobbySnapshot: LobbySnapshot = {
  kind: 'lobby',
  player: {
    playerId: 'player-1',
    name: 'Captain',
    stats: { games: 1, wins: 1, losses: 0 },
  },
  waitingGames: [],
  activeGames: [],
};

beforeEach(() => {
  getSessionStorage().removeItem('battleships.tabId');
  getSessionStorage().removeItem(SERVER_RUNTIME_ID_STORAGE_KEY);
  useGameStore.getState().reset();
});

describe('game store', () => {
  it('replaces the complete client view when a full snapshot arrives', () => {
    useGameStore.getState().applySnapshot(lobbySnapshot);
    useGameStore.getState().setPendingAction('act_old');

    useGameStore.getState().applySnapshot({
      ...lobbySnapshot,
      player: { ...lobbySnapshot.player, name: 'New name' },
    });

    const snapshot = useGameStore.getState().snapshot;
    expect(snapshot?.kind === 'lobby' ? snapshot.player.name : undefined).toBe(
      'New name',
    );
    expect(useGameStore.getState().pendingActionId).toBeNull();
  });

  it('clears runtime identity while preserving an actionable transport and notice', () => {
    getSessionStorage().setItem('battleships.tabId', 'tab-id');
    getSessionStorage().setItem(SERVER_RUNTIME_ID_STORAGE_KEY, 'runtime-id');
    useGameStore.getState().applySnapshot(lobbySnapshot);
    useGameStore.getState().setConnection('connected');

    useGameStore.getState().runtimeReset();

    expect(useGameStore.getState().snapshot).toBeNull();
    expect(useGameStore.getState().name).toBe('');
    expect(getSessionStorage().getItem('battleships.tabId')).toBeNull();
    expect(
      getSessionStorage().getItem(SERVER_RUNTIME_ID_STORAGE_KEY),
    ).toBeNull();
    expect(useGameStore.getState().connection).toBe('connected');
    expect(useGameStore.getState().recoveryNotice).toBe('runtime-reset');
  });

  it('returns to an unassigned state with a replacement notice', () => {
    useGameStore.getState().applySnapshot(lobbySnapshot);
    useGameStore.getState().sessionReplaced();

    expect(useGameStore.getState().snapshot).toBeNull();
    expect(useGameStore.getState().name).toBe('');
    expect(useGameStore.getState().connection).toBe('idle');
    expect(useGameStore.getState().recoveryNotice).toBe('session-replaced');
  });

  it('clears the recovery notice after an authoritative snapshot', () => {
    useGameStore.getState().runtimeReset();

    useGameStore.getState().applySnapshot(lobbySnapshot);

    expect(useGameStore.getState().recoveryNotice).toBeNull();
  });

  it('clears a command error when a new command is pending or a snapshot succeeds', () => {
    useGameStore.getState().setCommandError({
      code: 'invalid-state',
      message: 'Game is already full',
    });

    useGameStore.getState().setPendingAction('act_new');
    expect(useGameStore.getState().commandError).toBeNull();

    useGameStore.getState().setCommandError({
      code: 'invalid-state',
      message: 'Game is already full',
    });
    useGameStore.getState().applySnapshot(lobbySnapshot);
    expect(useGameStore.getState().commandError).toBeNull();
  });
});
