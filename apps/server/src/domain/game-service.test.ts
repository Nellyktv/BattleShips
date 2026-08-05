import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock.js';
import { GameService } from './game-service.js';
import { IdentityService } from './identity-service.js';
import { LobbyService } from './lobby-service.js';
import { NameService } from './name-service.js';
import { SequenceRng } from './rng.js';
import { StatsService } from './stats-service.js';
import { ManualScheduler } from './scheduler.js';

const setup = () => {
  const clock = new FakeClock();
  const stats = new StatsService();
  const identities = new IdentityService(
    new NameService(clock),
    stats,
    new SequenceRng([0.1, 0.2, 0.3]),
  );
  identities.connect('one', 'socket-one', 'Alpha');
  identities.connect('two', 'socket-two', 'Bravo');
  identities.connect('three', 'socket-three', 'Charlie');
  identities.connect('four', 'socket-four', 'Delta');
  const scheduler = new ManualScheduler(clock);
  const games = new GameService(
    identities,
    stats,
    clock,
    new SequenceRng([0]),
    scheduler,
  );
  return {
    clock,
    identities,
    games,
    stats,
    scheduler,
    lobby: new LobbyService(games, new SequenceRng([0])),
  };
};

const quickFleet = () => [
  { length: 4, cells: ['A1', 'A2', 'A3', 'A4'] },
  { length: 3, cells: ['C1', 'C2', 'C3'] },
  { length: 3, cells: ['E1', 'E2', 'E3'] },
  { length: 2, cells: ['G1', 'G2'] },
];

