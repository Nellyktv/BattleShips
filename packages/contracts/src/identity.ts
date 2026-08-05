import { z } from 'zod';

export const playerStatsSchema = z
  .object({
    games: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    losses: z.number().int().nonnegative(),
  })
  .strict();

export const playerIdentitySchema = z
  .object({
    playerId: z.string().min(1),
    name: z.string().min(1),
    stats: playerStatsSchema,
  })
  .strict();

export const tabIdSchema = z.string().uuid();
export const runtimeIdSchema = z.string().uuid();
export type TabId = z.infer<typeof tabIdSchema>;

export type PlayerStats = z.infer<typeof playerStatsSchema>;
export type PlayerIdentity = z.infer<typeof playerIdentitySchema>;
