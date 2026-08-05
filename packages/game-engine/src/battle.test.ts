import { describe, expect, it } from 'vitest';
import { createBattle, fireShot, type PlacementFleet } from './index.js';

const fleet = (offset: number): PlacementFleet => [
  {
    length: 4,
    cells: [`A${offset}`, `B${offset}`, `C${offset}`, `D${offset}`],
  },
  { length: 3, cells: [`A${offset + 1}`, `B${offset + 1}`, `C${offset + 1}`] },
  { length: 3, cells: [`A${offset + 2}`, `B${offset + 2}`, `C${offset + 2}`] },
  { length: 2, cells: [`A${offset + 3}`, `B${offset + 3}`] },
];

const battle = () =>
  createBattle({
    preset: 'quick-8x8',
    players: [
      { playerId: 'p1', name: 'Ada', fleet: fleet(1) },
      { playerId: 'p2', name: 'Bea', fleet: fleet(5) },
    ],
    startingPlayerId: 'p1',
  });

describe('battle transitions', () => {
  it('retains a turn after a hit and passes it after a miss without mutating state', () => {
    const initial = battle();
    const hit = fireShot(initial, 'p1', 'A5');
    expect(hit.accepted).toBe(true);
    if (!hit.accepted) return;
    expect(hit.shot.result).toBe('hit');
    expect(hit.state.turnPlayerId).toBe('p1');
    expect(initial.shots).toEqual([]);

    const miss = fireShot(hit.state, 'p1', 'H8');
    expect(miss.accepted).toBe(true);
    if (!miss.accepted) return;
    expect(miss.shot.result).toBe('miss');
    expect(miss.state.turnPlayerId).toBe('p2');
  });

  it('rejects duplicate and out-of-turn shots', () => {
    const afterHit = fireShot(battle(), 'p1', 'A5');
    if (!afterHit.accepted) throw new Error('fixture shot should be accepted');
    expect(fireShot(afterHit.state, 'p2', 'H8')).toEqual({
      accepted: false,
      reason: 'out-of-turn',
    });
    expect(fireShot(afterHit.state, 'p1', 'A5')).toEqual({
      accepted: false,
      reason: 'duplicate',
    });
  });

  it('rejects coordinates outside the selected preset board', () => {
    expect(fireShot(battle(), 'p1', 'I1')).toEqual({
      accepted: false,
      reason: 'out-of-bounds',
    });
  });

  it('does not let caller mutations alter an established battle', () => {
    const players = [
      { playerId: 'p1', name: 'Ada', fleet: fleet(1) },
      { playerId: 'p2', name: 'Bea', fleet: fleet(5) },
    ] as const;
    const state = createBattle({
      preset: 'quick-8x8',
      players,
      startingPlayerId: 'p1',
    });
    const callerShip = players[0].fleet[0];
    const establishedShip = state.players[0].fleet[0];
    if (!callerShip || !establishedShip)
      throw new Error('fixture ship missing');

    callerShip.cells[0] = 'H8';
    expect(establishedShip.cells[0]).toBe('A1');
    expect(() => {
      establishedShip.cells[0] = 'H8';
    }).toThrow();
  });

  it('keeps separate battle instances isolated', () => {
    const first = battle();
    const second = battle();
    const transition = fireShot(first, 'p1', 'H8');

    expect(transition.accepted).toBe(true);
    expect(second.shots).toEqual([]);
    expect(second.turnPlayerId).toBe('p1');
  });

  it('reports sunk ships and completes with a final victory', () => {
    let state = battle();
    for (const coordinate of ['A5', 'B5', 'C5', 'D5'] as const) {
      const transition = fireShot(state, 'p1', coordinate);
      if (!transition.accepted)
        throw new Error('fixture shot should be accepted');
      state = transition.state;
      expect(transition.shot.result).toBe(coordinate === 'D5' ? 'sunk' : 'hit');
    }
    expect(state.phase).toBe('battle');
    expect(state.turnPlayerId).toBe('p1');
    for (const coordinate of [
      'A6',
      'B6',
      'C6',
      'A7',
      'B7',
      'C7',
      'A8',
      'B8',
    ] as const) {
      const transition = fireShot(state, 'p1', coordinate);
      if (!transition.accepted)
        throw new Error('fixture shot should be accepted');
      state = transition.state;
    }
    expect(state.phase).toBe('complete');
    expect(state.winnerPlayerId).toBe('p1');
    expect(state.turnPlayerId).toBeNull();
  });
});