describe('runtime game services', () => {
  it('orders waiting oldest-first and active newest-first without leaking fleets', () => {
    const { games, lobby } = setup();
    const first = lobby.create('one', 'quick-8x8');
    lobby.create('two', 'classic-10x10');
    expect(lobby.waiting().map((game) => game.gameId)).toEqual([
      first.gameId,
      expect.any(String),
    ]);
    lobby.join('three', first.gameId);
    const snapshot = games.snapshot('one', first.gameId);
    expect(snapshot.opponent).not.toHaveProperty('fleet');
    expect(lobby.active()[0]?.gameId).toBe(first.gameId);
  });

  it('quick play joins any waiting preset and falls back to a Classic game', () => {
    const { lobby } = setup();
    const waiting = lobby.create('one', 'grand-12x12');
    const joined = lobby.quickPlay('two');
    expect(joined.gameId).toBe(waiting.gameId);
    lobby.leave('one');
    const fallback = lobby.quickPlay('one');
    expect(fallback.preset).toBe('classic-10x10');
  });

  it('rejects a second session and lets only the waiting host cancel', () => {
    const { lobby } = setup();
    lobby.create('one', 'quick-8x8');

    expect(() => lobby.create('one', 'classic-10x10')).toThrow(/session/);
    const joined = lobby.create('three', 'classic-10x10');
    lobby.join('two', joined.gameId);
    expect(() => lobby.cancel('two')).toThrow(/waiting host/);
    lobby.cancel('one');
    expect(lobby.waiting()).toEqual([]);
  });

  it('validates both fleets and starts battle with an injected first player', () => {
    const { games, lobby } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    const fleet = quickFleet();
    games.ready('one', session.gameId, fleet);
    expect(games.snapshot('one', session.gameId).phase).toBe('deployment');
    games.ready('two', session.gameId, fleet);
    expect(games.snapshot('one', session.gameId).phase).toBe('battle');
    expect(games.snapshot('one', session.gameId).turnPlayerId).toBe('one');
  });

  it('allows the host to ready before joining and validates deployment expiry', () => {
    const first = setup();
    const waiting = first.lobby.create('one', 'quick-8x8');
    first.games.ready('one', waiting.gameId, quickFleet());
    first.lobby.join('two', waiting.gameId);
    first.games.ready('two', waiting.gameId, quickFleet());
    expect(first.games.snapshot('one', waiting.gameId).phase).toBe('battle');

    const second = setup();
    const expiring = second.lobby.create('one', 'quick-8x8');
    second.lobby.join('two', expiring.gameId);
    second.games.disconnect('one');
    second.clock.advance(5 * 60_000);
    second.scheduler.runDue();
    expect(() => second.games.snapshot('two', expiring.gameId)).toThrow(
      /Unknown game/,
    );
  });

  it('waits for a disconnected ready player and starts after reconnect', () => {
    const { games, lobby } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.disconnect('one');
    games.ready('two', session.gameId, quickFleet());
    expect(games.snapshot('two', session.gameId).phase).toBe('deployment');
    games.reconnect('one');
    expect(games.snapshot('one', session.gameId).phase).toBe('battle');
  });

  it('abandons a paused battle when both players miss the reconnect grace period', () => {
    const { clock, games, lobby, scheduler } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.disconnect('one');
    games.disconnect('two');
    clock.advance(5 * 60_000);
    scheduler.runDue();
    expect(lobby.active()).toEqual([]);
    expect(() => games.snapshot('one', session.gameId)).toThrow(/Unknown game/);
  });

  it('rejects shots while paused and forfeits the absent player after grace', () => {
    const { clock, games, lobby, scheduler, stats, identities } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.ready('two', session.gameId, quickFleet());
    games.disconnect('two');
    expect(() => games.shot('one', session.gameId, 'A1')).toThrow(/paused/);
    expect(identities.get('two')?.status).toBe('busy');
    clock.advance(5 * 60_000);
    scheduler.runDue();
    expect(stats.get('one')).toEqual({ games: 1, wins: 1, losses: 0 });
    expect(stats.get('two')).toEqual({ games: 1, wins: 0, losses: 1 });
  });

  it('notifies change listeners when disconnect expiry forfeits a player', () => {
    const { clock, games, lobby, scheduler } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.ready('two', session.gameId, quickFleet());
    const changes: Array<{ lobbyChanged: boolean }> = [];
    games.subscribeChanges((change) => changes.push(change));

    games.disconnect('two');
    clock.advance(5 * 60_000);
    scheduler.runDue();

    expect(changes).toEqual([
      { affectedIdentityIds: ['one', 'two'], lobbyChanged: true },
      { affectedIdentityIds: ['one', 'two'], lobbyChanged: true },
    ]);
    expect(games.snapshot('one', session.gameId)).toMatchObject({
      phase: 'complete',
      completionReason: 'forfeit',
    });
  });

  it('publishes the earliest joined-player reconnect deadline and clears it after reconnect', () => {
    const { clock, games, lobby } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    clock.advance(1_000);
    games.disconnect('one');
    clock.advance(1_000);
    games.disconnect('two');

    expect(games.snapshot('one', session.gameId)).toMatchObject({
      reconnectDeadline: 5 * 60_000 + 1_000,
    });
    games.reconnect('one');
    games.reconnect('two');
    expect(games.snapshot('one', session.gameId)).toMatchObject({
      reconnectDeadline: null,
    });
  });

  it('labels intentional leave as a forfeit and final ship destruction as sunk', () => {
    const forfeit = setup();
    const forfeitGame = forfeit.lobby.create('one', 'quick-8x8');
    forfeit.lobby.join('two', forfeitGame.gameId);
    forfeit.games.ready('one', forfeitGame.gameId, quickFleet());
    forfeit.games.ready('two', forfeitGame.gameId, quickFleet());
    forfeit.games.leave('one');
    expect(forfeit.games.snapshot('two', forfeitGame.gameId)).toMatchObject({
      completionReason: 'forfeit',
    });

    const sunk = setup();
    const sunkGame = sunk.lobby.create('one', 'quick-8x8');
    sunk.lobby.join('two', sunkGame.gameId);
    sunk.games.ready('one', sunkGame.gameId, quickFleet());
    sunk.games.ready('two', sunkGame.gameId, quickFleet());
    for (const coordinate of [
      'A1',
      'A2',
      'A3',
      'A4',
      'C1',
      'C2',
      'C3',
      'E1',
      'E2',
      'E3',
      'G1',
      'G2',
    ] as const)
      sunk.games.shot('one', sunkGame.gameId, coordinate);
    expect(sunk.games.snapshot('one', sunkGame.gameId)).toMatchObject({
      completionReason: 'sunk',
    });
  });

  it('projects pending rematch status and expiry relative to each viewer', () => {
    const { clock, games, lobby } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.ready('two', session.gameId, quickFleet());
    games.leave('one');
    games.requestRematch('one');

    expect(games.snapshot('one', session.gameId)).toMatchObject({
      rematch: { status: 'requested-by-self', expiresAt: clock.now() + 60_000 },
    });
    expect(games.snapshot('two', session.gameId)).toMatchObject({
      rematch: {
        status: 'requested-by-opponent',
        expiresAt: clock.now() + 60_000,
      },
    });
    games.respondRematch('two', false);
    expect(games.snapshot('one', session.gameId)).toMatchObject({
      rematch: { status: 'idle' },
    });
  });

  it('retains the remaining disconnect expiry when the other player reconnects', () => {
    const { clock, games, lobby, scheduler, stats } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.ready('two', session.gameId, quickFleet());
    games.disconnect('two');
    clock.advance(4 * 60_000);
    games.reconnect('one');
    clock.advance(60_000);
    scheduler.runDue();

    expect(stats.get('one')).toEqual({ games: 1, wins: 1, losses: 0 });
  });

  it('records a deliberate battle leave once and keeps the private result hidden from lobby', () => {
    const { games, lobby, stats } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.ready('two', session.gameId, quickFleet());
    games.leave('one');
    games.leave('one');
    expect(stats.get('two')).toEqual({ games: 1, wins: 1, losses: 0 });
    expect(stats.get('one')).toEqual({ games: 1, wins: 0, losses: 1 });
    expect(lobby.active()).toEqual([]);
    expect(games.snapshot('two', session.gameId).phase).toBe('complete');
  });

  it('releases a result leaver for a new session while retaining the opponent result', () => {
    const { games, lobby, identities } = setup();
    const completed = lobby.create('one', 'quick-8x8');
    lobby.join('two', completed.gameId);
    games.ready('one', completed.gameId, quickFleet());
    games.ready('two', completed.gameId, quickFleet());
    games.leave('one');
    games.leave('one');

    const replacement = lobby.create('one', 'classic-10x10');
    expect(games.snapshot('two', completed.gameId).phase).toBe('complete');
    expect(replacement.gameId).not.toBe(completed.gameId);
    expect(identities.get('one')?.status).toBe('busy');
  });

  it('starts a fresh deployment for simultaneous rematch requests and expires a single request', () => {
    const { games, lobby, stats } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.ready('two', session.gameId, quickFleet());
    games.leave('one');
    games.requestRematch('two');
    games.requestRematch('one');
    const rematch = lobby.active()[0]!;
    expect(rematch.gameId).not.toBe(session.gameId);
    expect(games.snapshot('one', rematch.gameId)).toMatchObject({
      phase: 'deployment',
      previousGameId: session.gameId,
    });
    games.ready('one', rematch.gameId, quickFleet());
    games.ready('two', rematch.gameId, quickFleet());
    games.leave('one');
    expect(stats.get('one')).toEqual({ games: 2, wins: 0, losses: 2 });
    const second = setup();
    const next = second.lobby.create('one', 'quick-8x8');
    second.lobby.join('two', next.gameId);
    second.games.ready('one', next.gameId, quickFleet());
    second.games.ready('two', next.gameId, quickFleet());
    second.games.leave('one');
    second.games.requestRematch('two');
    second.clock.advance(60_000);
    second.scheduler.runDue();
    expect(() => second.games.respondRematch('one', true)).toThrow(/No active/);
  });

  it('notifies change listeners when a rematch request expires', () => {
    const { clock, games, lobby, scheduler } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.ready('two', session.gameId, quickFleet());
    games.leave('one');
    games.requestRematch('two');
    const changes: string[] = [];
    games.subscribeChanges(() => changes.push('changed'));

    clock.advance(60_000);
    scheduler.runDue();

    expect(changes).toEqual(['changed']);
    expect(games.snapshot('one', session.gameId)).toMatchObject({
      rematch: { status: 'idle' },
    });
  });

  it('expires a rematch at its original deadline after connection lifecycle invalidation', () => {
    const { clock, games, lobby, scheduler } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.ready('two', session.gameId, quickFleet());
    games.leave('one');
    games.requestRematch('two');
    const pendingSnapshot = games.snapshot('one', session.gameId);
    expect(pendingSnapshot.phase).toBe('complete');
    if (pendingSnapshot.phase !== 'complete')
      throw new Error('Expected result');
    expect(pendingSnapshot.rematch).toEqual({
      status: 'requested-by-opponent',
      expiresAt: 60_000,
    });

    clock.advance(10_000);
    games.disconnect('one');
    clock.advance(10_000);
    games.reconnect('one');
    const changes: string[] = [];
    games.subscribeChanges(() => changes.push('changed'));

    clock.advance(40_000);
    scheduler.runDue();

    expect(changes).toEqual(['changed']);
    expect(games.snapshot('one', session.gameId)).toMatchObject({
      rematch: { status: 'idle' },
    });
  });

  it('resets rematch ordering and requires fresh consent for the next round', () => {
    const { clock, games, lobby } = setup();
    const first = lobby.create('one', 'quick-8x8');
    lobby.join('two', first.gameId);
    games.ready('one', first.gameId, quickFleet());
    games.ready('two', first.gameId, quickFleet());
    games.leave('one');
    games.requestRematch('two');

    const other = lobby.create('three', 'quick-8x8');
    lobby.join('four', other.gameId);
    clock.advance(1_000);
    games.requestRematch('one');
    const rematch = lobby.active()[0]!;
    expect(rematch.gameId).not.toBe(other.gameId);

    games.ready('one', rematch.gameId, quickFleet());
    games.ready('two', rematch.gameId, quickFleet());
    games.leave('one');
    games.requestRematch('one');
    games.respondRematch('two', true);
    expect(lobby.active()[0]?.gameId).not.toBe(rematch.gameId);
  });

  it('does not let an old result-retention timer expire a newer rematch result', () => {
    const { clock, games, lobby, scheduler } = setup();
    const first = lobby.create('one', 'quick-8x8');
    lobby.join('two', first.gameId);
    games.ready('one', first.gameId, quickFleet());
    games.ready('two', first.gameId, quickFleet());
    games.leave('one');
    games.requestRematch('two');
    games.requestRematch('one');
    const rematch = lobby.active()[0]!;

    clock.advance(10 * 60_000);
    games.ready('one', rematch.gameId, quickFleet());
    games.ready('two', rematch.gameId, quickFleet());
    games.leave('one');
    clock.advance(20 * 60_000);
    scheduler.runDue();

    expect(games.snapshot('two', rematch.gameId).phase).toBe('complete');
  });

  it('preserves the original result-retention deadline through connection churn', () => {
    const { clock, games, lobby, scheduler, stats, identities } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.ready('two', session.gameId, quickFleet());
    games.leave('one');

    clock.advance(10 * 60_000);
    games.disconnect('one');
    clock.advance(10 * 60_000);
    games.reconnect('one');
    clock.advance(10 * 60_000);
    scheduler.runDue();

    expect(() => games.snapshot('one', session.gameId)).toThrow(/Unknown game/);
    expect(identities.get('one')?.status).toBe('idle');
    expect(identities.get('two')?.status).toBe('idle');
    expect(stats.get('one')).toEqual({ games: 1, wins: 0, losses: 1 });
    expect(stats.get('two')).toEqual({ games: 1, wins: 1, losses: 0 });

    const replacement = lobby.create('one', 'classic-10x10');
    lobby.join('two', replacement.gameId);
    games.ready('one', replacement.gameId, [
      { length: 5, cells: ['A1', 'A2', 'A3', 'A4', 'A5'] },
      { length: 4, cells: ['C1', 'C2', 'C3', 'C4'] },
      { length: 3, cells: ['E1', 'E2', 'E3'] },
      { length: 3, cells: ['G1', 'G2', 'G3'] },
      { length: 2, cells: ['I1', 'I2'] },
    ]);
    games.ready('two', replacement.gameId, [
      { length: 5, cells: ['A1', 'A2', 'A3', 'A4', 'A5'] },
      { length: 4, cells: ['C1', 'C2', 'C3', 'C4'] },
      { length: 3, cells: ['E1', 'E2', 'E3'] },
      { length: 3, cells: ['G1', 'G2', 'G3'] },
      { length: 2, cells: ['I1', 'I2'] },
    ]);
    games.leave('one');
    expect(stats.get('two')).toEqual({ games: 2, wins: 2, losses: 0 });
  });

  it('refreshes a rematch request without letting its old timeout delete it', () => {
    const { clock, games, lobby, scheduler } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.ready('two', session.gameId, quickFleet());
    games.leave('one');
    games.requestRematch('one');
    clock.advance(30_000);
    games.requestRematch('one');
    clock.advance(30_000);
    scheduler.runDue();

    expect(() => games.respondRematch('two', true)).not.toThrow();
  });

  it('can create a new rematch request after declining the previous one', () => {
    const { clock, games, lobby, scheduler } = setup();
    const session = lobby.create('one', 'quick-8x8');
    lobby.join('two', session.gameId);
    games.ready('one', session.gameId, quickFleet());
    games.ready('two', session.gameId, quickFleet());
    games.leave('one');
    games.requestRematch('one');
    clock.advance(30_000);
    games.respondRematch('two', false);
    games.requestRematch('one');
    clock.advance(30_000);
    scheduler.runDue();

    expect(() => games.respondRematch('two', true)).not.toThrow();
  });
});
