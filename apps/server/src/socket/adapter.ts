import {
  commandSchema,
  type Command,
  type Coordinate,
  type ErrorCode,
  type PlacementShip,
  type ServerAck,
  type Snapshot,
} from '@battleships/contracts';
import type { IdentityService } from '../domain/identity-service.js';
import type { LobbyService } from '../domain/lobby-service.js';
import { GameServiceError, type GameChange } from '../domain/game-service.js';

export interface SocketLike {
  readonly id: string;
  on(event: string, listener: (payload: unknown) => void): void;
  off?(event: string, listener: (payload: unknown) => void): void;
  emit(event: string, payload: unknown): void;
  disconnect?(close?: boolean): void;
}

export interface SocketServices {
  readonly identity: Pick<
    IdentityService,
    'connect' | 'getBySocket' | 'disconnect' | 'rename'
  >;
  readonly lobby: {
    snapshot(identityId: string): Snapshot;
    create(
      identityId: string,
      preset: Parameters<LobbyService['create']>[1],
    ): unknown;
    join(identityId: string, gameId: string): unknown;
    quickPlay(identityId: string): unknown;
    cancel(identityId: string): void;
    leave(identityId: string): void;
  };
  readonly games: {
    subscribeChanges(listener: (change: GameChange) => void): () => void;
    snapshot(identityId: string): Snapshot;
    hasSession(identityId: string): boolean;
    reconnect(identityId: string): void;
    disconnect(identityId: string): void;
    ready(identityId: string, fleet: readonly PlacementShip[]): void;
    shot(identityId: string, coordinate: Coordinate): void;
    leave(identityId: string): void;
    requestRematch(identityId: string): void;
    respondRematch(identityId: string, accept: boolean): void;
  };
}

type BoundSocket = {
  socket: SocketLike;
  onCommand: (payload: unknown) => void;
  onDisconnect: () => void;
};

const DOMAIN_MESSAGE_CODES = new Map<string, ErrorCode>([
  ['Unknown game', 'game-not-found'],
  ['Player is not in game', 'not-authorized'],
  ['Battle is not active', 'invalid-state'],
  ['Battle is paused', 'invalid-state'],
  ['Deployment is locked', 'invalid-placement'],
  ['Invalid fleet', 'invalid-placement'],
  ['No active rematch request', 'invalid-state'],
]);

export class SocketAdapter {
  private readonly sockets = new Map<string, BoundSocket>();
  private readonly identitySockets = new Map<string, string>();
  private readonly unsubscribeGameChanges: () => void;
  private pendingChanges: GameChange[] | undefined;

  constructor(
    private readonly services: SocketServices,
    private readonly runtimeId = globalThis.crypto.randomUUID(),
  ) {
    this.unsubscribeGameChanges = services.games.subscribeChanges((change) =>
      this.handleGameChange(change),
    );
  }

  dispose(): void {
    this.unsubscribeGameChanges();
  }

  attach(socket: SocketLike): () => void {
    const onCommand = (payload: unknown) => this.dispatch(socket, payload);
    const onDisconnect = () => this.detach(socket);
    socket.on('command', onCommand);
    socket.on('disconnect', onDisconnect);
    this.sockets.set(socket.id, { socket, onCommand, onDisconnect });
    return onDisconnect;
  }

  private dispatch(socket: SocketLike, payload: unknown): void {
    this.pendingChanges = [];
    const candidate = this.unwrapCommand(payload);
    const actionId = this.actionId(candidate);
    const parsed = commandSchema.safeParse(candidate);
    if (!parsed.success) {
      this.ack(socket, actionId, {
        code: 'invalid-command',
        message: 'Invalid command',
      });
      this.pendingChanges = undefined;
      return;
    }

    try {
      const identityId = this.services.identity.getBySocket(
        socket.id,
      )?.identityId;
      if (parsed.data.type === 'identify') {
        const { name, runtimeId, tabId } = parsed.data.payload;
        if (runtimeId !== undefined && runtimeId !== this.runtimeId) {
          this.ack(socket, actionId, {
            code: 'runtime-reset',
            message: 'Server runtime changed',
          });
          return;
        }
        const result = this.services.identity.connect(tabId, socket.id, name);
        if (result.replacedSocketId !== undefined) {
          const previous = this.sockets.get(result.replacedSocketId);
          previous?.socket.emit('event', { type: 'session-replaced' });
          if (previous) {
            this.removeListeners(previous);
            previous.socket.disconnect?.(true);
          }
        }
        this.identitySockets.set(result.identity.identityId, socket.id);
        this.services.games.reconnect(result.identity.identityId);
        this.ack(
          socket,
          actionId,
          undefined,
          this.snapshotForIdentity(result.identity.identityId),
          this.runtimeId,
        );
        return;
      }
      if (identityId === undefined)
        throw new SocketError(
          'not-identified',
          'Identify before sending commands',
        );

      const snapshot = this.execute(identityId, parsed.data);
      this.ack(socket, actionId, undefined, snapshot);
    } catch (error) {
      this.ack(socket, actionId, this.errorFor(error));
    } finally {
      const changes = this.pendingChanges;
      this.pendingChanges = undefined;
      for (const change of changes ?? []) this.emitChange(change, socket.id);
    }
  }

