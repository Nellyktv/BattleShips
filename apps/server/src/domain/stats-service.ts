export interface RuntimeStats {
  readonly games: number;
  readonly wins: number;
  readonly losses: number;
}

const EMPTY_STATS: RuntimeStats = { games: 0, wins: 0, losses: 0 };

export class StatsService {
  private readonly stats = new Map<string, RuntimeStats>();
  private readonly completedGames = new Set<string>();

  get(identityId: string): RuntimeStats {
    return this.stats.get(identityId) ?? EMPTY_STATS;
  }

  complete(gameId: string, winnerId: string, loserId: string): void {
    if (this.completedGames.has(gameId)) return;
    this.completedGames.add(gameId);
    this.increment(winnerId, 'wins');
    this.increment(loserId, 'losses');
  }

  releaseCompletion(gameId: string): void {
    this.completedGames.delete(gameId);
  }

  private increment(identityId: string, result: 'wins' | 'losses'): void {
    const previous = this.get(identityId);
    this.stats.set(identityId, {
      games: previous.games + 1,
      wins: previous.wins + (result === 'wins' ? 1 : 0),
      losses: previous.losses + (result === 'losses' ? 1 : 0),
    });
  }
}
