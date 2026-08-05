import type { Preset } from '@battleships/contracts';
import { type GameService, type SessionSummary } from './game-service.js';

export class LobbyService {
  constructor(
    private readonly games: GameService,
    private readonly rng = { next: () => Math.random() },
  ) {}
  create(identityId: string, preset: Preset): SessionSummary {
    return this.games.create(identityId, preset);
  }
  join(identityId: string, gameId: string): SessionSummary {
    return this.games.join(identityId, gameId);
  }
  cancel(identityId: string): void {
    this.games.cancel(identityId);
  }
  leave(identityId: string): void {
    this.games.leave(identityId);
  }
  waiting(): SessionSummary[] {
    return this.games.waiting();
  }
  active(): SessionSummary[] {
    return this.games.active();
  }
  snapshot(identityId: string) {
    return this.games.lobbySnapshot(identityId);
  }
  quickPlay(identityId: string): SessionSummary {
    const waiting = this.games.waiting();
    if (waiting.length === 0)
      return this.games.create(identityId, 'classic-10x10');
    return this.games.join(
      identityId,
      waiting[Math.floor(this.rng.next() * waiting.length)]!.gameId,
    );
  }
}
