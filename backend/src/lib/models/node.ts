import {z} from 'zod';

export const BaseNodeSchema = z.object({
  node_id: z.number().optional(),
  type: z.string(),
  properties: z.record(z.string(), z.any()),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export interface Node {

  created_at?: Date;
  updated_at?: Date;
}