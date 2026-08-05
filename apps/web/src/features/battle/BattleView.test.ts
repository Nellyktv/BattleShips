// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameSnapshot } from '@battleships/contracts';

vi.mock('./BattleBoards.js', () => ({
  BattleBoards: ({
    controller,
  }: {
    controller: { shoot: (coordinate: string) => boolean };
  }) =>
    createElement(
      'button',
      { onClick: () => controller.shoot('C4') },
      'Mock enemy board',
    ),
}));
vi.mock('./ReconnectBanner.js', () => ({
  ReconnectBanner: ({ onRetry }: { onRetry: () => void }) =>
    createElement('button', { onClick: onRetry }, 'Retry now'),
}));

import { BattleView, type BattleSnapshot } from './BattleView.js';

const snapshot = (phase: 'battle' | 'paused' = 'battle'): BattleSnapshot =>
  ({
    kind: 'game',
    gameId: 'game-1',
    preset: 'quick-8x8',
    phase,
    self: {
      playerId: 'self',
      name: 'Self',
      status: 'ready',
      fleet: [{ length: 2, cells: ['A1', 'B1'] }],
    },
    opponent: {
      playerId: 'opponent',
      name: 'Opponent',
      status: 'ready',
      sunkShips: [],
    },
    turnPlayerId: 'self',
    reconnectDeadline: phase === 'paused' ? 20_000 : null,
    shots: [],
    opponentShots: [],
  }) as GameSnapshot as BattleSnapshot;

afterEach(cleanup);

describe('BattleView action contracts', () => {
  it('injects a legal board click into onShot', () => {
    const onShot = vi.fn();
    render(
      createElement(BattleView, {
        snapshot: snapshot(),
        onShot,
        onLeave: vi.fn(),
        onRetry: vi.fn(),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mock enemy board' }));
    expect(onShot).toHaveBeenCalledWith('C4');
  });

  it('calls leave only after confirmation and exposes retry in paused state', () => {
    const onLeave = vi.fn();
    const onRetry = vi.fn();
    render(
      createElement(BattleView, {
        snapshot: snapshot('paused'),
        onShot: vi.fn(),
        onLeave,
        onRetry,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });
});
