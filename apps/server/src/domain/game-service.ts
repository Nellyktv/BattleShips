import type {
  Coordinate,
  ErrorCode,
  PlacementShip,
  Preset,
  GameSnapshot,
  LobbySnapshot,
} from '@battleships/contracts';
import {
  createBattle,
  fireShot,
  isCompleteFleet,
  projectBattle,
  type PlacementFleet,
  type PrivateBattleState,
} from '@battleships/game-engine';
import type { Clock } from './clock.js';
import { MathRng, type Rng } from './rng.js';
import { StatsService } from './stats-service.js';
import type { IdentityService } from './identity-service.js';
import { TimeoutScheduler, type Scheduler } from './scheduler.js';

const FIVE_MINUTES = 5 * 60_000;
const RESULT_RETENTION = 30 * 60_000;
const REMATCH_TIMEOUT = 60_000;

export class GameServiceError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Player = {
  id: string;
  name: string;
  connected: boolean;
  fleet?: PlacementFleet;
  ready: boolean;
  disconnectedAt?: number;
  left: boolean;
};

export interface SessionSummary {
  readonly gameId: string;
  readonly preset: Preset;
  readonly hostName: string;
  readonly players: readonly [string, string?];
  readonly phase: 'waiting' | 'placing' | 'battle' | 'paused' | 'complete';
}

export interface GameChange {
  readonly affectedIdentityIds: readonly string[];
  readonly lobbyChanged: boolean;
}

type Session = {
  id: string;
  preset: Preset;
  createdAt: number;
  startedAt?: number;
  players: Player[];
  battle?: PrivateBattleState;
  winnerId?: string;
  completionReason?: 'sunk' | 'forfeit';
  resultAt?: number;
  rematch?: { requestedBy: string; expiresAt: number };
  previousGameId?: string;
  generation: number;
  timers: Set<() => void>;
  rematchTimer?: () => void;
};

export class GameService {
  private readonly sessions = new Map<string, Session>();
  private readonly sessionByIdentity = new Map<string, string>();
  private readonly changeListeners = new Set<(change: GameChange) => void>();
  private sequence = 0;

  constructor(
    private readonly identities: IdentityService,
    private readonly stats: StatsService,
    private readonly clock: Clock,
    private readonly rng: Rng = new MathRng(),
    private readonly scheduler: Scheduler = new TimeoutScheduler(),
  ) {}

