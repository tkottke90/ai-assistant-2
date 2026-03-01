import { z } from 'zod';

/**
 * Valid memory type categories.
 * The agent chooses which type to assign — this is the only structural constraint.
 */
export const MemoryTypeEnum = z.enum(['semantic', 'episodic', 'procedural']);
export type MemoryType = z.infer<typeof MemoryTypeEnum>;

/**
 * Prefixes the memory category with 'memory:' for Node.type storage.
 * e.g. 'semantic' -> 'memory:semantic'
 */
export function toNodeType(type: MemoryType): string {
  return `memory:${type}`;
}

/**
 * Extracts the memory category from a Node.type value.
 * e.g. 'memory:semantic' -> 'semantic'
 * Returns null if the type doesn't match the memory pattern.
 */
export function fromNodeType(nodeType: string): MemoryType | null {
  if (!nodeType.startsWith('memory:')) return null;
  const category = nodeType.slice('memory:'.length);
  const parsed = MemoryTypeEnum.safeParse(category);
  return parsed.success ? parsed.data : null;
}

/**
 * Schema for the properties JSON stored in a memory Node.
 * agent_id and content are required; everything else is agent-defined.
 */
export const MemoryPropertiesSchema = z.object({
  agent_id: z.number(),
  content: z.string(),
}).passthrough(); // Allow arbitrary additional fields

export type MemoryProperties = z.infer<typeof MemoryPropertiesSchema>;

/**
 * Schema for a memory record returned from the database.
 */
export const MemorySchema = z.object({
  node_id: z.number(),
  type: z.string(),
  properties: MemoryPropertiesSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Memory = z.infer<typeof MemorySchema>;

/**
 * Schema for creating a new memory.
 */
export const CreateMemorySchema = z.object({
  type: MemoryTypeEnum,
  content: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type CreateMemoryInput = z.infer<typeof CreateMemorySchema>;

/**
 * Schema for updating an existing memory.
 */
export const UpdateMemorySchema = z.object({
  content: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type UpdateMemoryInput = z.infer<typeof UpdateMemorySchema>;

/**
 * Schema for a memory search result (includes FTS rank score).
 */
export const MemorySearchResultSchema = MemorySchema.extend({
  rank: z.number().optional(),
});

export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;

/**
 * Valid relationship types for memory edges.
 * The agent defines the relationship string — these are suggestions.
 */
export const MemoryEdgeSchema = z.object({
  source_id: z.number(),
  target_id: z.number(),
  relationship: z.string(),
  properties: z.record(z.string(), z.any()).optional(),
});

export type MemoryEdgeInput = z.infer<typeof MemoryEdgeSchema>;
