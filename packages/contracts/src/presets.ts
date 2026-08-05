import { z } from 'zod';

export const presetSchema = z.enum([
  'quick-8x8',
  'classic-10x10',
  'grand-12x12',
]);
export type Preset = z.infer<typeof presetSchema>;

export const presets = {
  'quick-8x8': { boardSize: 8, shipLengths: [4, 3, 3, 2] },
  'classic-10x10': { boardSize: 10, shipLengths: [5, 4, 3, 3, 2] },
  'grand-12x12': { boardSize: 12, shipLengths: [5, 4, 4, 3, 3, 2, 2] },
} as const satisfies Record<
  Preset,
  { boardSize: number; shipLengths: readonly number[] }
>;
