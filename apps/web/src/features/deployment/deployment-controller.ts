import {
  coordinateToPosition,
  isCompleteFleet,
  positionToCoordinate,
  randomizeFleet,
  validatePlacement,
  type BoardPosition,
  type RandomSource,
} from '@battleships/game-engine';
import type { PlacementShip, Preset } from '@battleships/contracts';
import { presets } from '@battleships/contracts';

export type DeploymentResult =
  | { readonly valid: true; readonly fleet: readonly PlacementShip[] }
  | {
      readonly valid: false;
      readonly fleet: readonly PlacementShip[];
      readonly reason:
        | 'locked'
        | 'wrong-fleet'
        | 'wrong-ship-shape'
        | 'out-of-bounds'
        | 'overlap';
    };

export interface DeploymentController {
  readonly getFleet: () => readonly PlacementShip[];
  readonly place: (length: number, anchor: BoardPosition) => DeploymentResult;
  readonly move: (shipIndex: number, anchor: BoardPosition) => DeploymentResult;
  readonly rotate: (shipIndex: number) => DeploymentResult;
  readonly randomize: () => DeploymentResult;
  readonly isComplete: () => boolean;
  readonly canReady: () => boolean;
  readonly syncReadyState: (locked: boolean) => void;
  readonly confirmReady: () => {
    readonly ok: boolean;
    readonly locked: boolean;
    readonly fleet?: readonly PlacementShip[];
  };
}

const translate = (ship: PlacementShip, anchor: BoardPosition) => {
  const origin = ship.cells[0];
  if (!origin) throw new Error('Cannot move an empty ship');
  const originPosition = {
    ...coordinateToPosition(origin),
  };
  const columnDelta = anchor.column - originPosition.column;
  const rowDelta = anchor.row - originPosition.row;
  return ship.cells.map((cell) => {
    const position = coordinateToPosition(cell);
    return {
      column: position.column + columnDelta,
      row: position.row + rowDelta,
    };
  });
};

const positionsToShip = (
  length: number,
  positions: readonly BoardPosition[],
): PlacementShip => ({
  length,
  cells: positions.map(({ column, row }) =>
    positionToCoordinate({ column, row }),
  ),
});

const isWithinBoard = (position: BoardPosition, boardSize: number) =>
  position.column >= 0 &&
  position.row >= 0 &&
  position.column < boardSize &&
  position.row < boardSize;

const rotatedPositions = (ship: PlacementShip): BoardPosition[] => {
  const first = ship.cells[0];
  if (!first) throw new Error('Cannot rotate an empty ship');
  const firstPosition = {
    ...coordinateToPosition(first),
  };
  const horizontal = ship.cells.every(
    (cell) => coordinateToPosition(cell).row === firstPosition.row,
  );
  return Array.from({ length: ship.length }, (_, index) => ({
    column: firstPosition.column,
    row: horizontal ? firstPosition.row + index : firstPosition.row,
  }));
};

export const createDeploymentController = (
  preset: Preset,
  initialFleet: readonly PlacementShip[],
  random: RandomSource = Math.random,
  options: { readonly locked?: boolean } = {},
): DeploymentController => {
  let fleet = [...initialFleet];
  let locked = options.locked ?? false;
  const resultFor = (candidate: readonly PlacementShip[]): DeploymentResult => {
    const complete = isCompleteFleet(preset, candidate);
    const validation = complete
      ? validatePlacement(preset, candidate)
      : validatePartial(candidate, presets[preset].boardSize);
    return validation.valid
      ? { valid: true, fleet: candidate }
      : { valid: false, fleet, reason: validation.reason };
  };
  const apply = (candidate: readonly PlacementShip[]) => {
    const result = resultFor(candidate);
    if (result.valid) fleet = [...candidate];
    return result;
  };

  return {
    getFleet: () => fleet,
    place: (length, anchor) => {
      if (locked) return { valid: false, fleet, reason: 'locked' };
      const positions = Array.from({ length }, (_, index) => ({
        column: anchor.column + index,
        row: anchor.row,
      }));
      if (
        positions.some(
          (position) => !isWithinBoard(position, presets[preset].boardSize),
        )
      ) {
        return { valid: false, fleet, reason: 'out-of-bounds' };
      }
      const candidate = [...fleet, positionsToShip(length, positions)];
      return apply(candidate);
    },
    move: (shipIndex, anchor) => {
      if (locked) return { valid: false, fleet, reason: 'locked' };
      const ship = fleet[shipIndex];
      if (!ship) return { valid: false, fleet, reason: 'wrong-ship-shape' };
      const positions = translate(ship, anchor);
      if (
        positions.some(
          (position) => !isWithinBoard(position, presets[preset].boardSize),
        )
      ) {
        return { valid: false, fleet, reason: 'out-of-bounds' };
      }
      const candidate = [...fleet];
      candidate[shipIndex] = positionsToShip(ship.length, positions);
      return apply(candidate);
    },
    rotate: (shipIndex) => {
      if (locked) return { valid: false, fleet, reason: 'locked' };
      const ship = fleet[shipIndex];
      if (!ship) return { valid: false, fleet, reason: 'wrong-ship-shape' };
      const positions = rotatedPositions(ship);
      if (
        positions.some(
          (position) => !isWithinBoard(position, presets[preset].boardSize),
        )
      ) {
        return { valid: false, fleet, reason: 'out-of-bounds' };
      }
      const candidate = [...fleet];
      candidate[shipIndex] = positionsToShip(ship.length, positions);
      return apply(candidate);
    },
    randomize: () => {
      if (locked) return { valid: false, fleet, reason: 'locked' };
      return apply(randomizeFleet(preset, random));
    },
    isComplete: () => isCompleteFleet(preset, fleet),
    canReady: () => !locked && isCompleteFleet(preset, fleet),
    syncReadyState: (authoritativeLocked) => {
      if (authoritativeLocked) locked = true;
    },
    confirmReady: () => {
      if (locked || !isCompleteFleet(preset, fleet))
        return { ok: false, locked };
      return { ok: true, locked: false, fleet };
    },
  };
};

const validatePartial = (
  fleet: readonly PlacementShip[],
  boardSize: number,
) => {
  const occupied = new Set<string>();
  for (const ship of fleet) {
    if (ship.cells.length !== ship.length) {
      return { valid: false as const, reason: 'wrong-ship-shape' as const };
    }
    for (const cell of ship.cells) {
      const { column, row } = coordinateToPosition(cell);
      if (column < 0 || row < 0 || column >= boardSize || row >= boardSize) {
        return { valid: false as const, reason: 'out-of-bounds' as const };
      }
      if (occupied.has(cell)) {
        return { valid: false as const, reason: 'overlap' as const };
      }
      occupied.add(cell);
    }
  }
  return { valid: true as const };
};
