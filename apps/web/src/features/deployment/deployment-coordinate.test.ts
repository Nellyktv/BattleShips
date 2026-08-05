import { describe, expect, it } from 'vitest';
import { BOARD_ORIGIN } from '../board/coordinates.js';
import { pointerReleaseToCell } from './deployment-coordinate.js';

describe('pointerReleaseToCell', () => {
  it('maps the release point to the same target cell despite source size and grab offset', () => {
    const overRect = { left: 100, top: 200 };
    const targetRelease = {
      clientX: overRect.left + BOARD_ORIGIN.x + 2 * 44 + 22,
      clientY: overRect.top + BOARD_ORIGIN.y + 3 * 44 + 22,
    };
    const drops = [
      {
        source: { width: 100, height: 40 },
        activatorEvent: {
          type: 'pointerdown',
          clientX: 10,
          clientY: 30,
        } as PointerEvent,
        delta: { x: targetRelease.clientX - 10, y: targetRelease.clientY - 30 },
      },
      {
        source: { width: 220, height: 80 },
        activatorEvent: {
          type: 'pointerdown',
          clientX: 80,
          clientY: 50,
        } as PointerEvent,
        delta: { x: targetRelease.clientX - 80, y: targetRelease.clientY - 50 },
      },
    ];

    expect(
      drops.map(({ activatorEvent, delta }) =>
        pointerReleaseToCell(
          activatorEvent,
          delta,
          overRect,
          10,
          44,
          BOARD_ORIGIN,
        ),
      ),
    ).toEqual([
      { column: 2, row: 3 },
      { column: 2, row: 3 },
    ]);
  });
});
