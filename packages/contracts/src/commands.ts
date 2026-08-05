import { z } from 'zod';
import { presetSchema } from './presets.js';
import { coordinateSchema } from './coordinates.js';
import { runtimeIdSchema, tabIdSchema } from './identity.js';
import { placementFleetSchema } from './fleet.js';

export const actionIdSchema = z.string().regex(/^act_[A-Za-z0-9_-]{3,64}$/);
const envelope = <Type extends string, T extends z.ZodTypeAny>(
  type: Type,
  payload: T,
) =>
  z
    .object({ actionId: actionIdSchema, type: z.literal(type), payload })
    .strict();
const empty = z.object({}).strict();
export const identifyPayloadSchema = z
  .object({
    name: z.string(),
    tabId: tabIdSchema,
    runtimeId: runtimeIdSchema.optional(),
  })
  .strict();

const commandSchemas = [
  envelope('identify', identifyPayloadSchema),
  envelope('rename', z.object({ name: z.string() }).strict()),
  envelope('leave', empty),
  envelope('lobby.snapshot', empty),
  envelope('lobby.create', z.object({ preset: presetSchema }).strict()),
  envelope('lobby.join', z.object({ gameId: z.string().min(1) }).strict()),
  envelope('lobby.quick-play', empty),
  envelope('lobby.cancel', empty),
  envelope('fleet.ready', z.object({ ships: placementFleetSchema }).strict()),
  envelope('game.shot', z.object({ coordinate: coordinateSchema }).strict()),
  envelope('game.leave', empty),
  envelope('game.retry', empty),
  envelope('game.snapshot', empty),
  envelope('rematch.request', empty),
  envelope('rematch.respond', z.object({ accept: z.boolean() }).strict()),
] as const;

export const commandSchema = z.discriminatedUnion('type', commandSchemas);
export type Command = z.infer<typeof commandSchema>;