  subscribeChanges(listener: (change: GameChange) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  create(identityId: string, preset: Preset): SessionSummary {
    this.assertFree(identityId);
    const identity = this.requireIdentity(identityId);
    const session: Session = {
      id: `game-${++this.sequence}`,
      preset,
      createdAt: this.clock.now(),
      players: [this.player(identityId, identity.displayName)],
      generation: 0,
      timers: new Set(),
    };
    this.sessions.set(session.id, session);
    this.sessionByIdentity.set(identityId, session.id);
    this.identities.setBusy(identityId);
    this.scheduleDisconnectExpiry(session);
    this.notifyChanges(this.changeFor(session, true));
    return this.summary(session);
  }

  join(identityId: string, gameId: string): SessionSummary {
    this.assertFree(identityId);
    const session = this.requireSession(gameId);
    if (session.players.length !== 1 || session.players[0]!.left)
      throw new Error('Game is not waiting');
    const identity = this.requireIdentity(identityId);
    session.players.push(this.player(identityId, identity.displayName));
    session.startedAt = this.clock.now();
    this.sessionByIdentity.set(identityId, gameId);
    this.identities.setBusy(identityId);
    this.invalidate(session);
    this.notifyChanges(this.changeFor(session, true));
    return this.summary(session);
  }

  cancel(identityId: string): void {
    const session = this.sessionFor(identityId);
    if (session.players[0]?.id !== identityId || session.players.length !== 1)
      throw new Error('Only a waiting host can cancel');
    const change = this.changeFor(session, true);
    this.destroy(session);
    this.notifyChanges(change);
  }

  leave(identityId: string): void {
    const session = this.sessionFor(identityId);
    if (!session.battle) {
      const change = this.changeFor(session, true);
      this.destroy(session);
      this.notifyChanges(change);
      return;
    }
    if (session.battle.phase === 'complete') {
      this.releaseResultPlayer(session, identityId);
      this.notifyChanges(this.changeFor(session, false));
      return;
    }
    const opponent = session.players.find(
      (player) => player.id !== identityId,
    )!;
    this.finish(session, opponent.id, 'forfeit');
    this.notifyChanges(this.changeFor(session, true));
  }

  disconnect(identityId: string): void {
    const session = this.sessions.get(
      this.sessionByIdentity.get(identityId) ?? '',
    );
    if (!session) return;
    const player = this.playerFor(session, identityId);
    player.connected = false;
    player.disconnectedAt = this.clock.now();
    this.identities.setBusy(identityId);
    this.invalidate(session, true);
    if (!session.battle && session.players.length === 1) {
      const change = this.changeFor(session, true);
      this.destroy(session);
      this.notifyChanges(change);
      return;
    }
    this.scheduleDisconnectExpiry(session);
    this.notifyChanges(this.changeFor(session, this.isLobbyVisible(session)));
  }

  reconnect(identityId: string): void {
    const session = this.sessions.get(
      this.sessionByIdentity.get(identityId) ?? '',
    );
    if (!session) return;
    const player = this.playerFor(session, identityId);
    this.invalidate(session, true);
    player.connected = true;
    delete player.disconnectedAt;
    this.identities.setBusy(identityId);
    this.maybeStartBattle(session);
    this.scheduleDisconnectExpiry(session);
    this.notifyChanges(this.changeFor(session, this.isLobbyVisible(session)));
  }

  ready(identityId: string, fleet: readonly PlacementShip[]): void;
  ready(
    identityId: string,
    gameId: string,
    fleet: readonly PlacementShip[],
  ): void;
  ready(
    identityId: string,
    gameIdOrFleet: string | readonly PlacementShip[],
    maybeFleet?: readonly PlacementShip[],
  ): void {
    const gameId =
      typeof gameIdOrFleet === 'string' ? gameIdOrFleet : undefined;
    const fleet =
      typeof gameIdOrFleet === 'string' ? maybeFleet! : gameIdOrFleet;
    const session =
      gameId === undefined
        ? this.sessionFor(identityId)
        : this.requireSession(gameId);
    const player = this.playerFor(session, identityId);
    if (player.ready) throw new Error('Deployment is locked');
    if (!isCompleteFleet(session.preset, fleet))
      throw new Error('Invalid fleet');
    player.fleet = fleet.map((ship) => ({ ...ship, cells: [...ship.cells] }));
    player.ready = true;
    const wasInBattle = session.battle !== undefined;
    this.maybeStartBattle(session);
    this.notifyChanges(
      this.changeFor(session, !wasInBattle && session.battle !== undefined),
    );
  }

  private maybeStartBattle(session: Session): void {
    if (
      !session.battle &&
      session.players.length === 2 &&
      session.players.every(
        (candidate) => candidate.ready && candidate.connected,
      )
    ) {
      const [first, second] = session.players;
      const startingPlayerId = this.rng.next() < 0.5 ? first!.id : second!.id;
      session.battle = createBattle({
        preset: session.preset,
        players: [
          { playerId: first!.id, name: first!.name, fleet: first!.fleet! },
          { playerId: second!.id, name: second!.name, fleet: second!.fleet! },
        ],
        startingPlayerId,
      });
      session.startedAt = this.clock.now();
    }
  }

  shot(identityId: string, coordinate: Coordinate): void;
  shot(identityId: string, gameId: string, coordinate: Coordinate): void;
  shot(
    identityId: string,
    gameIdOrCoordinate: string,
    maybeCoordinate?: Coordinate,
  ): void {
    const gameId =
      maybeCoordinate === undefined ? undefined : gameIdOrCoordinate;
    const coordinate = maybeCoordinate ?? gameIdOrCoordinate;
    const session =
      gameId === undefined
        ? this.sessionFor(identityId)
        : this.requireSession(gameId);
    if (!session.battle || session.battle.phase !== 'battle')
      throw new Error('Battle is not active');
    if (session.players.some((player) => !player.connected))
      throw new Error('Battle is paused');
    const transition = fireShot(session.battle, identityId, coordinate);
    if (!transition.accepted) {
      const code = {
        complete: 'invalid-state',
        duplicate: 'duplicate-shot',
        'out-of-bounds': 'invalid-state',
        'out-of-turn': 'not-your-turn',
        'unknown-player': 'not-authorized',
      }[transition.reason] as ErrorCode;
      throw new GameServiceError(code, `Shot rejected: ${transition.reason}`);
    }
    session.battle = transition.state;
    const completed = transition.state.phase === 'complete';
    if (completed)
      this.finish(session, transition.state.winnerPlayerId!, 'sunk');
    this.notifyChanges(this.changeFor(session, completed));
  }

  requestRematch(identityId: string): void {
    const session = this.sessionFor(identityId);
    if (!session.battle || session.battle.phase !== 'complete')
      throw new Error('Game is not complete');
    const existing = session.rematch;
    if (
      existing &&
      existing.requestedBy !== identityId &&
      existing.expiresAt > this.clock.now()
    ) {
      this.startRematch(session);
      this.notifyChanges(this.changeFor(session, true));
      return;
    }
    session.rematch = {
      requestedBy: identityId,
      expiresAt: this.clock.now() + REMATCH_TIMEOUT,
    };
    this.scheduleRematchExpiry(session);
    this.notifyChanges(this.changeFor(session, false));
  }

  respondRematch(identityId: string, accept: boolean): void {
    const session = this.sessionFor(identityId);
    const request = session.rematch;
    if (
      !request ||
      request.requestedBy === identityId ||
      request.expiresAt <= this.clock.now()
    )
      throw new Error('No active rematch request');
    this.clearRematchTimer(session);
    session.rematch = undefined;
    if (accept) this.startRematch(session);
    this.notifyChanges(this.changeFor(session, accept));
  }

  waiting(): SessionSummary[] {
    return [...this.sessions.values()]
      .filter((session) => session.players.length === 1 && !session.battle)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((session) => this.summary(session));
  }

  active(): SessionSummary[] {
    return [...this.sessions.values()]
      .filter(
        (session) =>
          session.players.length === 2 && session.battle?.phase !== 'complete',
      )
      .sort(
        (a, b) =>
          (b.startedAt ?? 0) - (a.startedAt ?? 0) ||
          Number(b.id.slice(5)) - Number(a.id.slice(5)),
      )
      .map((session) => this.summary(session));
  }

  lobbySnapshot(identityId: string): LobbySnapshot {
    const identity = this.requireIdentity(identityId);
    return {
      kind: 'lobby',
      player: {
        playerId: identity.identityId,
        name: identity.displayName,
        stats: this.stats.get(identityId),
      },
      waitingGames: this.waiting().map((game) => ({
        gameId: game.gameId,
        hostName: game.hostName,
        preset: game.preset,
      })),
      activeGames: this.active().map((game) => ({
        gameId: game.gameId,
        players: [game.players[0], game.players[1]!],
        preset: game.preset,
        phase:
          game.phase === 'placing'
            ? 'placing'
            : game.phase === 'paused'
              ? 'paused'
              : 'battle',
      })),
    };
  }

  snapshot(identityId: string, gameId?: string): GameSnapshot {
    const session = gameId
      ? this.requireSession(gameId)
      : this.sessionFor(identityId);
    const self = this.playerFor(session, identityId);
    const opponent = session.players.find((player) => player.id !== identityId);
    const phase =
      session.battle?.phase === 'complete'
        ? 'complete'
        : session.battle
          ? session.players.some((player) => !player.connected)
            ? 'paused'
            : 'battle'
          : session.players.length === 1
            ? 'waiting'
            : 'deployment';
    if (session.battle) {
      const projected = projectBattle(session.battle, identityId);
      return {
        kind: 'game',
        gameId: session.id,
        ...(session.previousGameId
          ? { previousGameId: session.previousGameId }
          : {}),
        preset: session.preset,
        phase,
        self: {
          playerId: self.id,
          name: self.name,
          status: this.status(self),
          fleet: projected.self.fleet,
          stats: this.stats.get(self.id),
        },
        opponent: {
          playerId: opponent!.id,
          name: opponent!.name,
          status: this.status(opponent!),
          ...(phase === 'complete'
            ? { fleet: projected.opponent.fleet }
            : phase === 'battle' || phase === 'paused'
              ? { sunkShips: projected.opponent.sunkShips }
              : {}),
        },
        turnPlayerId: phase === 'paused' ? null : projected.turnPlayerId,
        reconnectDeadline: this.reconnectDeadline(session, phase),
        shots: projected.shots.map(({ coordinate, result }) => ({
          coordinate,
          result,
        })),
        opponentShots: projected.opponentShots.map(
          ({ coordinate, result }) => ({ coordinate, result }),
        ),
        ...(phase === 'complete'
          ? {
              winnerPlayerId: session.winnerId ?? null,
              completionReason: session.completionReason!,
              rematch: this.rematchProjection(session, identityId),
            }
          : {}),
      } as GameSnapshot;
    }
    return {
      kind: 'game',
      gameId: session.id,
      ...(session.previousGameId
        ? { previousGameId: session.previousGameId }
        : {}),
      preset: session.preset,
      phase,
      self: {
        playerId: self.id,
        name: self.name,
        status: this.status(self),
        ...(self.fleet ? { fleet: self.fleet } : {}),
        stats: this.stats.get(self.id),
      },
      opponent: opponent
        ? {
            playerId: opponent.id,
            name: opponent.name,
            status: this.status(opponent),
          }
        : { playerId: '', name: '', status: 'disconnected' },
      turnPlayerId: null,
      reconnectDeadline: this.reconnectDeadline(session, phase),
      shots: [],
    } as GameSnapshot;
  }

  hasSession(identityId: string): boolean {
    return this.sessionByIdentity.has(identityId);
  }

  sweep(gameId: string): boolean {
    const session = this.sessions.get(gameId);
    if (!session) return false;
    if (
      session.battle?.phase === 'complete' &&
      session.resultAt! + RESULT_RETENTION <= this.clock.now()
    ) {
      this.destroy(session);
      return true;
    }
    if (session.battle && session.battle.phase !== 'complete') {
      const absent = session.players.filter((player) => !player.connected);
      if (absent.length === 2) {
        this.destroy(session);
        return true;
      }
      if (
        absent.length === 1 &&
        absent[0]!.disconnectedAt! + FIVE_MINUTES <= this.clock.now()
      ) {
        this.finish(
          session,
          session.players.find((player) => player.connected)!.id,
          'forfeit',
        );
        return true;
      }
    } else if (
      session.players.some((player) => !player.connected) &&
      session.players.some(
        (player) => player.disconnectedAt! + FIVE_MINUTES <= this.clock.now(),
      )
    )
      this.destroy(session);
    else return false;
    return true;
  }

  private startRematch(session: Session): void {
    this.invalidate(session);
    const previousId = session.id;
    this.sessions.delete(previousId);
    this.stats.releaseCompletion(previousId);
    session.id = `game-${++this.sequence}`;
    session.previousGameId = previousId;
    this.sessions.set(session.id, session);
    for (const player of session.players)
      this.sessionByIdentity.set(player.id, session.id);
    session.battle = undefined;
    session.rematch = undefined;
    session.resultAt = undefined;
    session.winnerId = undefined;
    session.completionReason = undefined;
    session.startedAt = this.clock.now();
    for (const player of session.players) {
      player.ready = false;
      player.fleet = undefined;
      player.left = false;
    }
  }

  private finish(
    session: Session,
    winnerId: string,
    completionReason: 'sunk' | 'forfeit',
  ): void {
    if (session.battle?.phase === 'complete' && session.winnerId) return;
    session.winnerId = winnerId;
    session.completionReason = completionReason;
    session.resultAt = this.clock.now();
    this.stats.complete(
      session.id,
      winnerId,
      session.players.find((player) => player.id !== winnerId)!.id,
    );
    if (session.battle && session.battle.phase !== 'complete')
      session.battle = {
        ...session.battle,
        phase: 'complete',
        turnPlayerId: null,
        winnerPlayerId: winnerId,
      };
    this.scheduleResultExpiry(session);
  }

  private releaseResultPlayer(session: Session, identityId: string): void {
    const player = this.playerFor(session, identityId);
    player.left = true;
    if (this.sessionByIdentity.get(identityId) === session.id) {
      this.sessionByIdentity.delete(identityId);
      this.identities.setIdle(identityId);
    }
    if (session.players.every((player) => player.left)) this.destroy(session);
  }

  private destroy(session: Session): void {
    this.invalidate(session);
    this.sessions.delete(session.id);
    this.stats.releaseCompletion(session.id);
    for (const player of session.players) {
      if (this.sessionByIdentity.get(player.id) === session.id) {
        this.sessionByIdentity.delete(player.id);
        this.identities.setIdle(player.id);
      }
    }
  }

  private assertFree(identityId: string): void {
    if (this.sessionByIdentity.has(identityId))
      throw new Error('Identity already has a session');
  }

  private schedule(
    session: Session,
    delay: number,
    callback: () => GameChange | false,
  ): () => void {
    const generation = session.generation;
    let cancel: () => void = () => undefined;
    const guardedCallback = () => {
      session.timers.delete(cancel);
      if (
        session.generation !== generation ||
        this.sessions.get(session.id) !== session
      )
        return;
      const change = callback();
      if (change) this.notifyChanges(change);
    };
    cancel = this.scheduler.schedule(delay, guardedCallback);
    session.timers.add(cancel);
    return cancel;
  }

  private invalidate(session: Session, preserveDeadlines = false): void {
    session.generation += 1;
    for (const cancel of session.timers) cancel();
    session.timers.clear();
    session.rematchTimer = undefined;
    if (preserveDeadlines) {
      this.scheduleRematchExpiry(session);
      this.scheduleResultExpiry(session);
    }
  }

  private clearRematchTimer(session: Session): void {
    const cancel = session.rematchTimer;
    if (cancel === undefined) return;
    cancel();
    session.timers.delete(cancel);
    session.rematchTimer = undefined;
  }

  private scheduleRematchExpiry(session: Session): void {
    const request = session.rematch;
    if (!request) return;
    this.clearRematchTimer(session);
    const { requestedBy, expiresAt } = request;
    session.rematchTimer = this.schedule(
      session,
      Math.max(0, expiresAt - this.clock.now()),
      () => {
        if (
          session.rematch?.requestedBy === requestedBy &&
          session.rematch.expiresAt === expiresAt
        ) {
          session.rematch = undefined;
          session.rematchTimer = undefined;
          return this.changeFor(session, false);
        }
        session.rematchTimer = undefined;
        return false;
      },
    );
  }

  private scheduleResultExpiry(session: Session): void {
    if (session.resultAt === undefined || session.battle?.phase !== 'complete')
      return;
    this.schedule(
      session,
      Math.max(0, session.resultAt + RESULT_RETENTION - this.clock.now()),
      () => (this.sweep(session.id) ? this.changeFor(session, false) : false),
    );
  }

  private scheduleDisconnectExpiry(session: Session): void {
    const deadlines = session.players
      .filter(
        (player) => !player.connected && player.disconnectedAt !== undefined,
      )
      .map((player) => player.disconnectedAt! + FIVE_MINUTES);
    if (deadlines.length === 0) return;
    const deadline = Math.min(...deadlines);
    this.schedule(session, Math.max(0, deadline - this.clock.now()), () =>
      this.sweep(session.id) ? this.changeFor(session, true) : false,
    );
  }
  private notifyChanges(change: GameChange): void {
    for (const listener of this.changeListeners) {
      try {
        listener(change);
      } catch {
        // A transport observer must not interrupt authoritative timer cleanup.
      }
    }
  }
  private changeFor(session: Session, lobbyChanged: boolean): GameChange {
    return {
      affectedIdentityIds: session.players
        .filter((player) => !player.left)
        .map((player) => player.id),
      lobbyChanged,
    };
  }
  private isLobbyVisible(session: Session): boolean {
    return session.players.length < 2 || session.battle?.phase !== 'complete';
  }
  private reconnectDeadline(
    session: Session,
    phase: 'waiting' | 'deployment' | 'battle' | 'paused' | 'complete',
  ): number | null {
    if (
      session.players.length !== 2 ||
      (phase !== 'deployment' && phase !== 'battle' && phase !== 'paused')
    )
      return null;
    const deadlines = session.players
      .filter(
        (player) => !player.connected && player.disconnectedAt !== undefined,
      )
      .map((player) => player.disconnectedAt! + FIVE_MINUTES);
    return deadlines.length === 0 ? null : Math.min(...deadlines);
  }
  private rematchProjection(session: Session, viewerId: string) {
    const request = session.rematch;
    if (!request || request.expiresAt <= this.clock.now())
      return { status: 'idle' } as const;
    return {
      status:
        request.requestedBy === viewerId
          ? 'requested-by-self'
          : 'requested-by-opponent',
      expiresAt: request.expiresAt,
    } as const;
  }
  private requireIdentity(identityId: string) {
    const identity = this.identities.get(identityId);
    if (!identity) throw new Error('Unknown identity');
    return identity;
  }
  private requireSession(gameId: string): Session {
    const session = this.sessions.get(gameId);
    if (!session) throw new Error('Unknown game');
    return session;
  }
  private sessionFor(identityId: string): Session {
    return this.requireSession(this.sessionByIdentity.get(identityId) ?? '');
  }
  private playerFor(session: Session, identityId: string): Player {
    const player = session.players.find(
      (candidate) => candidate.id === identityId,
    );
    if (!player) throw new Error('Player is not in game');
    return player;
  }
  private player(identityId: string, name: string): Player {
    return { id: identityId, name, connected: true, ready: false, left: false };
  }
  private status(player: Player): 'placing' | 'ready' | 'disconnected' {
    return player.connected
      ? player.ready
        ? 'ready'
        : 'placing'
      : 'disconnected';
  }
  private summary(session: Session): SessionSummary {
    return {
      gameId: session.id,
      preset: session.preset,
      hostName: session.players[0]!.name,
      players: [session.players[0]!.name, session.players[1]?.name],
      phase:
        session.battle?.phase === 'complete'
          ? 'complete'
          : session.battle
            ? session.players.some((player) => !player.connected)
              ? 'paused'
              : 'battle'
            : session.players.length === 1
              ? 'waiting'
              : 'placing',
    };
  }
}
