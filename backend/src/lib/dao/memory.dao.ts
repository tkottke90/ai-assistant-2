import { prisma } from '../database.js';
import { PaginationQuery, createPagination } from '../types/pagination.js';
import {
  type MemoryType,
  type Memory,
  type MemorySearchResult,
  MemorySchema,
  MemorySearchResultSchema,
  toNodeType,
} from '../models/memory.js';

/**
 * Create a new memory node for an agent.
 * FTS5 sync is handled by the database trigger on Node INSERT.
 */
async function createMemory(
  agentId: number,
  type: MemoryType,
  content: string,
  metadata?: Record<string, any>
): Promise<Memory> {
  const node = await prisma.node.create({
    data: {
      type: toNodeType(type),
      properties: {
        agent_id: agentId,
        content,
        ...metadata,
      },
    },
  });

  return MemorySchema.parse(node);
}

/**
 * Get a specific memory by node ID, scoped to the given agent.
 * Returns null if the memory doesn't exist or belongs to another agent.
 */
async function getMemory(nodeId: number, agentId: number): Promise<Memory | null> {
  const node = await prisma.node.findFirst({
    where: {
      node_id: nodeId,
      type: { startsWith: 'memory:' },
    },
  });

  if (!node) return null;

  const properties = node.properties as Record<string, any>;
  if (properties.agent_id !== agentId) return null;

  return MemorySchema.parse(node);
}

/**
 * Full-text search across an agent's memories using FTS5.
 * Queries the memory_fts virtual table and joins back to Node for full records.
 * Results are ordered by FTS5 relevance rank (lower = better match).
 */
async function searchMemories(
  agentId: number,
  query: string,
  type?: MemoryType,
  limit: number = 10
): Promise<MemorySearchResult[]> {
  // Escape FTS5 special characters in the query to prevent syntax errors
  const sanitizedQuery = sanitizeFtsQuery(query);
  if (!sanitizedQuery) return [];

  const typeFilter = type ? toNodeType(type) : null;

  const results = await prisma.$queryRawUnsafe<any[]>(
    `SELECT n.node_id, n.type, n.properties, n.created_at, n.updated_at, f.rank
     FROM memory_fts f
     JOIN Node n ON n.node_id = f.rowid
     WHERE memory_fts MATCH ?
       AND json_extract(n.properties, '$.agent_id') = ?
       ${typeFilter ? 'AND n.type = ?' : ''}
     ORDER BY f.rank
     LIMIT ?`,
    ...[
      sanitizedQuery,
      agentId,
      ...(typeFilter ? [typeFilter] : []),
      limit,
    ]
  );

  return results.map((row) => {
    // Raw query returns properties as a JSON string
    const properties = typeof row.properties === 'string'
      ? JSON.parse(row.properties)
      : row.properties;

    return MemorySearchResultSchema.parse({
      ...row,
      properties,
    });
  });
}

/**
 * Update a memory node's properties. Only updates the fields provided.
 * FTS5 sync is handled by the database trigger on Node UPDATE.
 * Returns null if the memory doesn't exist or belongs to another agent.
 */
async function updateMemory(
  nodeId: number,
  agentId: number,
  content?: string,
  metadata?: Record<string, any>
): Promise<Memory | null> {
  // First verify the memory exists and belongs to this agent
  const existing = await getMemory(nodeId, agentId);
  if (!existing) return null;

  const existingProps = existing.properties as Record<string, any>;
  const updatedProperties = {
    ...existingProps,
    ...(metadata ?? {}),
    ...(content !== undefined ? { content } : {}),
    agent_id: agentId, // Ensure agent_id is never overwritten
  };

  const updated = await prisma.node.update({
    where: { node_id: nodeId },
    data: { properties: updatedProperties },
  });

  return MemorySchema.parse(updated);
}

/**
 * Delete a memory node. Cascading delete removes associated edges.
 * FTS5 cleanup is handled by the database trigger on Node DELETE.
 * Returns true if deleted, false if not found or not owned by this agent.
 */
async function deleteMemory(nodeId: number, agentId: number): Promise<boolean> {
  const existing = await getMemory(nodeId, agentId);
  if (!existing) return false;

  await prisma.node.delete({
    where: { node_id: nodeId },
  });

  return true;
}

/**
 * Create a relationship edge between two memory nodes.
 * Both memories must belong to the given agent.
 */
