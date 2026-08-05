import { describe, expect, it } from 'vitest';
import {
  commandSchema,
  gameSnapshotSchema,
  identifyPayloadSchema,
  lobbySnapshotSchema,
  serverAckSchema,
} from './index.js';

describe('socket command contract', () => {
  it('rejects malformed or missing action IDs', () => {
    expect(() =>
      commandSchema.parse({ type: 'lobby.snapshot', payload: {} }),
    ).toThrow();
    expect(() =>
      commandSchema.parse({
        actionId: 'not-an-id',
        type: 'lobby.snapshot',
        payload: {},
      }),
    ).toThrow();
  });

  it('rejects a known command with the wrong payload', () => {
    expect(() =>
      commandSchema.parse({
        actionId: 'act_123',
        type: 'game.shot',
        payload: { x: 3 },
      }),
    ).toThrow();
  });

  it('rejects undeclared fields in command payloads', () => {
    expect(
      commandSchema.safeParse({
        actionId: 'act_123',
        type: 'game.shot',
        payload: { coordinate: 'A1', playerId: 'another-player' },
      }).success,
    ).toBe(false);
  });

  it('requires an opaque tab identity for identify and fleet coordinates use the shared coordinate contract', () => {
    expect(() =>
      identifyPayloadSchema.parse({ name: 'Ada', tabId: 'not-opaque' }),
    ).toThrow();
    expect(() =>
      commandSchema.parse({
        actionId: 'act_123',
        type: 'fleet.ready',
        payload: { ships: [{ length: 2, cells: ['Z99', 'A1'] }] },
      }),
    ).toThrow();
  });

  it('accepts only a strict optional previous server runtime on identify', () => {
    expect(
      identifyPayloadSchema.safeParse({
        name: 'Ada',
        tabId: '00000000-0000-4000-8000-000000000001',
        runtimeId: '00000000-0000-4000-8000-000000000002',
      }).success,
    ).toBe(true);
    expect(
      identifyPayloadSchema.safeParse({
        name: 'Ada',
        tabId: '00000000-0000-4000-8000-000000000001',
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it('rejects fleet-ready ships whose coordinate count differs from their length', () => {
    expect(() =>
      commandSchema.parse({
        actionId: 'act_123',
        type: 'fleet.ready',
        payload: { ships: [{ length: 3, cells: ['A1', 'A2'] }] },
      }),
    ).toThrow();
  });

  it('rejects pre-populated hit data in a fleet-ready command', () => {
    expect(() =>
      commandSchema.parse({
        actionId: 'act_123',
        type: 'fleet.ready',
        payload: {
          ships: [{ length: 2, cells: ['A1', 'A2'], hits: ['A1'] }],
        },
      }),
    ).toThrow();
  });

  it('rejects an empty fleet-ready command', () => {
    expect(() =>
      commandSchema.parse({
        actionId: 'act_123',
        type: 'fleet.ready',
        payload: { ships: [] },
      }),
    ).toThrow();
  });
});

describe('public snapshot contract', () => {
  it.each(['waiting', 'deployment', 'battle', 'paused'] as const)(
    'rejects opponent fleet data during %s',
    (phase) => {
      const result = gameSnapshotSchema.safeParse({
        gameId: 'game-1',
        preset: 'classic-10x10',
        phase,
        self: { playerId: 'p1', name: 'Ada', status: 'ready' },
        opponent: {
          playerId: 'p2',
          name: 'Bea',
          status: 'ready',
          fleet: [{ length: 5 }],
        },
        turnPlayerId: 'p1',
        shots: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({
            code: 'unrecognized_keys',
            path: ['opponent'],
          }),
        );
      }
    },
  );

  it('requires and accepts the opponent fleet in a complete snapshot for end reveal', () => {
    expect(() =>
      gameSnapshotSchema.parse({
        gameId: 'game-1',
        preset: 'classic-10x10',
        phase: 'complete',
        self: {
          playerId: 'p1',
          name: 'Ada',
          status: 'ready',
          fleet: [{ length: 5, cells: ['A1', 'A2', 'A3', 'A4', 'A5'] }],
        },
        opponent: { playerId: 'p2', name: 'Bea', status: 'ready' },
        turnPlayerId: null,
        shots: [],
      }),
    ).toThrow();

    const snapshot = gameSnapshotSchema.parse({
      gameId: 'game-1',
      preset: 'classic-10x10',
      phase: 'complete',
      self: {
        playerId: 'p1',
        name: 'Ada',
        status: 'ready',
        fleet: [{ length: 5, cells: ['A1', 'A2', 'A3', 'A4', 'A5'] }],
      },
      opponent: {
        playerId: 'p2',
        name: 'Bea',
        status: 'ready',
        fleet: [{ length: 5, cells: ['B1', 'B2', 'B3', 'B4', 'B5'] }],
      },
      turnPlayerId: null,
      reconnectDeadline: null,
      shots: [],
      winnerPlayerId: 'p1',
      completionReason: 'sunk',
      rematch: { status: 'idle' },
    });

    if (snapshot.phase === 'complete') {
      expect(snapshot.opponent.fleet).toEqual([
        { length: 5, cells: ['B1', 'B2', 'B3', 'B4', 'B5'] },
      ]);
    }
  });

  it('requires both fleets in a complete snapshot', () => {
    const withoutSelfFleet = gameSnapshotSchema.safeParse({
      gameId: 'game-1',
      preset: 'classic-10x10',
      phase: 'complete',
      self: { playerId: 'p1', name: 'Ada', status: 'ready' },
      opponent: {
        playerId: 'p2',
        name: 'Bea',
        status: 'ready',
        fleet: [{ length: 5, cells: ['B1', 'B2', 'B3', 'B4', 'B5'] }],
      },
      turnPlayerId: null,
      shots: [],
    });
    const withoutOpponentFleet = gameSnapshotSchema.safeParse({
      gameId: 'game-1',
      preset: 'classic-10x10',
      phase: 'complete',
      self: {
        playerId: 'p1',
        name: 'Ada',
        status: 'ready',
        fleet: [{ length: 5, cells: ['A1', 'A2', 'A3', 'A4', 'A5'] }],
      },
      opponent: { playerId: 'p2', name: 'Bea', status: 'ready' },
      turnPlayerId: null,
      shots: [],
    });

    expect(withoutSelfFleet.success).toBe(false);
    expect(withoutOpponentFleet.success).toBe(false);
  });

  it('accepts a strict optional predecessor only on an authoritative rematch snapshot', () => {
    const rematch = gameSnapshotSchema.safeParse({
      gameId: 'game-2',
      previousGameId: 'game-1',
      preset: 'classic-10x10',
      phase: 'deployment',
      self: { playerId: 'p1', name: 'Ada', status: 'placing' },
      opponent: { playerId: 'p2', name: 'Bea', status: 'placing' },
      turnPlayerId: null,
      reconnectDeadline: null,
      shots: [],
    });

    expect(rematch.success).toBe(true);
    expect(
      gameSnapshotSchema.safeParse({
        gameId: 'game-2',
        previousGameId: 1,
        preset: 'classic-10x10',
        phase: 'deployment',
        self: { playerId: 'p1', name: 'Ada', status: 'placing' },
        opponent: { playerId: 'p2', name: 'Bea', status: 'placing' },
        turnPlayerId: null,
        reconnectDeadline: null,
        shots: [],
      }).success,
    ).toBe(false);
  });

  it('requires a completion reason and per-viewer idle rematch state for a complete snapshot', () => {
    const result = gameSnapshotSchema.safeParse({
      gameId: 'game-1',
      preset: 'classic-10x10',
      phase: 'complete',
      self: {
        playerId: 'p1',
        name: 'Ada',
        status: 'ready',
        fleet: [{ length: 5, cells: ['A1', 'A2', 'A3', 'A4', 'A5'] }],
      },
      opponent: {
        playerId: 'p2',
        name: 'Bea',
        status: 'ready',
        fleet: [{ length: 5, cells: ['B1', 'B2', 'B3', 'B4', 'B5'] }],
      },
      turnPlayerId: null,
      reconnectDeadline: null,
      shots: [],
      winnerPlayerId: 'p1',
    });

    expect(result.success).toBe(false);
  });

  it('requires cells for every revealed ship', () => {
    const result = gameSnapshotSchema.safeParse({
      gameId: 'game-1',
      preset: 'classic-10x10',
      phase: 'complete',
      self: {
        playerId: 'p1',
        name: 'Ada',
        status: 'ready',
        fleet: [{ length: 5 }],
      },
      opponent: {
        playerId: 'p2',
        name: 'Bea',
        status: 'ready',
        fleet: [{ length: 5 }],
      },
      turnPlayerId: null,
      shots: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a complete reveal when a ship has the wrong number of cells', () => {
    const result = gameSnapshotSchema.safeParse({
      gameId: 'game-1',
      preset: 'classic-10x10',
      phase: 'complete',
      self: {
        playerId: 'p1',
        name: 'Ada',
        status: 'ready',
        fleet: [{ length: 5, cells: ['A1', 'A2', 'A3', 'A4', 'A5'] }],
      },
      opponent: {
        playerId: 'p2',
        name: 'Bea',
        status: 'ready',
        fleet: [{ length: 5, cells: ['B1', 'B2', 'B3', 'B4'] }],
      },
      turnPlayerId: null,
      shots: [],
    });

    expect(result.success).toBe(false);
  });

  it('publishes paused active sessions without exposing board data', () => {
    expect(
      lobbySnapshotSchema.parse({
        kind: 'lobby',
        player: {
          playerId: 'p1',
          name: 'Ada',
          stats: { games: 0, wins: 0, losses: 0 },
        },
        waitingGames: [],
        activeGames: [
          {
            gameId: 'game-1',
            players: ['Ada', 'Bea'],
            preset: 'classic-10x10',
            phase: 'paused',
          },
        ],
      }).activeGames[0]?.phase,
    ).toBe('paused');
  });
});

describe('command acknowledgements', () => {
  it('requires an authoritative snapshot when a command is accepted', () => {
    expect(() =>
      serverAckSchema.parse({ actionId: 'act_123', ok: true }),
    ).toThrow();
  });

  it('accepts only declared error codes for rejected commands', () => {
    expect(() =>
      serverAckSchema.parse({
        actionId: 'act_123',
        ok: false,
        error: { code: 'made-up-error', message: 'nope' },
      }),
    ).toThrow();
  });
});
