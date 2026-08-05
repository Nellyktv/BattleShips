import { z } from 'zod';

export const coordinateSchema = z.string().regex(/^[A-L](?:[1-9]|1[0-2])$/);
export type Coordinate = z.infer<typeof coordinateSchema>;
