import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import MemoryDao from '../dao/memory.dao.js';
import { MemoryTypeEnum } from '../models/memory.js';

/**
 * Creates an array of LangChain tools for agent memory management.
 * Each tool is scoped to the given agent ID — the agent can only access its own memories.
 *
 * @param agentId - The agent's database ID, used to scope all memory operations
 * @returns An array of LangChain tools for memory CRUD, search, and linking
 */
export function createMemoryTools(agentId: number) {
  const storeMemory = tool(
    async (input) => {
      const memory = await MemoryDao.createMemory(
        agentId,
        input.type,
        input.content,
        input.metadata
      );

      return JSON.stringify({
        success: true,
        memory_id: memory.node_id,
        type: memory.type,
        message: `Memory stored successfully with ID ${memory.node_id}`,
        action: 'Stored a new memory'
      });
    },
    {
      name: 'store_memory',
      description:
        'Store a new memory for future reference. Use this when you learn something worth remembering across conversations. ' +
        'Choose the appropriate type: "semantic" for facts/knowledge/preferences, "episodic" for experiences/actions/outcomes, ' +
        '"procedural" for learned procedures/workflows/strategies.',
      schema: z.object({
        type: MemoryTypeEnum.describe(
          'The category of memory: "semantic" for facts, "episodic" for experiences, "procedural" for procedures'
        ),
        content: z.string().describe(
          'The content of the memory. Be descriptive and include relevant context so this memory is useful when recalled later.'
        ),
        metadata: z.record(z.string(), z.any()).optional().describe(
          'Optional additional structured data to store alongside the memory content'
        ),
      }),
    }
  );

  const searchMemories = tool(
    async (input) => {
      const results = await MemoryDao.searchMemories(
        agentId,
        input.query,
        input.type ?? undefined,
        input.limit ?? 10
      );

      if (results.length === 0) {
        return JSON.stringify({
          success: true,
          results: [],
          message: 'No memories found matching your query.',
        });
      }

      return JSON.stringify({
        success: true,
        results: results.map((r) => ({
          memory_id: r.node_id,
          type: r.type,
          content: r.properties.content,
          metadata: Object.fromEntries(
            Object.entries(r.properties).filter(
              ([k]) => k !== 'agent_id' && k !== 'content'
            )
          ),
          created_at: r.created_at,
          rank: r.rank,
        })),
        message: `Found ${results.length} matching memories.`,
      });
    },
    {
      name: 'search_memories',
      description:
        'Search your memories using a text query. Returns memories ranked by relevance. ' +
        'Use this to recall past knowledge, experiences, or procedures before responding to a question or starting a task.',
      schema: z.object({
        query: z.string().describe(
          'The search query. Use descriptive terms related to what you want to recall.'
        ),
        type: MemoryTypeEnum.nullable().default(null).describe(
          'Optional filter by memory type: "semantic", "episodic", or "procedural". Leave empty to search all types.'
        ),
        limit: z.number().int().min(1).max(50).default(10).describe(
          'Maximum number of results to return (default: 10)'
        ),
      }),
    }
  );

  const recallMemory = tool(
    async (input) => {
      const memory = await MemoryDao.getMemory(input.memory_id, agentId);

      if (!memory) {
        return JSON.stringify({
          success: false,
          message: `Memory with ID ${input.memory_id} not found.`,
        });
      }

      return JSON.stringify({
        success: true,
        memory: {
          memory_id: memory.node_id,
          type: memory.type,
          content: memory.properties.content,
          metadata: Object.fromEntries(
            Object.entries(memory.properties).filter(
              ([k]) => k !== 'agent_id' && k !== 'content'
            )
          ),
          created_at: memory.created_at,
          updated_at: memory.updated_at,
        },
      });
    },
    {
      name: 'recall_memory',
      description:
        'Retrieve a specific memory by its ID. Use this after finding a memory via search to get its full details.',
      schema: z.object({
        memory_id: z.number().int().describe('The ID of the memory to retrieve'),
      }),
    }
  );

  const updateMemory = tool(
    async (input) => {
      const updated = await MemoryDao.updateMemory(
        input.memory_id,
        agentId,
        input.content ?? undefined,
        input.metadata ?? undefined
      );

      if (!updated) {
        return JSON.stringify({
          success: false,
          message: `Memory with ID ${input.memory_id} not found or not owned by you.`,
        });
      }

      return JSON.stringify({
        success: true,
        memory_id: updated.node_id,
        message: `Memory ${input.memory_id} updated successfully.`,
      });
    },
    {
      name: 'update_memory',
      description:
        'Update an existing memory with new content or metadata. Use this when information changes or you want to refine a stored memory.',
      schema: z.object({
        memory_id: z.number().int().describe('The ID of the memory to update'),
        content: z.string().nullable().default(null).describe(
          'New content for the memory. Leave empty to keep existing content.'
        ),
        metadata: z.record(z.string(), z.any()).nullable().default(null).describe(
          'New or additional metadata to merge into the memory'
        ),
      }),
    }
  );

  const forgetMemory = tool(
    async (input) => {
      const deleted = await MemoryDao.deleteMemory(input.memory_id, agentId);

      return JSON.stringify({
        success: deleted,
        message: deleted
          ? `Memory ${input.memory_id} deleted successfully.`
          : `Memory with ID ${input.memory_id} not found or not owned by you.`,
      });
    },
    {
      name: 'forget_memory',
      description:
        'Delete a memory that is no longer accurate or useful. Use this to keep your memory clean and relevant.',
      schema: z.object({
        memory_id: z.number().int().describe('The ID of the memory to delete'),
      }),
    }
  );

  const linkMemories = tool(
    async (input) => {
      const linked = await MemoryDao.linkMemories(
        agentId,
        input.source_id,
        input.target_id,
        input.relationship,
        input.properties ?? undefined
      );

      return JSON.stringify({
        success: linked,
        message: linked
          ? `Linked memory ${input.source_id} → ${input.target_id} with relationship "${input.relationship}".`
          : 'Failed to link memories. One or both memory IDs may be invalid or not owned by you.',
      });
    },
    {
      name: 'link_memories',
      description:
        'Create a named relationship between two memories. Use this to build a knowledge graph connecting related concepts, experiences, or procedures.',
      schema: z.object({
        source_id: z.number().int().describe('The ID of the source memory'),
        target_id: z.number().int().describe('The ID of the target memory'),
        relationship: z.string().describe(
          'The type of relationship (e.g., "relates_to", "supersedes", "derived_from", "caused_by", "prerequisite_for")'
        ),
        properties: z.record(z.string(), z.any()).nullable().default(null).describe(
          'Optional metadata about the relationship'
        ),
      }),
    }
  );

  const getRelated = tool(
    async (input) => {
      const related = await MemoryDao.getLinkedMemories(
        input.memory_id,
        agentId,
        input.relationship ?? undefined
      );

      if (related.length === 0) {
        return JSON.stringify({
          success: true,
          results: [],
          message: `No linked memories found for memory ${input.memory_id}.`,
        });
      }

      return JSON.stringify({
        success: true,
        results: related.map((r) => ({
          memory_id: r.node_id,
          type: r.type,
          content: r.properties.content,
          created_at: r.created_at,
        })),
        message: `Found ${related.length} linked memories.`,
      });
    },
    {
      name: 'get_related',
      description:
        'Get memories linked to a specific memory. Optionally filter by relationship type. ' +
        'Use this to explore connections in your knowledge graph.',
      schema: z.object({
        memory_id: z.number().int().describe('The ID of the memory to find related memories for'),
        relationship: z.string().nullable().default(null).describe(
          'Optional filter by relationship type (e.g., "relates_to", "supersedes"). Leave empty to get all linked memories.'
        ),
      }),
    }
  );

  return [
    storeMemory,
    searchMemories,
    recallMemory,
    updateMemory,
    forgetMemory,
    linkMemories,
    getRelated,
  ];
}
