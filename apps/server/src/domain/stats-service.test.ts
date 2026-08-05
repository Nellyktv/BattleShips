import { describe, expect, it } from 'vitest';
import { StatsService } from './stats-service.js';

describe('StatsService', () => {
  it('updates runtime games, wins, and losses exactly once per completion', () => {
    const stats = new StatsService();

    stats.complete('game-1', 'winner', 'loser');
    stats.complete('game-1', 'winner', 'loser');

    expect(stats.get('winner')).toEqual({ games: 1, wins: 1, losses: 0 });
    expect(stats.get('loser')).toEqual({ games: 1, wins: 0, losses: 1 });
    expect(stats.get('spectator')).toEqual({ games: 0, wins: 0, losses: 0 });
  });

  it('releases a permanently destroyed completion id without affecting live deduplication', () => {
    const stats = new StatsService();

    stats.complete('game-1', 'winner', 'loser');
    stats.complete('game-1', 'winner', 'loser');
    stats.releaseCompletion('game-1');
    stats.complete('game-1', 'winner', 'loser');

    expect(stats.get('winner')).toEqual({ games: 2, wins: 2, losses: 0 });
    expect(stats.get('loser')).toEqual({ games: 2, wins: 0, losses: 2 });
  });
});
