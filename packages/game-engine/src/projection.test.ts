import { describe, expect, it } from 'vitest';
import { createBattle, fireShot, type PlacementFleet } from './index.js';
import { projectBattle } from './projection.js';

const fleet = (offset: number): PlacementFleet => [
  {
    length: 4,
    cells: [`A${offset}`, `B${offset}`, `C${offset}`, `D${offset}`],
  },
  { length: 3, cells: [`A${offset + 1}`, `B${offset + 1}`, `C${offset + 1}`] },
  { length: 3, cells: [`A${offset + 2}`, `B${offset + 2}`, `C${offset + 2}`] },
  { length: 2, cells: [`A${offset + 3}`, `B${offset + 3}`] },
];

const initial = () =>
  createBattle({
    preset: 'quick-8x8',
    players: [
      { playerId: 'p1', name: 'Ada', fleet: fleet(1) },
      { playerId: 'p2', name: 'Bea', fleet: fleet(5) },
    ],
    startingPlayerId: 'p1',
  });

describe('battle projection', () => {
  it('keeps unsunk opponent cells private while exposing the viewer fleet and shots', () => {
    const projection = projectBattle(initial(), 'p1');

    expect(projection.self.fleet).toEqual(fleet(1));
    expect(projection.opponent.sunkShips).toEqual([]);
    expect(projection.opponentShots).toEqual([]);
  });

  it('reveals sunk and then complete opponent fleets at the appropriate boundaries', () => {
    let state = initial();
    for (const coordinate of ['A5', 'B5', 'C5', 'D5'] as const) {
      const transition = fireShot(state, 'p1', coordinate);
      if (!transition.accepted)
        throw new Error('fixture shot should be accepted');
      state = transition.state;
    }
    expect(projectBattle(state, 'p1').opponent.sunkShips).toEqual([
      fleet(5)[0],
    ]);

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
    expect(projectBattle(state, 'p1').opponent.fleet).toEqual(fleet(5));
  });

  it('exposes only fully sunk opponent shapes before completion', () => {
    let state = initial();
    for (const coordinate of ['A5', 'B5', 'C5', 'D5'] as const) {
      const transition = fireShot(state, 'p1', coordinate);
      if (!transition.accepted)
        throw new Error('fixture shot should be accepted');
      state = transition.state;
    }

    const projection = projectBattle(state, 'p1');

    expect(projection.opponent).not.toHaveProperty('fleet');
    expect(projection.opponent).toHaveProperty('sunkShips', [fleet(5)[0]]);
    expect(projection.opponent).not.toHaveProperty('sunkShips', [fleet(5)[1]]);
  });
});
