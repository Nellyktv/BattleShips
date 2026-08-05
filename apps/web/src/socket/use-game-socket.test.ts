// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../state/game-store.js';
import { getSessionStorage } from './client.js';

type Listener = (...args: unknown[]) => void;

const ownedSocket = vi.hoisted(() => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    emit: vi.fn(),
    on: vi.fn((event: string, listener: Listener) => {
      const eventListeners = listeners.get(event) ?? new Set<Listener>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    }),
    off: vi.fn((event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    listeners,
  };
});

vi.mock('socket.io-client', () => ({ io: vi.fn(() => ownedSocket) }));

import { useGameSocket } from './use-game-socket.js';

describe('useGameSocket', () => {
  beforeEach(() => {
    ownedSocket.emit.mockClear();
    ownedSocket.on.mockClear();
    ownedSocket.off.mockClear();
    ownedSocket.connect.mockClear();
    ownedSocket.disconnect.mockClear();
    ownedSocket.listeners.clear();
    getSessionStorage().removeItem('battleships.tabId');
    getSessionStorage().removeItem('battleships.runtimeId');
    useGameStore.getState().reset();
    useGameStore.getState().setName('Captain');
  });

  it('disposes its owned socket listeners and transport on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useGameSocket('ws://example.test'));
    ownedSocket.listeners.get('connect')?.forEach((listener) => listener());

    unmount();
    vi.advanceTimersByTime(5000);

    expect(ownedSocket.listeners.get('event')?.size).toBe(0);
    expect(ownedSocket.listeners.get('ack')?.size).toBe(0);
    expect(ownedSocket.listeners.get('connect')?.size).toBe(0);
    expect(ownedSocket.listeners.get('disconnect')?.size).toBe(0);
    expect(ownedSocket.listeners.get('connect_error')?.size).toBe(0);
    expect(ownedSocket.disconnect).toHaveBeenCalledOnce();
    expect(ownedSocket.emit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('reconnects a replaced session with a new tab identity ready for a new name', () => {
    renderHook(() => useGameSocket('ws://example.test'));
    ownedSocket.listeners.get('connect')?.forEach((listener) => listener());
    const originalTabId = (
      ownedSocket.emit.mock.calls[0]?.[1] as {
        command: { payload: { tabId: string } };
      }
    ).command.payload.tabId;

    ownedSocket.listeners
      .get('event')
      ?.forEach((listener) => listener({ type: 'session-replaced' }));
    expect(useGameStore.getState()).toMatchObject({
      name: '',
      recoveryNotice: 'session-replaced',
    });
    expect(ownedSocket.disconnect).toHaveBeenCalledOnce();
    expect(ownedSocket.connect).toHaveBeenCalledTimes(2);

    act(() => useGameStore.getState().setName('New Captain'));
    ownedSocket.listeners.get('connect')?.forEach((listener) => listener());

    const latestCommand = ownedSocket.emit.mock.calls.at(-1)?.[1] as {
      command: { type: string; payload: { name: string; tabId: string } };
    };
    expect(latestCommand.command).toMatchObject({
      type: 'identify',
      payload: { name: 'New Captain' },
    });
    expect(latestCommand.command.payload.tabId).not.toBe(originalTabId);
    expect(useGameStore.getState().connection).toBe('connected');
  });

  it('surfaces a rejected command through the store', () => {
    const { result } = renderHook(() => useGameSocket('ws://example.test'));

    act(() => {
      result.current.dispatch({ type: 'lobby.quick-play', payload: {} });
    });
    const actionId = ownedSocket.emit.mock.calls.at(-1)?.[1] as {
      command: { actionId: string };
    };

    act(() => {
      ownedSocket.listeners.get('ack')?.forEach((listener) =>
        listener({
          actionId: actionId.command.actionId,
          ok: false,
          error: { code: 'invalid-state', message: 'Already in a game' },
        }),
      );
    });

    expect(useGameStore.getState().commandError).toEqual({
      code: 'invalid-state',
      message: 'Already in a game',
    });
  });
});
