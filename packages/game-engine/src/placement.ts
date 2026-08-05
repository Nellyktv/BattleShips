import {
  presets,
  type PlacementShip,
  type Preset,
} from '@battleships/contracts';
import { coordinateToPosition } from './coordinates.js';
import type { PlacementFleet } from './types.js';

export type PlacementFailure =
  'wrong-fleet' | 'wrong-ship-shape' | 'out-of-bounds' | 'overlap';
export type PlacementValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: PlacementFailure };

const sameCells = (left: string[], right: string[]) =>
  left.every((cell, index) => cell === right[index]);

const isStraightContiguous = (ship: PlacementShip): boolean => {
  const positions = ship.cells.map(coordinateToPosition);
  const columns = new Set(positions.map(({ column }) => column));
  const rows = new Set(positions.map(({ row }) => row));
  if (columns.size !== 1 && rows.size !== 1) return false;
  const values = [...(columns.size === 1 ? rows : columns)].sort(
    (a, b) => a - b,
  );
  return values.every(
    (value, index) => index === 0 || value === values[index - 1]! + 1,
  );
};

const hasExpectedLengths = (preset: Preset, fleet: PlacementFleet) => {
  const expected = [...presets[preset].shipLengths].sort((a, b) => a - b);
  const actual = fleet.map(({ length }) => length).sort((a, b) => a - b);
  return sameCells(actual.map(String), expected.map(String));
};

export const validatePlacement = (
  preset: Preset,
  fleet: PlacementFleet,
): PlacementValidation => {
  if (!hasExpectedLengths(preset, fleet))
    return { valid: false, reason: 'wrong-fleet' };
  const boardSize = presets[preset].boardSize;
  const occupied = new Set<string>();
  for (const ship of fleet) {
    if (ship.cells.length !== ship.length || !isStraightContiguous(ship)) {
      return { valid: false, reason: 'wrong-ship-shape' };
    }
    for (const cell of ship.cells) {
      const { column, row } = coordinateToPosition(cell);
      if (column >= boardSize || row >= boardSize) {
        return { valid: false, reason: 'out-of-bounds' };
      }
      if (occupied.has(cell)) return { valid: false, reason: 'overlap' };
      occupied.add(cell);
    }
  }
  return { valid: true };
};

export const isCompleteFleet = (
  preset: Preset,
  fleet: PlacementFleet,
): boolean => validatePlacement(preset, fleet).valid;
