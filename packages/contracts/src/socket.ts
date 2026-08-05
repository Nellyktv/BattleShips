import { z } from 'zod';
import { actionIdSchema } from './commands.js';
import { runtimeIdSchema } from './identity.js';
import { snapshotSchema } from './snapshots.js';

export const errorCodeSchema = z.enum([
  'invalid-command',
  'not-identified',
  'invalid-state',
  'not-authorized',
  'not-your-turn',
  'duplicate-shot',
  'invalid-placement',
  'game-not-found',
  'session-replaced',
  'runtime-reset',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const serverAckSchema = z.union([
  z
    .object({
      actionId: actionIdSchema,
      ok: z.literal(true),
      snapshot: snapshotSchema,
      runtimeId: runtimeIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      actionId: actionIdSchema,
      ok: z.literal(false),
      error: z.object({ code: errorCodeSchema, message: z.string() }),
    })
    .strict(),
]);

export const serverEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), snapshot: snapshotSchema }),
  z.object({ type: z.literal('session-replaced') }),
  z.object({ type: z.literal('runtime-reset') }),
  z.object({
    type: z.literal('command-error'),
    actionId: actionIdSchema,
    error: z.object({ code: errorCodeSchema, message: z.string() }),
  }),
]);

export type ServerAck = z.infer<typeof serverAckSchema>;
export type ServerEvent = z.infer<typeof serverEventSchema>;
export type SocketEventMap = {
  command: { command: z.infer<typeof import('./commands.js').commandSchema> };
  ack: ServerAck;
  event: ServerEvent;
};
