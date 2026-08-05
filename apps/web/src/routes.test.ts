import { describe, expect, it } from 'vitest';
import {
  authoritativePath,
  authoritativeTransition,
  needsAuthoritativeNavigation,
  resolveGameRoute,
} from './routes.js';

describe('resolveGameRoute', () => {
  it('redirects an unauthorized game to the lobby with a message', () => {
    expect(resolveGameRoute(undefined, 'game-1')).toEqual({
      redirect: '/lobby',
      message: 'That game is no longer available.',
    });
  });

  it('allows the authorized game snapshot through', () => {
    expect(
      resolveGameRoute({ kind: 'game', gameId: 'game-1' }, 'game-1'),
    ).toEqual({ snapshot: { kind: 'game', gameId: 'game-1' } });
  });

  it('keeps the completed game route authorized while its rematch successor loads', () => {
    const rematch = {
      kind: 'game' as const,
      gameId: 'game-2',
      previousGameId: 'game-1',
    };

    expect(resolveGameRoute(rematch, 'game-1')).toEqual({
      snapshot: rematch,
    });
  });

  it('redirects a different game id even when a game snapshot exists', () => {
    expect(
      resolveGameRoute({ kind: 'game', gameId: 'owned-game' }, 'other-game'),
    ).toEqual({
      redirect: '/lobby',
      message: 'That game is no longer available.',
    });
  });

  it('does not transition when already at the authoritative path', () => {
    expect(authoritativePath({ kind: 'game', gameId: 'game-1' })).toBe(
      '/games/game-1',
    );
    expect(needsAuthoritativeNavigation('/games/game-1', '/games/game-1')).toBe(
      false,
    );
    expect(needsAuthoritativeNavigation('/lobby', '/games/game-1')).toBe(true);
  });

  it('preserves a route-guard message while replacing the route', () => {
    expect(
      authoritativeTransition('/other', '/lobby', {
        message: 'That game is no longer available.',
      }),
    ).toEqual({
      pathname: '/lobby',
      replace: true,
      state: { message: 'That game is no longer available.' },
    });
  });

  it('defers a deep-link mismatch to the route guard instead of jumping games', () => {
    expect(
      authoritativeTransition(
        '/games/requested-game',
        '/games/owned-game',
        null,
        { kind: 'game', gameId: 'owned-game' },
      ),
    ).toBeNull();
  });

  it('replaces a completed game route only with its authoritative rematch successor', () => {
    expect(
      authoritativeTransition(
        '/games/completed-game',
        '/games/rematch-game',
        null,
        {
          kind: 'game',
          gameId: 'rematch-game',
          previousGameId: 'completed-game',
        },
      ),
    ).toEqual({ pathname: '/games/rematch-game', replace: true });
    expect(
      authoritativeTransition(
        '/games/unrelated-game',
        '/games/rematch-game',
        null,
        {
          kind: 'game',
          gameId: 'rematch-game',
          previousGameId: 'completed-game',
        },
      ),
    ).toBeNull();
  });

  it('defers an unauthorized deep link when the authoritative snapshot is lobby', () => {
    expect(
      authoritativeTransition('/games/requested-game', '/lobby', null, {
        kind: 'lobby',
        player: {
          playerId: 'player-1',
          name: 'Captain',
          stats: { games: 0, wins: 0, losses: 0 },
        },
        waitingGames: [],
        activeGames: [],
      }),
    ).toBeNull();
  });

  it('does not erase the route-guard message after reaching the lobby', () => {
    expect(
      authoritativeTransition('/lobby', '/games/owned-game', {
        message: 'That game is no longer available.',
      }),
    ).toBeNull();
  });
});
