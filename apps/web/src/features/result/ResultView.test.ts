// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameSnapshot } from '@battleships/contracts';
import { ResultView, deriveResult } from './ResultView.js';

afterEach(cleanup);

const completeSnapshot = (overrides: Partial<GameSnapshot> = {}) =>
  ({
    kind: 'game',
    gameId: 'game-1',
    phase: 'complete',
    preset: 'quick-8x8',
    self: {
      playerId: 'self',
      name: 'Captain',
      status: 'ready',
      fleet: [{ length: 2, cells: ['A1', 'A2'] }],
      stats: { games: 4, wins: 3, losses: 1 },
    },
    opponent: {
      playerId: 'opponent',
      name: 'Rival',
      status: 'ready',
      fleet: [{ length: 2, cells: ['B1', 'B2'] }],
    },
    turnPlayerId: null,
    reconnectDeadline: null,
    shots: [],
    winnerPlayerId: 'self',
    completionReason: 'sunk',
    rematch: { status: 'idle' },
    ...overrides,
  }) as GameSnapshot & { phase: 'complete' };

const renderResult = (
  snapshot: ReturnType<typeof completeSnapshot>,
  overrides: Partial<React.ComponentProps<typeof ResultView>> = {},
) =>
  render(
    createElement(ResultView, {
      connected: true,
      onLeave: vi.fn(),
      onRematchRequest: vi.fn(),
      onRematchRespond: vi.fn(),
      snapshot,
      ...overrides,
    }),
  );

describe('deriveResult', () => {
  it('derives victory and defeat from the authoritative winner', () => {
    expect(deriveResult(completeSnapshot())).toMatchObject({
      outcome: 'victory',
      title: 'Victory',
    });
    expect(
      deriveResult(completeSnapshot({ winnerPlayerId: 'opponent' })),
    ).toMatchObject({ outcome: 'defeat', title: 'Defeat' });
  });
});

describe('ResultView', () => {
  it('shows outcome, forfeit wording, opponent, and authoritative stats', () => {
    renderResult(
      completeSnapshot({
        winnerPlayerId: 'opponent',
        completionReason: 'forfeit',
      }),
    );

    expect(screen.getByRole('heading', { name: 'Defeat' })).toBeTruthy();
    expect(screen.getByText('You forfeited to Rival.')).toBeTruthy();
    expect(screen.getByText(/Opponent: Rival/)).toBeTruthy();
    expect(screen.getByText(/4 games/)).toBeTruthy();
    expect(screen.getByText(/3 wins/)).toBeTruthy();
    expect(screen.getByText(/1 loss/)).toBeTruthy();
  });

  it('invokes leave and requests a rematch from the idle state', () => {
    const onLeave = vi.fn();
    const onRematchRequest = vi.fn();
    renderResult(completeSnapshot(), { onLeave, onRematchRequest });

    fireEvent.click(screen.getByRole('button', { name: 'Return to lobby' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request rematch' }));

    expect(onLeave).toHaveBeenCalledOnce();
    expect(onRematchRequest).toHaveBeenCalledOnce();
  });

  it('shows waiting and server-timestamp countdown for a self request', () => {
    renderResult(
      completeSnapshot({
        rematch: { status: 'requested-by-self', expiresAt: 61_500 },
      }),
      { now: () => 1_000 },
    );

    expect(screen.getByText('Waiting for Rival to accept')).toBeTruthy();
    expect(
      screen.getByText('Rematch request expires in 61 seconds'),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Request rematch' }),
    ).toBeNull();
  });

  it('invokes the injected response for an opponent request', () => {
    const onRematchRespond = vi.fn();
    renderResult(
      completeSnapshot({
        rematch: { status: 'requested-by-opponent', expiresAt: 61_500 },
      }),
      { now: () => 1_000, onRematchRespond },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    expect(onRematchRespond).toHaveBeenNthCalledWith(1, true);
    expect(onRematchRespond).toHaveBeenNthCalledWith(2, false);
  });

  it('suppresses all actions while disconnected or pending', () => {
    const onLeave = vi.fn();
    const onRematchRequest = vi.fn();
    renderResult(completeSnapshot(), {
      connected: false,
      onLeave,
      onRematchRequest,
      pending: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Return to lobby' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request rematch' }));

    expect(onLeave).not.toHaveBeenCalled();
    expect(onRematchRequest).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Return to lobby' }),
    ).toHaveProperty('disabled', true);
  });
});