  private execute(
    identityId: string,
    command: Exclude<Command, { type: 'identify' }>,
  ): Snapshot {
    switch (command.type) {
      case 'rename':
        this.services.identity.rename(identityId, command.payload.name);
        return this.services.lobby.snapshot(identityId);
      case 'leave':
        this.services.lobby.leave(identityId);
        return this.services.lobby.snapshot(identityId);
      case 'lobby.snapshot':
        return this.services.lobby.snapshot(identityId);
      case 'lobby.create':
        this.services.lobby.create(identityId, command.payload.preset);
        return this.services.games.snapshot(identityId);
      case 'lobby.join':
        this.services.lobby.join(identityId, command.payload.gameId);
        return this.services.games.snapshot(identityId);
      case 'lobby.quick-play':
        this.services.lobby.quickPlay(identityId);
        return this.services.games.snapshot(identityId);
      case 'lobby.cancel':
        this.services.lobby.cancel(identityId);
        return this.services.lobby.snapshot(identityId);
      case 'fleet.ready':
        this.services.games.ready(identityId, command.payload.ships);
        return this.services.games.snapshot(identityId);
      case 'game.shot':
        this.services.games.shot(identityId, command.payload.coordinate);
        return this.services.games.snapshot(identityId);
      case 'game.leave':
        this.services.games.leave(identityId);
        return this.services.lobby.snapshot(identityId);
      case 'game.retry':
        return this.services.games.snapshot(identityId);
      case 'game.snapshot':
        return this.snapshotForIdentity(identityId);
      case 'rematch.request':
        this.services.games.requestRematch(identityId);
        return this.services.games.snapshot(identityId);
      case 'rematch.respond':
        this.services.games.respondRematch(identityId, command.payload.accept);
        return this.services.games.snapshot(identityId);
    }
    throw new Error('Unsupported command');
  }

  private handleGameChange(change: GameChange, exceptSocketId?: string): void {
    if (this.pendingChanges !== undefined) {
      this.pendingChanges.push(change);
      return;
    }
    this.emitChange(change, exceptSocketId);
  }

  private emitChange(change: GameChange, exceptSocketId?: string): void {
    for (const bound of this.sockets.values()) {
      if (bound.socket.id === exceptSocketId) continue;
      const identity = this.services.identity.getBySocket(bound.socket.id);
      if (identity === undefined) continue;
      const isAffected = change.affectedIdentityIds.includes(
        identity.identityId,
      );
      const isLobbyRecipient =
        change.lobbyChanged &&
        !this.services.games.hasSession(identity.identityId);
      if (!isAffected && !isLobbyRecipient) continue;
      try {
        bound.socket.emit('event', {
          type: 'snapshot',
          snapshot: this.snapshotForIdentity(identity.identityId),
        });
      } catch {
        continue;
      }
    }
  }

  private snapshotForIdentity(identityId: string): Snapshot {
    return this.services.games.hasSession(identityId)
      ? this.services.games.snapshot(identityId)
      : this.services.lobby.snapshot(identityId);
  }

  private detach(socket: SocketLike): void {
    const identity = this.services.identity.getBySocket(socket.id);
    if (identity !== undefined) {
      const bound = this.sockets.get(socket.id);
      if (bound) this.removeListeners(bound);
      this.services.games.disconnect(identity.identityId);
      this.services.identity.disconnect(socket.id);
      this.identitySockets.delete(identity.identityId);
    }
    this.sockets.delete(socket.id);
  }

  private removeListeners(bound: BoundSocket): void {
    bound.socket.off?.('command', bound.onCommand);
    bound.socket.off?.('disconnect', bound.onDisconnect);
    this.sockets.delete(bound.socket.id);
  }

  private ack(
    socket: SocketLike,
    actionId: string,
    error?: { code: ErrorCode; message: string },
    snapshot?: Snapshot,
    runtimeId?: string,
  ): void {
    const payload: ServerAck = error
      ? {
          actionId: this.validActionId(actionId),
          ok: false,
          error,
        }
      : {
          actionId: this.validActionId(actionId),
          ok: true,
          snapshot: snapshot!,
          ...(runtimeId ? { runtimeId } : {}),
        };
    socket.emit('ack', payload);
  }

  private errorFor(error: unknown): { code: ErrorCode; message: string } {
    if (error instanceof GameServiceError)
      return { code: error.code, message: error.message };
    if (error instanceof SocketError)
      return { code: error.code, message: error.message };
    const message = error instanceof Error ? error.message : 'Command failed';
    return {
      code: DOMAIN_MESSAGE_CODES.get(message) ?? 'invalid-state',
      message,
    };
  }

  private unwrapCommand(payload: unknown): unknown {
    if (typeof payload === 'object' && payload !== null && 'command' in payload)
      return payload.command;
    return payload;
  }

  private actionId(payload: unknown): string {
    return typeof payload === 'object' &&
      payload !== null &&
      'actionId' in payload &&
      typeof payload.actionId === 'string'
      ? payload.actionId
      : 'act_invalid';
  }

  private validActionId(actionId: string): string {
    return /^act_[A-Za-z0-9_-]{3,64}$/.test(actionId)
      ? actionId
      : 'act_invalid';
  }
}

export function createSocketAdapter(services: SocketServices): SocketAdapter {
  return new SocketAdapter(services);
}

class SocketError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
