import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@battleships/contracts';
import {
  SocketAdapter,
  type SocketLike,
  type SocketServices,
} from './adapter.js';
import { GameServiceError } from '../domain/game-service.js';
import type { GameChange } from '../domain/game-service.js';

class FakeSocket implements SocketLike {
  readonly id: string;
  private readonly listeners = new Map<string, (payload: unknown) => void>();
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  disconnected = false;

  constructor(id: string) {
    this.id = id;
  }

  on(event: string, listener: (payload: unknown) => void): void {
    this.listeners.set(event, listener);
  }

  off(event: string, listener: (payload: unknown) => void): void {
    if (this.listeners.get(event) === listener) this.listeners.delete(event);
  }

  emit(event: string, payload: unknown): void {
    this.emitted.push({ event, payload });
  }

  disconnect(): void {
    this.disconnected = true;
  }

  receive(event: string, payload: unknown): void {
    this.listeners.get(event)?.(payload);
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

const lobbySnapshot = (playerId: string): Snapshot => ({
  kind: 'lobby',
  player: { playerId, name: 'Alice', stats: { games: 0, wins: 0, losses: 0 } },
  waitingGames: [],
  activeGames: [],
});

const gameSnapshot = (playerId: string): Snapshot => ({
  kind: 'game',
  gameId: 'game-1',
  preset: 'classic-10x10',
  phase: 'battle',
  self: { playerId, name: 'Alice', status: 'ready' },
  opponent: {
    playerId: 'opponent',
    name: 'Bob',
    status: 'ready',
    sunkShips: [],
  },
  turnPlayerId: playerId,
  reconnectDeadline: null,
  shots: [],
  opponentShots: [],
});

function services(
  options: {
    sessionIds?: ReadonlySet<string>;
    shotError?: Error;
    snapshotError?: Error;
    shotChange?: GameChange;
    rematchChange?: GameChange;
    createChange?: GameChange;
  } = {},
): SocketServices & {
  calls: string[];
  notifyGameChange(change: GameChange): void;
  unsubscribeCalls: number;
} {
  const calls: string[] = [];
  const sockets = new Map<string, { identityId: string; socketId: string }>();
  let gameChangeListener: ((change: GameChange) => void) | undefined;
  let unsubscribeCalls = 0;
  return {
    calls,
    notifyGameChange: (change) => gameChangeListener?.(change),
    get unsubscribeCalls() {
      return unsubscribeCalls;
    },
    identity: {
      connect: (tabId: string, socketId: string, name: string) => {
        calls.push(`connect:${tabId}:${socketId}:${name}`);
        const previous = [...sockets.values()].find(
          (value) => value.identityId === tabId,
        );
        sockets.set(socketId, { identityId: tabId, socketId });
        return {
          identity: {
            identityId: tabId,
            displayName: name,
            status: 'active',
            stats: { games: 0, wins: 0, losses: 0 },
            socketId,
          },
          ...(previous ? { replacedSocketId: previous.socketId } : {}),
        };
      },
      getBySocket: (socketId: string) => {
        const value = sockets.get(socketId);
        return value
          ? {
              identityId: value.identityId,
              displayName: 'Alice',
              status: 'active',
              stats: { games: 0, wins: 0, losses: 0 },
              socketId,
            }
          : undefined;
      },
      disconnect: (socketId: string) =>
        calls.push(`identity-disconnect:${socketId}`),
      rename: () => {
        throw new Error('unused');
      },
    },
    lobby: {
      snapshot: (identityId: string) => lobbySnapshot(identityId),
      create: () => {
        if (options.createChange) gameChangeListener?.(options.createChange);
        else throw new Error('unused');
      },
      join: () => {
        throw new Error('unused');
      },
      quickPlay: () => {
        throw new Error('unused');
      },
      cancel: () => {
        throw new Error('unused');
      },
      leave: () => {
        throw new Error('unused');
      },
    },
    games: {
      subscribeChanges: (listener: (change: GameChange) => void) => {
        gameChangeListener = listener;
        return () => {
          unsubscribeCalls += 1;
          if (gameChangeListener === listener) gameChangeListener = undefined;
        };
      },
      snapshot: (identityId: string) => {
        calls.push(`snapshot:${identityId}`);
        if (options.snapshotError) throw options.snapshotError;
        return options.sessionIds?.has(identityId)
          ? gameSnapshot(identityId)
          : lobbySnapshot(identityId);
      },
      hasSession: (identityId: string) =>
        options.sessionIds?.has(identityId) ?? false,
      reconnect: () => undefined,
      disconnect: (identityId: string) =>
        calls.push(`game-disconnect:${identityId}`),
      ready: () => undefined,
      shot: () => {
        if (options.shotError) throw options.shotError;
        if (options.shotChange) gameChangeListener?.(options.shotChange);
      },
      leave: () => undefined,
      requestRematch: () => {
        if (options.rematchChange) gameChangeListener?.(options.rematchChange);
      },
      respondRematch: () => undefined,
    },
  };
}

describe('SocketAdapter', () => {
  it('parses a command, dispatches it, and acknowledges a personalized snapshot', () => {
    const dependency = services();
    const socket = new FakeSocket('socket-1');
    const adapter = new SocketAdapter(dependency);
    adapter.attach(socket);

    socket.receive('command', {
      actionId: 'act_identify_1',
      type: 'identify',
      payload: {
        tabId: '00000000-0000-4000-8000-000000000001',
        name: 'Alice',
      },
    });
    socket.receive('command', {
      actionId: 'act_snapshot_1',
      type: 'lobby.snapshot',
      payload: {},
    });

    expect(
      socket.emitted.find(
        (entry) =>
          entry.event === 'ack' &&
          (entry.payload as { actionId?: string }).actionId ===
            'act_snapshot_1',
      ),
    ).toEqual({
      event: 'ack',
      payload: {
        actionId: 'act_snapshot_1',
        ok: true,
        snapshot: lobbySnapshot('00000000-0000-4000-8000-000000000001'),
      },
    });
    expect(dependency.calls).toContain(
      'connect:00000000-0000-4000-8000-000000000001:socket-1:Alice',
    );
  });

  it('rejects malformed and unauthorized commands with typed errors', () => {
    const adapter = new SocketAdapter(services());
    const socket = new FakeSocket('socket-1');
    adapter.attach(socket);

    socket.receive('command', {
      actionId: 'act_bad_1',
      type: 'game.snapshot',
      payload: 'bad',
    });
    expect(socket.emitted.at(-1)).toEqual({
      event: 'ack',
      payload: {
        actionId: 'act_bad_1',
        ok: false,
        error: { code: 'invalid-command', message: 'Invalid command' },
      },
    });

    socket.receive('command', {
      actionId: 'act_game_1',
      type: 'game.snapshot',
      payload: {},
    });
    expect(socket.emitted.at(-1)).toEqual({
      event: 'ack',
      payload: {
        actionId: 'act_game_1',
        ok: false,
        error: {
          code: 'not-identified',
          message: 'Identify before sending commands',
        },
      },
    });
  });

  it('notifies and retires the older socket when a tab identity is replaced', () => {
    const dependency = services();
    const first = new FakeSocket('socket-1');
    const second = new FakeSocket('socket-2');
    const adapter = new SocketAdapter(dependency);
    adapter.attach(first);
    adapter.attach(second);

    const identify = {
      actionId: 'act_identify_1',
      type: 'identify',
      payload: { tabId: '00000000-0000-4000-8000-000000000001', name: 'Alice' },
    };
    first.receive('command', identify);
    second.receive('command', { ...identify, actionId: 'act_identify_2' });

    expect(first.emitted).toContainEqual({
      event: 'event',
      payload: { type: 'session-replaced' },
    });
    expect(first.listenerCount()).toBe(0);
    expect(first.disconnected).toBe(true);
  });

  it.each(['active', 'deployment', 'result'])(
    'acks a reconnecting %s session with its game snapshot instead of a lobby snapshot',
    (sessionPhase) => {
      const tabId = `00000000-0000-4000-8000-00000000000${sessionPhase === 'active' ? '3' : sessionPhase === 'deployment' ? '4' : '5'}`;
      const dependency = services({ sessionIds: new Set([tabId]) });
      const first = new FakeSocket(`socket-${sessionPhase}-1`);
      const reconnect = new FakeSocket(`socket-${sessionPhase}-2`);
      const runtimeId = '00000000-0000-4000-8000-000000000010';
      const adapter = new SocketAdapter(dependency, runtimeId);
      adapter.attach(first);
      adapter.attach(reconnect);

      const identify = {
        actionId: 'act_identify_1',
        type: 'identify',
        payload: { tabId, name: 'Alice', runtimeId },
      };
      first.receive('command', identify);
      reconnect.receive('command', { ...identify, actionId: 'act_identify_2' });

      const ack = reconnect.emitted.find(
        (entry) =>
          entry.event === 'ack' &&
          (entry.payload as { actionId?: string }).actionId ===
            'act_identify_2',
      );
      expect(ack).toEqual({
        event: 'ack',
        payload: {
          actionId: 'act_identify_2',
          ok: true,
          snapshot: gameSnapshot(tabId),
          runtimeId,
        },
      });
    },
  );

  it('rejects a stale server incarnation before registering the tab identity', () => {
    const dependency = services();
    const socket = new FakeSocket('socket-1');
    const adapter = new SocketAdapter(
      dependency,
      '00000000-0000-4000-8000-000000000010',
    );
    adapter.attach(socket);

    socket.receive('command', {
      actionId: 'act_identify_1',
      type: 'identify',
      payload: {
        tabId: '00000000-0000-4000-8000-000000000001',
        name: 'Alice',
        runtimeId: '00000000-0000-4000-8000-000000000011',
      },
    });

    expect(dependency.calls).not.toContain(
      'connect:00000000-0000-4000-8000-000000000001:socket-1:Alice',
    );
    expect(socket.emitted.at(-1)).toEqual({
      event: 'ack',
      payload: {
        actionId: 'act_identify_1',
        ok: false,
        error: {
          code: 'runtime-reset',
          message: 'Server runtime changed',
        },
      },
    });
  });

  it('returns the lobby snapshot when a timed-out game action is recovered outside a game', () => {
    const dependency = services({
      snapshotError: new Error('Unknown game'),
    });
    const socket = new FakeSocket('socket-1');
    const adapter = new SocketAdapter(dependency);
    adapter.attach(socket);
    socket.receive('command', {
      actionId: 'act_identify_1',
      type: 'identify',
      payload: { tabId: '00000000-0000-4000-8000-000000000001', name: 'Alice' },
    });

    socket.receive('command', {
      actionId: 'act_snapshot_1',
      type: 'game.snapshot',
      payload: {},
    });

    expect(
      socket.emitted.find(
        (entry) =>
          entry.event === 'ack' &&
          (entry.payload as { actionId?: string }).actionId ===
            'act_snapshot_1',
      ),
    ).toEqual({
      event: 'ack',
      payload: {
        actionId: 'act_snapshot_1',
        ok: true,
        snapshot: lobbySnapshot('00000000-0000-4000-8000-000000000001'),
      },
    });
  });

  it('does not notify unrelated lobby sockets for a game disconnect without a lobby-visible change', () => {
    const dependency = services();
    const first = new FakeSocket('socket-1');
    const second = new FakeSocket('socket-2');
    const adapter = new SocketAdapter(dependency);
    adapter.attach(first);
    adapter.attach(second);

    first.receive('command', {
      actionId: 'act_identify_1',
      type: 'identify',
      payload: { tabId: '00000000-0000-4000-8000-000000000001', name: 'Alice' },
    });
    second.receive('command', {
      actionId: 'act_identify_2',
      type: 'identify',
      payload: {
        tabId: '00000000-0000-4000-8000-000000000002',
        name: 'Bob',
      },
    });
    const before = second.emitted.length;

    first.receive('disconnect', undefined);

    expect(dependency.calls).toContain(
      'game-disconnect:00000000-0000-4000-8000-000000000001',
    );
    expect(second.emitted.slice(before)).toEqual([]);
  });

  it('sends a timer outcome to affected players and idle lobby sockets only', () => {
    const dependency = services();
    const first = new FakeSocket('socket-1');
    const second = new FakeSocket('socket-2');
    const adapter = new SocketAdapter(dependency);
    adapter.attach(first);
    adapter.attach(second);

    first.receive('command', {
      actionId: 'act_identify_1',
      type: 'identify',
      payload: { tabId: '00000000-0000-4000-8000-000000000001', name: 'Alice' },
    });
    second.receive('command', {
      actionId: 'act_identify_2',
      type: 'identify',
      payload: { tabId: '00000000-0000-4000-8000-000000000002', name: 'Bob' },
    });
    const firstBefore = first.emitted.length;
    const secondBefore = second.emitted.length;

    dependency.notifyGameChange({
      affectedIdentityIds: ['00000000-0000-4000-8000-000000000001'],
      lobbyChanged: true,
    });

    expect(first.emitted.slice(firstBefore)).toEqual([
      {
        event: 'event',
        payload: {
          type: 'snapshot',
          snapshot: lobbySnapshot('00000000-0000-4000-8000-000000000001'),
        },
      },
    ]);
    expect(second.emitted.slice(secondBefore)).toEqual([
      {
        event: 'event',
        payload: {
          type: 'snapshot',
          snapshot: lobbySnapshot('00000000-0000-4000-8000-000000000002'),
        },
      },
    ]);

    adapter.dispose();
    expect(dependency.unsubscribeCalls).toBe(1);
  });

  it('sends exactly one applicable snapshot to rematch participants', () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';
    const lobbyId = '00000000-0000-4000-8000-000000000002';
    const dependency = services({
      sessionIds: new Set([sessionId]),
      rematchChange: { affectedIdentityIds: [sessionId], lobbyChanged: false },
    });
    const sessionSocket = new FakeSocket('socket-1');
    const lobbySocket = new FakeSocket('socket-2');
    const adapter = new SocketAdapter(dependency);
    adapter.attach(sessionSocket);
    adapter.attach(lobbySocket);

    sessionSocket.receive('command', {
      actionId: 'act_identify_1',
      type: 'identify',
      payload: { tabId: sessionId, name: 'Alice' },
    });
    lobbySocket.receive('command', {
      actionId: 'act_identify_2',
      type: 'identify',
      payload: { tabId: lobbyId, name: 'Bob' },
    });
    const sessionBefore = sessionSocket.emitted.length;
    const lobbyBefore = lobbySocket.emitted.length;

    sessionSocket.receive('command', {
      actionId: 'act_rematch_1',
      type: 'rematch.request',
      payload: {},
    });

    const sessionEvents = sessionSocket.emitted.slice(sessionBefore);
    expect(sessionEvents).toHaveLength(1);
    expect(sessionEvents[0]?.event).toBe('ack');
    expect(lobbySocket.emitted.slice(lobbyBefore)).toEqual([]);
  });

  it('maps the domain duplicate-shot error to the typed duplicate-shot ack error', () => {
    const adapter = new SocketAdapter(
      services({
        shotError: new GameServiceError(
          'duplicate-shot',
          'Coordinate already fired',
        ),
      }),
    );
    const socket = new FakeSocket('socket-1');
    adapter.attach(socket);
    socket.receive('command', {
      actionId: 'act_identify_1',
      type: 'identify',
      payload: { tabId: '00000000-0000-4000-8000-000000000001', name: 'Alice' },
    });
    socket.receive('command', {
      actionId: 'act_shot_1',
      type: 'game.shot',
      payload: { coordinate: 'A1' },
    });

    expect(socket.emitted).toContainEqual({
      event: 'ack',
      payload: {
        actionId: 'act_shot_1',
        ok: false,
        error: { code: 'duplicate-shot', message: 'Coordinate already fired' },
      },
    });
  });

  it('does not emit snapshots to other sockets for a read-only snapshot command', () => {
    const dependency = services();
    const first = new FakeSocket('socket-1');
    const second = new FakeSocket('socket-2');
    const adapter = new SocketAdapter(dependency);
    adapter.attach(first);
    adapter.attach(second);
    first.receive('command', {
      actionId: 'act_identify_1',
      type: 'identify',
      payload: { tabId: '00000000-0000-4000-8000-000000000001', name: 'Alice' },
    });
    second.receive('command', {
      actionId: 'act_identify_2',
      type: 'identify',
      payload: { tabId: '00000000-0000-4000-8000-000000000002', name: 'Bob' },
    });
    const before = second.emitted.length;

    first.receive('command', {
      actionId: 'act_snapshot_1',
      type: 'lobby.snapshot',
      payload: {},
    });

    expect(second.emitted).toHaveLength(before);
  });

  it('emits an ordinary shot only to the two players in its game', () => {
    const playerOne = '00000000-0000-4000-8000-000000000001';
    const playerTwo = '00000000-0000-4000-8000-000000000002';
    const otherGame = '00000000-0000-4000-8000-000000000003';
    const lobbyPlayer = '00000000-0000-4000-8000-000000000004';
    const dependency = services({
      sessionIds: new Set([playerOne, playerTwo, otherGame]),
      shotChange: {
        affectedIdentityIds: [playerOne, playerTwo],
        lobbyChanged: false,
      },
    });
    const sockets = [
      new FakeSocket('socket-1'),
      new FakeSocket('socket-2'),
      new FakeSocket('socket-3'),
      new FakeSocket('socket-4'),
    ];
    const adapter = new SocketAdapter(dependency);
    for (const socket of sockets) adapter.attach(socket);
    for (const [index, tabId] of [
      playerOne,
      playerTwo,
      otherGame,
      lobbyPlayer,
    ].entries())
      sockets[index]!.receive('command', {
        actionId: `act_identify_${index}`,
        type: 'identify',
        payload: { tabId, name: `Player ${index}` },
      });
    const before = sockets.map((socket) => socket.emitted.length);

    sockets[0]!.receive('command', {
      actionId: 'act_shot_1',
      type: 'game.shot',
      payload: { coordinate: 'A1' },
    });

    expect(sockets[0]!.emitted.slice(before[0])).toHaveLength(1);
    expect(sockets[1]!.emitted.slice(before[1])).toEqual([
      {
        event: 'event',
        payload: { type: 'snapshot', snapshot: gameSnapshot(playerTwo) },
      },
    ]);
    expect(sockets[2]!.emitted.slice(before[2])).toEqual([]);
    expect(sockets[3]!.emitted.slice(before[3])).toEqual([]);
  });

  it('emits a lobby mutation to idle lobby recipients but not players in another game', () => {
    const creator = '00000000-0000-4000-8000-000000000001';
    const lobbyPlayer = '00000000-0000-4000-8000-000000000002';
    const otherGame = '00000000-0000-4000-8000-000000000003';
    const dependency = services({
      sessionIds: new Set([creator, otherGame]),
      createChange: { affectedIdentityIds: [creator], lobbyChanged: true },
    });
    const sockets = [
      new FakeSocket('socket-1'),
      new FakeSocket('socket-2'),
      new FakeSocket('socket-3'),
    ];
    const adapter = new SocketAdapter(dependency);
    for (const socket of sockets) adapter.attach(socket);
    for (const [index, tabId] of [creator, lobbyPlayer, otherGame].entries())
      sockets[index]!.receive('command', {
        actionId: `act_identify_${index}`,
        type: 'identify',
        payload: { tabId, name: `Player ${index}` },
      });
    const before = sockets.map((socket) => socket.emitted.length);

    sockets[0]!.receive('command', {
      actionId: 'act_create_1',
      type: 'lobby.create',
      payload: { preset: 'quick-8x8' },
    });

    expect(sockets[0]!.emitted.slice(before[0])).toHaveLength(1);
    expect(sockets[1]!.emitted.slice(before[1])).toEqual([
      {
        event: 'event',
        payload: { type: 'snapshot', snapshot: lobbySnapshot(lobbyPlayer) },
      },
    ]);
    expect(sockets[2]!.emitted.slice(before[2])).toEqual([]);
  });
});
