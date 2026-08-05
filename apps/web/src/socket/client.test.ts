import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGameSocketGateway,
  getSessionStorage,
  SERVER_RUNTIME_ID_STORAGE_KEY,
} from './client.js';

type Listener = (...args: unknown[]) => void;

class FakeSocket {
  readonly emit = vi.fn();
  readonly listeners = new Map<string, Set<Listener>>();
  readonly connect = vi.fn(() => this.trigger('connect'));
  readonly disconnect = vi.fn(() =>
    this.trigger('disconnect', 'client disconnect'),
  );

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  trigger(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

beforeEach(() => {
  getSessionStorage().removeItem('battleships.tabId');
  getSessionStorage().removeItem(SERVER_RUNTIME_ID_STORAGE_KEY);
});

describe('game socket gateway', () => {
  it('emits a shared-contract identify command with a tab id', () => {
    const socket = new FakeSocket();
    const gateway = createGameSocketGateway(socket);

    expect(gateway.identify('Captain')).toBe(true);
    const [, message] = socket.emit.mock.calls[0] as [
      string,
      {
        command: {
          type: string;
          actionId: string;
          payload: { name: string; tabId: string };
        };
      },
    ];
    expect(message.command.type).toBe('identify');
    expect(message.command.actionId).toMatch(/^act_/);
    expect(message.command.payload.name).toBe('Captain');
    expect(message.command.payload.tabId).toBe(
      getSessionStorage().getItem('battleships.tabId'),
    );
  });

  it('does not emit an invalid command', () => {
    const socket = new FakeSocket();
    const gateway = createGameSocketGateway(socket);

    expect(
      gateway.send({
        actionId: 'bad',
        type: 'game.shot',
        payload: { coordinate: 'Z99' },
      }),
    ).toBe(false);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('dispatches a typed lobby command with a generated action id', () => {
    const socket = new FakeSocket();
    const gateway = createGameSocketGateway(socket);

    expect(
      gateway.dispatch({
        type: 'lobby.create',
        payload: { preset: 'classic-10x10' },
      }),
    ).toBe(true);

    const command = (
      socket.emit.mock.calls[0]?.[1] as {
        command: { actionId: string; type: string; payload: unknown };
      }
    ).command;
    expect(command.actionId).toMatch(/^act_[A-Za-z0-9_-]{3,64}$/);
    expect(command.type).toBe('lobby.create');
    expect(command.payload).toEqual({ preset: 'classic-10x10' });
  });

  it('recovers a timed-out command with an acknowledged authoritative snapshot', () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const onPending = vi.fn();
    const onTimeout = vi.fn();
    const gateway = createGameSocketGateway(socket, { onPending, onTimeout });

    gateway.identify('Captain');
    const emittedCommand = (
      socket.emit.mock.calls[0]?.[1] as {
        command: { actionId: string };
      }
    ).command;
    expect(socket.emit.mock.calls[0]).toHaveLength(2);
    expect(onPending).toHaveBeenCalledWith(emittedCommand.actionId);

    socket.trigger('ack', {
      actionId: 'act_stale',
      ok: false,
      error: { code: 'invalid-state', message: 'stale' },
    });
    vi.advanceTimersByTime(5000);

    expect(onTimeout).toHaveBeenCalledWith(emittedCommand.actionId);
    expect(socket.emit).toHaveBeenCalledTimes(2);
    expect(socket.emit.mock.calls[1]?.[1]).toMatchObject({
      command: { type: 'game.snapshot' },
    });
    const snapshotCommand = (
      socket.emit.mock.calls[1]?.[1] as { command: { actionId: string } }
    ).command;
    const onAck = vi.fn();
    gateway.listen({ onEvent: vi.fn(), onAck });
    socket.trigger('ack', {
      actionId: snapshotCommand.actionId,
      ok: true,
      snapshot: {
        kind: 'lobby',
        player: {
          playerId: 'p',
          name: 'Captain',
          stats: { games: 0, wins: 0, losses: 0 },
        },
        waitingGames: [],
        activeGames: [],
      },
    });
    expect(onAck).toHaveBeenCalledOnce();

    gateway.identify('Captain');
    const currentCommand = (
      socket.emit.mock.calls[2]?.[1] as {
        command: { actionId: string };
      }
    ).command;
    socket.trigger('ack', {
      actionId: currentCommand.actionId,
      ok: true,
      snapshot: {
        kind: 'lobby',
        player: {
          playerId: 'p',
          name: 'Captain',
          stats: { games: 0, wins: 0, losses: 0 },
        },
        waitingGames: [],
        activeGames: [],
      },
    });
    expect(onTimeout).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('times out when an emitted command receives no acknowledgement', () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const onTimeout = vi.fn();
    const gateway = createGameSocketGateway(socket, { onTimeout });

    gateway.identify('Captain');
    vi.advanceTimersByTime(5000);

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(socket.emit).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not retry a lost recovery snapshot request', () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const gateway = createGameSocketGateway(socket);

    gateway.identify('Captain');
    vi.advanceTimersByTime(5000);
    expect(socket.emit).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(5000);

    expect(socket.emit).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('ignores a late recovery snapshot after a newer command begins', () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const onAck = vi.fn();
    const gateway = createGameSocketGateway(socket);
    gateway.listen({ onEvent: vi.fn(), onAck });

    gateway.identify('Captain');
    vi.advanceTimersByTime(5000);
    const recoveryCommand = (
      socket.emit.mock.calls[1]?.[1] as { command: { actionId: string } }
    ).command;
    gateway.send({
      actionId: 'act_newer',
      type: 'lobby.snapshot',
      payload: {},
    });

    socket.trigger('ack', {
      actionId: recoveryCommand.actionId,
      ok: true,
      snapshot: {
        kind: 'lobby',
        player: {
          playerId: 'p',
          name: 'Stale Captain',
          stats: { games: 0, wins: 0, losses: 0 },
        },
        waitingGames: [],
        activeGames: [],
      },
    });

    expect(onAck).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('ignores a stale not-identified error from a prior action generation', () => {
    const socket = new FakeSocket();
    const onAck = vi.fn();
    const gateway = createGameSocketGateway(socket);
    gateway.listen({ onEvent: vi.fn(), onAck });
    gateway.identify('Captain');

    socket.trigger('ack', {
      actionId: 'act_stale',
      ok: false,
      error: { code: 'not-identified', message: 'identify again' },
    });

    expect(onAck).not.toHaveBeenCalled();
  });

  it('sends its stored server incarnation and resets instead of becoming a new identity after a restart', () => {
    const socket = new FakeSocket();
    const onRuntimeReset = vi.fn();
    const gateway = createGameSocketGateway(socket);
    gateway.listen({ onEvent: vi.fn(), onAck: vi.fn(), onRuntimeReset });

    gateway.identify('Captain');
    const firstIdentify = (
      socket.emit.mock.calls[0]?.[1] as {
        command: { actionId: string };
      }
    ).command;
    socket.trigger('ack', {
      actionId: firstIdentify.actionId,
      ok: true,
      runtimeId: '00000000-0000-4000-8000-000000000010',
      snapshot: {
        kind: 'lobby',
        player: {
          playerId: 'p',
          name: 'Captain',
          stats: { games: 0, wins: 0, losses: 0 },
        },
        waitingGames: [],
        activeGames: [],
      },
    });
    expect(getSessionStorage().getItem(SERVER_RUNTIME_ID_STORAGE_KEY)).toBe(
      '00000000-0000-4000-8000-000000000010',
    );

    gateway.identify('Captain');
    expect(socket.emit.mock.calls[1]?.[1]).toMatchObject({
      command: {
        payload: { runtimeId: '00000000-0000-4000-8000-000000000010' },
      },
    });
    socket.trigger('ack', {
      actionId: (
        socket.emit.mock.calls[1]?.[1] as { command: { actionId: string } }
      ).command.actionId,
      ok: false,
      error: { code: 'runtime-reset', message: 'Server runtime changed' },
    });

    expect(onRuntimeReset).toHaveBeenCalledOnce();
  });

  it('re-identifies after transport connect and reports real lifecycle states', () => {
    const socket = new FakeSocket();
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const onConnectError = vi.fn();
    const gateway = createGameSocketGateway(socket);
    const cleanup = gateway.listen({
      onEvent: vi.fn(),
      onAck: vi.fn(),
      getName: () => 'Captain',
      onConnect,
      onDisconnect,
      onConnectError,
    });

    expect(socket.emit).not.toHaveBeenCalled();
    socket.trigger('connect');
    expect(onConnect).toHaveBeenCalledOnce();
    expect(socket.emit.mock.calls[0]?.[1]).toMatchObject({
      command: { type: 'identify' },
    });
    socket.trigger('connect_error', new Error('offline'));
    socket.trigger('disconnect', 'transport close');
    expect(onConnectError).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledWith('transport close');
    cleanup();
  });

  it('removes every listener on dispose', () => {
    const socket = new FakeSocket();
    const gateway = createGameSocketGateway(socket);
    const cleanup = gateway.listen({ onEvent: vi.fn(), onAck: vi.fn() });

    expect(socket.listeners.get('event')?.size).toBe(1);
    expect(socket.listeners.get('ack')?.size).toBe(1);
    expect(socket.listeners.get('connect')?.size).toBe(1);
    expect(socket.listeners.get('disconnect')?.size).toBe(1);
    expect(socket.listeners.get('connect_error')?.size).toBe(1);
    cleanup();
    expect(socket.listeners.get('event')?.size).toBe(0);
    expect(socket.listeners.get('ack')?.size).toBe(0);
    expect(socket.listeners.get('connect')?.size).toBe(0);
    expect(socket.listeners.get('disconnect')?.size).toBe(0);
    expect(socket.listeners.get('connect_error')?.size).toBe(0);
  });

  it('exposes retry now without creating an unbounded reconnect loop', () => {
    const socket = new FakeSocket();
    const gateway = createGameSocketGateway(socket);

    gateway.retryNow();

    expect(socket.connect).toHaveBeenCalledOnce();
  });
});
