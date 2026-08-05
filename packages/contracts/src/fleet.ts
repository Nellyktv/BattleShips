import { z } from 'zod';
import { coordinateSchema } from './coordinates.js';

const shipFields = {
  length: z.number().int().min(2),
  cells: z.array(coordinateSchema).min(1),
};

const validateCellCardinality = (
  ship: { length: number; cells: string[] },
  context: z.RefinementCtx,
) => {
  if (ship.cells.length !== ship.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cells'],
      message: 'ship cells must match ship length',
    });
  }
};

export const placementShipSchema = z
  .object(shipFields)
  .strict()
  .superRefine(validateCellCardinality);

export const revealedShipSchema = z
  .object({ ...shipFields, hits: z.array(coordinateSchema).optional() })
  .strict()
  .superRefine(validateCellCardinality);

export const placementFleetSchema = z.array(placementShipSchema).min(1);
export const fleetSchema = z.array(revealedShipSchema);

export const shipSchema = revealedShipSchema;
export type PlacementShip = z.infer<typeof placementShipSchema>;
export type Ship = z.infer<typeof shipSchema>;
export type Fleet = z.infer<typeof fleetSchema>;