async function linkMemories(
  agentId: number,
  sourceId: number,
  targetId: number,
  relationship: string,
  properties?: Record<string, any>
): Promise<boolean> {
  // Verify both memories exist and belong to this agent
  const [source, target] = await Promise.all([
    getMemory(sourceId, agentId),
    getMemory(targetId, agentId),
  ]);

  if (!source || !target) return false;

  await prisma.edge.create({
    data: {
      source_id: sourceId,
      target_id: targetId,
      type: `memory:${relationship}`,
      properties: properties ?? {},
    },
  });

  return true;
}

/**
 * Get memories linked to a given memory node via edges.
 * Optionally filter by relationship type.
 */
async function getLinkedMemories(
  nodeId: number,
  agentId: number,
  relationship?: string
): Promise<Memory[]> {
  // Verify source memory belongs to this agent
  const existing = await getMemory(nodeId, agentId);
  if (!existing) return [];

  const typeFilter = relationship ? `memory:${relationship}` : undefined;

  // Get both outgoing and incoming edges
  const edges = await prisma.edge.findMany({
    where: {
      OR: [
        { source_id: nodeId, ...(typeFilter ? { type: typeFilter } : { type: { startsWith: 'memory:' } }) },
        { target_id: nodeId, ...(typeFilter ? { type: typeFilter } : { type: { startsWith: 'memory:' } }) },
      ],
    },
    include: {
      source: true,
      target: true,
    },
  });

  // Collect the linked node IDs (the "other" side of each edge)
  const linkedNodes = edges.map((edge) => {
    const linkedNode = edge.source_id === nodeId ? edge.target : edge.source;
    return linkedNode;
  });

  // Filter to only memories belonging to this agent
  return linkedNodes
    .filter((node) => {
      const props = node.properties as Record<string, any>;
      return props.agent_id === agentId && node.type.startsWith('memory:');
    })
    .map((node) => MemorySchema.parse(node));
}

/**
 * List memories for an agent, optionally filtered by type, with pagination.
 */
async function listMemories(
  agentId: number,
  type?: MemoryType,
  paginationQuery?: Partial<PaginationQuery>
) {
  const { page, take, skip } = paginationQuery ?? { page: 1, take: 20, skip: 0 };

  const where = {
    type: type ? toNodeType(type) : { startsWith: 'memory:' as const },
    properties: {
      path: '$.agent_id',
      equals: agentId,
    },
  };

  const [totalCount, memories] = await Promise.all([
    prisma.node.count({ where }),
    prisma.node.findMany({
      where,
      skip,
      take,
      orderBy: [{ type: 'asc' }, { created_at: 'desc' }],
    }),
  ]);

  return {
    pagination: createPagination(page ?? 1, totalCount, take ?? 20),
    data: memories.map((node) => MemorySchema.parse(node)),
  };
}

/**
 * Bulk-delete all memory nodes (and their edges) for a given agent ID.
 * Intended for evaluation cleanup: call with a negative agent ID (e.g. -evaluationId)
 * before starting a new evaluation run to ensure a clean slate.
 * FTS5 index cleanup is handled automatically by the per-row delete trigger.
 * Returns the number of nodes deleted.
 */
async function deleteEvaluationMemories(agentId: number): Promise<number> {
  const where = {
    type: { startsWith: 'memory:' as const },
    properties: {
      path: '$.agent_id',
      equals: agentId,
    },
  };

  const nodeIds = await prisma.node.findMany({ where, select: { node_id: true } });
  const ids = nodeIds.map((n) => n.node_id);

  if (ids.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    // Delete edges first — FK cascade is not guaranteed at runtime
    await tx.edge.deleteMany({
      where: {
        OR: [
          { source_id: { in: ids } },
          { target_id: { in: ids } },
        ],
      },
    });

    await tx.node.deleteMany({ where });
  });

  return ids.length;
}

/**
 * Sanitize a user query string for FTS5 MATCH syntax.
 * Wraps each word in double quotes to treat them as literal terms,
 * preventing FTS5 syntax errors from special characters.
 */
function sanitizeFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => `"${word.replace(/"/g, '""')}"`)
    .join(' ');
}

export default {
  createMemory,
  getMemory,
  searchMemories,
  updateMemory,
  deleteMemory,
  linkMemories,
  getLinkedMemories,
  listMemories,
  deleteEvaluationMemories,
};
