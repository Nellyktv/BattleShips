import {
  presets,
  type PlacementShip,
  type Preset,
} from '@battleships/contracts';
import { positionToCoordinate } from './coordinates.js';
import { isCompleteFleet } from './placement.js';
import type { PlacementFleet } from './types.js';

export type RandomSource = () => number;

const shuffled = <T>(items: readonly T[], random: RandomSource): T[] => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomValue = Math.min(0.999999999, Math.max(0, random()));
    const swapIndex = Math.floor(randomValue * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
};

const candidatesFor = (boardSize: number, length: number): PlacementShip[] => {
  const candidates: PlacementShip[] = [];
  for (let row = 0; row < boardSize; row += 1) {
    for (let column = 0; column < boardSize; column += 1) {
      for (const horizontal of [true, false]) {
        const end = horizontal ? column + length : row + length;
        if (end > boardSize) continue;
        const cells = Array.from({ length }, (_, offset) =>
          positionToCoordinate({
            column: horizontal ? column + offset : column,
            row: horizontal ? row : row + offset,
          }),
        );
        candidates.push({ length, cells });
      }
    }
  }
  return candidates;
};

const canAdd = (fleet: PlacementFleet, ship: PlacementShip) => {
  const occupied = new Set(fleet.flatMap(({ cells }) => cells));
  return ship.cells.every((cell) => !occupied.has(cell));
};

const search = (
  lengths: readonly number[],
  boardSize: number,
  random: RandomSource,
  fleet: PlacementFleet,
  index: number,
): PlacementFleet | undefined => {
  if (index === lengths.length) return fleet;
  const candidates = shuffled(
    candidatesFor(boardSize, lengths[index]!),
    random,
  );
  for (const candidate of candidates) {
    if (!canAdd(fleet, candidate)) continue;
    const result = search(
      lengths,
      boardSize,
      random,
      [...fleet, candidate],
      index + 1,
    );
    if (result) return result;
  }
  return undefined;
};

export const randomizeFleet = (
  preset: Preset,
  random: RandomSource,
): PlacementFleet => {
  const configuration = presets[preset];
  const result = search(
    configuration.shipLengths,
    configuration.boardSize,
    random,
    [],
    0,
  );
  if (result && isCompleteFleet(preset, result)) return result;
  throw new Error(`Unable to randomize a legal ${preset} fleet`);
};
