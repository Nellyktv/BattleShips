import { describe, expect, it } from 'vitest';
import { BOARD_ORIGIN, pointToCell } from './coordinates.js';

describe('pointToCell', () => {
  it('maps a board-local point to the containing cell', () => {
    expect(pointToCell({ x: 74, y: 129 }, 10, 40)).toEqual({
      column: 1,
      row: 3,
    });
  });

  it('returns undefined outside the board', () => {
    expect(pointToCell({ x: -1, y: 0 }, 10, 40)).toBeUndefined();
    expect(pointToCell({ x: 400, y: 0 }, 10, 40)).toBeUndefined();
  });

  it('maps stage points at the inset boundary to board cells', () => {
    expect(
      pointToCell(
        { x: BOARD_ORIGIN.x, y: BOARD_ORIGIN.y },
        10,
        40,
        BOARD_ORIGIN,
      ),
    ).toEqual({ column: 0, row: 0 });
    expect(
      pointToCell(
        { x: BOARD_ORIGIN.x + 40, y: BOARD_ORIGIN.y + 40 },
        10,
        40,
        BOARD_ORIGIN,
      ),
    ).toEqual({ column: 1, row: 1 });
  });

  it('rejects points before the inset and at the exclusive board edge', () => {
    expect(
      pointToCell(
        { x: BOARD_ORIGIN.x - 0.1, y: BOARD_ORIGIN.y },
        10,
        40,
        BOARD_ORIGIN,
      ),
    ).toBeUndefined();
    expect(
      pointToCell(
        { x: BOARD_ORIGIN.x + 400, y: BOARD_ORIGIN.y },
        10,
        40,
        BOARD_ORIGIN,
      ),
    ).toBeUndefined();
  });
});
