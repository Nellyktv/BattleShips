import { z } from 'zod';
import { playerIdentitySchema, playerStatsSchema } from './identity.js';
import { presetSchema } from './presets.js';
import { coordinateSchema } from './coordinates.js';
import { fleetSchema } from './fleet.js';

const playerStatusSchema = z.enum(['placing', 'ready', 'disconnected']);
const shotSchema = z
  .object({
    coordinate: coordinateSchema,
    result: z.enum(['miss', 'hit', 'sunk']),
  })
  .strict();

const selfPlayerSchema = z
  .object({
    playerId: z.string(),
    name: z.string(),
    status: playerStatusSchema,
    fleet: fleetSchema.optional(),
    stats: playerStatsSchema.optional(),
  })
  .strict();

const revealedSelfSchema = selfPlayerSchema.extend({
  fleet: fleetSchema.min(1),
});

export const lobbySnapshotSchema = z
  .object({
    kind: z.literal('lobby'),
    player: playerIdentitySchema,
    waitingGames: z.array(
      z
        .object({
          gameId: z.string(),
          hostName: z.string(),
          preset: presetSchema,
        })
        .strict(),
    ),
    activeGames: z.array(
      z
        .object({
          gameId: z.string(),
          players: z.array(z.string()).length(2),
          preset: presetSchema,
          phase: z.enum(['placing', 'battle', 'paused']),
        })
        .strict(),
    ),
  })
  .strict();

const gameSnapshotBaseSchema = z
  .object({
    kind: z.literal('game').default('game'),
    gameId: z.string().min(1),
    previousGameId: z.string().min(1).optional(),
    preset: presetSchema,
    self: selfPlayerSchema,
    opponent: z
      .object({
        playerId: z.string(),
        name: z.string(),
        status: playerStatusSchema,
      })
      .strict(),
    turnPlayerId: z.string().nullable(),
    reconnectDeadline: z.number().int().nonnegative().nullable(),
    shots: z.array(shotSchema),
    opponentShots: z.array(shotSchema).optional(),
    winnerPlayerId: z.string().nullable().optional(),
  })
  .strict();

const revealedOpponentSchema = z
  .object({
    playerId: z.string(),
    name: z.string(),
    status: playerStatusSchema,
    fleet: fleetSchema.min(1),
  })
  .strict();

const battleOpponentSchema = gameSnapshotBaseSchema.shape.opponent.extend({
  sunkShips: fleetSchema,
});

const idleRematchSchema = z.object({ status: z.literal('idle') }).strict();
const pendingRematchSchema = z
  .object({
    status: z.enum(['requested-by-self', 'requested-by-opponent']),
    expiresAt: z.number().int().nonnegative(),
  })
  .strict();

export const gameSnapshotSchema = z.discriminatedUnion('phase', [
  gameSnapshotBaseSchema.extend({ phase: z.literal('waiting') }),
  gameSnapshotBaseSchema.extend({ phase: z.literal('deployment') }),
  gameSnapshotBaseSchema.extend({
    phase: z.literal('battle'),
    opponent: battleOpponentSchema,
  }),
  gameSnapshotBaseSchema.extend({
    phase: z.literal('paused'),
    opponent: battleOpponentSchema,
  }),
  gameSnapshotBaseSchema.extend({
    phase: z.literal('complete'),
    self: revealedSelfSchema,
    opponent: revealedOpponentSchema,
    completionReason: z.enum(['sunk', 'forfeit']),
    rematch: z.union([idleRematchSchema, pendingRematchSchema]),
  }),
]);

export const snapshotSchema = z.union([
  lobbySnapshotSchema,
  gameSnapshotSchema,
]);

export type LobbySnapshot = z.infer<typeof lobbySnapshotSchema>;
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
