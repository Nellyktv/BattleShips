import type { GameSnapshot } from '@battleships/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  createBattleController,
  countAfloatShips,
} from './battle-controller.js';

const snapshot = (overrides: Partial<GameSnapshot> = {}): GameSnapshot =>
  ({
    kind: 'game',
    gameId: 'game-1',
    preset: 'quick-8x8',
    phase: 'battle',
    self: { playerId: 'self', name: 'Self', status: 'ready', fleet: [] },
    opponent: {
      playerId: 'opponent',
      name: 'Opponent',
      status: 'ready',
      sunkShips: [],
    },
    turnPlayerId: 'self',
    reconnectDeadline: null,
    shots: [],
    opponentShots: [],
    ...overrides,
  }) as GameSnapshot;

describe('createBattleController', () => {
  it('sends an untried coordinate only when it is this player’s turn', () => {
    const onShot = vi.fn();
    const controller = createBattleController(snapshot(), false, onShot);

    expect(controller.shoot('C4')).toBe(true);
    expect(onShot).toHaveBeenCalledWith('C4');
  });

  it.each([
    ['paused', { phase: 'paused' }],
    ['complete', { phase: 'complete' }],
    ['opponent turn', { turnPlayerId: 'opponent' }],
  ])('rejects a shot during %s', (_label, overrides) => {
    const onShot = vi.fn();
    const controller = createBattleController(
      snapshot(overrides as Partial<GameSnapshot>),
      false,
      onShot,
    );

    expect(controller.shoot('C4')).toBe(false);
    expect(onShot).not.toHaveBeenCalled();
  });

  it('rejects shots while a command is pending or a coordinate was already tried', () => {
    const onShot = vi.fn();
    const pending = createBattleController(snapshot(), true, onShot);
    expect(pending.shoot('C4')).toBe(false);

    const tried = createBattleController(
      snapshot({ shots: [{ coordinate: 'C4', result: 'hit' }] }),
      false,
      onShot,
    );
    expect(tried.shoot('C4')).toBe(false);
    expect(onShot).not.toHaveBeenCalled();
  });

  it('does not send a shot while the local client is disconnected', () => {
    const onShot = vi.fn();
    const controller = createBattleController(snapshot(), false, onShot, false);

    expect(controller.shoot('C4')).toBe(false);
    expect(onShot).not.toHaveBeenCalled();
  });

  it('counts a ship as sunk only after every authoritative hit on its cells', () => {
    const fleet = [{ length: 2, cells: ['A1', 'B1'] }];

    expect(countAfloatShips(fleet, [{ coordinate: 'A1', result: 'hit' }])).toBe(
      1,
    );
    expect(
      countAfloatShips(fleet, [
        { coordinate: 'A1', result: 'hit' },
        { coordinate: 'B1', result: 'sunk' },
      ]),
    ).toBe(0);
  });
});
