import { describe, expect, it } from 'vitest';
import {
  isCompleteFleet,
  validatePlacement,
  type PlacementFleet,
} from './index.js';

const validQuickFleet: PlacementFleet = [
  { length: 4, cells: ['A1', 'B1', 'C1', 'D1'] },
  { length: 3, cells: ['A2', 'B2', 'C2'] },
  { length: 3, cells: ['A3', 'B3', 'C3'] },
  { length: 2, cells: ['A4', 'B4'] },
];

describe('placement rules', () => {
  it('accepts a complete preset fleet when ships touch without overlapping', () => {
    expect(validatePlacement('quick-8x8', validQuickFleet)).toEqual({
      valid: true,
    });
    expect(isCompleteFleet('quick-8x8', validQuickFleet)).toBe(true);
  });

  it.each([
    [
      'overlap',
      [
        { length: 4, cells: ['A1', 'B1', 'C1', 'D1'] },
        { length: 3, cells: ['D1', 'E1', 'F1'] },
      ],
    ],
    ['out of bounds', [{ length: 4, cells: ['F1', 'G1', 'H1', 'I1'] }]],
    ['wrong fleet', [{ length: 4, cells: ['A1', 'B1', 'C1', 'D1'] }]],
  ])('rejects %s placement', (_reason, fleet) => {
    expect(validatePlacement('quick-8x8', fleet as PlacementFleet).valid).toBe(
      false,
    );
  });
});
