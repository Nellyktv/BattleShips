import { presets, type Coordinate, type Preset } from '@battleships/contracts';
import { coordinateToPosition } from './coordinates.js';
import { isCompleteFleet } from './placement.js';
import type { PlacementFleet } from './types.js';

export interface PrivatePlayer {
  readonly playerId: string;
  readonly name: string;
  readonly fleet: PlacementFleet;
}

export interface PrivateBattleState {
  readonly preset: Preset;
  readonly players: readonly [PrivatePlayer, PrivatePlayer];
  readonly turnPlayerId: string | null;
  readonly phase: 'battle' | 'complete';
  readonly winnerPlayerId: string | null;
  readonly shots: readonly Shot[];
}

export interface Shot {
  readonly shooterId: string;
  readonly targetId: string;
  readonly coordinate: Coordinate;
  readonly result: 'miss' | 'hit' | 'sunk';
}

export type RejectionReason =
  'out-of-turn' | 'duplicate' | 'complete' | 'unknown-player' | 'out-of-bounds';
export type ShotTransition =
  | { readonly accepted: false; readonly reason: RejectionReason }
  | {
      readonly accepted: true;
      readonly state: PrivateBattleState;
      readonly shot: Shot;
    };

interface BattleOptions {
  readonly preset: Preset;
  readonly players: readonly [PrivatePlayer, PrivatePlayer];
  readonly startingPlayerId: string;
}

const cloneFleet = (fleet: PlacementFleet): PlacementFleet =>
  fleet.map((ship) => ({ ...ship, cells: [...ship.cells] }));

const clonePlayers = (
  players: readonly [PrivatePlayer, PrivatePlayer],
): readonly [PrivatePlayer, PrivatePlayer] => [
  { ...players[0], fleet: cloneFleet(players[0].fleet) },
  { ...players[1], fleet: cloneFleet(players[1].fleet) },
];

const freezeDeep = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

const isWithinPreset = (preset: Preset, coordinate: Coordinate): boolean => {
  try {
    const { column, row } = coordinateToPosition(coordinate);
    return (
      column < presets[preset].boardSize && row < presets[preset].boardSize
    );
  } catch {
    return false;
  }
};

export const createBattle = ({
  preset,
  players,
  startingPlayerId,
}: BattleOptions): PrivateBattleState => {
  if (players[0].playerId === players[1].playerId)
    throw new Error('players must be distinct');
  if (!players.every(({ fleet }) => isCompleteFleet(preset, fleet))) {
    throw new Error('players must submit complete legal fleets');
  }
  if (!players.some(({ playerId }) => playerId === startingPlayerId)) {
    throw new Error('starting player must belong to the battle');
  }
  return freezeDeep({
    preset,
    players: clonePlayers(players),
    turnPlayerId: startingPlayerId,
    phase: 'battle',
    winnerPlayerId: null,
    shots: [],
  });
};

const opponentOf = (state: PrivateBattleState, playerId: string) =>
  state.players.find(({ playerId: candidate }) => candidate !== playerId);

export const fireShot = (
  state: PrivateBattleState,
  shooterId: string,
  coordinate: Coordinate,
): ShotTransition => {
  const shooter = state.players.find(({ playerId }) => playerId === shooterId);
  const target = opponentOf(state, shooterId);
  if (!shooter || !target) return { accepted: false, reason: 'unknown-player' };
  if (state.phase === 'complete')
    return { accepted: false, reason: 'complete' };
  if (state.turnPlayerId !== shooterId)
    return { accepted: false, reason: 'out-of-turn' };
  if (!isWithinPreset(state.preset, coordinate)) {
    return { accepted: false, reason: 'out-of-bounds' };
  }
  if (
    state.shots.some(
      (shot) =>
        shot.targetId === target.playerId && shot.coordinate === coordinate,
    )
  ) {
    return { accepted: false, reason: 'duplicate' };
  }
  const ship = target.fleet.find(({ cells }) => cells.includes(coordinate));
  const priorHits = state.shots.filter(
    (shot) => shot.targetId === target.playerId && shot.result !== 'miss',
  );
  const isSunk = Boolean(
    ship &&
    ship.cells.every(
      (cell) =>
        cell === coordinate ||
        priorHits.some((shot) => shot.coordinate === cell),
    ),
  );
  const result = ship ? (isSunk ? 'sunk' : 'hit') : 'miss';
  const shot: Shot = {
    shooterId,
    targetId: target.playerId,
    coordinate,
    result,
  };
  const shots = [...state.shots, shot];
  const hasVictory = target.fleet.every(({ cells }) =>
    cells.every((cell) =>
      shots.some(
        (candidate) =>
          candidate.targetId === target.playerId &&
          candidate.coordinate === cell,
      ),
    ),
  );
  const nextState: PrivateBattleState = freezeDeep({
    ...state,
    shots,
    phase: hasVictory ? 'complete' : 'battle',
    winnerPlayerId: hasVictory ? shooterId : null,
    turnPlayerId: hasVictory
      ? null
      : result === 'miss'
        ? target.playerId
        : shooterId,
  });
  return { accepted: true, state: nextState, shot };
};
