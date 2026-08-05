import type { Preset } from '@battleships/contracts';

export type BoardContext = 'deployment' | 'battle';

export const BOARD_CELL_SIZES: Record<BoardContext, Record<Preset, number>> = {
  deployment: {
    'quick-8x8': 44,
    'classic-10x10': 40,
    'grand-12x12': 34,
  },
  battle: {
    'quick-8x8': 42,
    'classic-10x10': 38,
    'grand-12x12': 34,
  },
};
