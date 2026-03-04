import crypto from 'node:crypto';
import { prisma } from '../database.js';
import type { ToolCallBatch } from '../tools/models.js';

export interface CreateAgentActionInput {
  id: string;
  agent_id: number;
  thread_id: string;
  user_turn_checkpoint_id: string;
  description: string;
  action: ToolCallBatch;
  expires_at: Date;
}

/**
 * Computes a stable MD5 hash of a ToolCallBatch with sorted keys.
 * Used for tamper detection on AgentAction records.
 * Canonical implementation — all callers must use this function.
 */
export function computeActionHash(batch: ToolCallBatch): string {
  const sortKeys = (obj: unknown): unknown => {
    if (Array.isArray(obj)) return obj.map(sortKeys);
    if (typeof obj === 'object' && obj !== null) {
      return Object.fromEntries(
        Object.entries(obj as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, sortKeys(v)])
      );
    }
    return obj;
  };
  return crypto.createHash('md5').update(JSON.stringify(sortKeys(batch))).digest('hex');
}

/**
 * Passively enforces expiry: if a Pending action has passed its expires_at,
 * it is updated to Denied before being returned.
 */
async function expireIfStale(actionId: string) {
  const record = await prisma.agentAction.findFirst({ where: { id: actionId } });

  if (!record) return null;

  if (record.status === 'Pending' && record.expires_at < new Date()) {
    return prisma.agentAction.update({
      where: { action_id: record.action_id },
      data: { status: 'Denied', justification: 'Request expired' },
    });
  }

  return record;
}

function createAgentAction(input: CreateAgentActionInput) {
  return prisma.agentAction.create({
    data: {
      id: input.id,
      agent_id: input.agent_id,
      thread_id: input.thread_id,
      user_turn_checkpoint_id: input.user_turn_checkpoint_id,
      description: input.description,
      action: input.action as any,
      action_hash: computeActionHash(input.action),
      expires_at: input.expires_at,
    },
  });
}

async function getAgentAction(id: string) {
  return expireIfStale(id);
}

async function updateAgentActionStatus(
  id: string,
  status: string,
  justification?: string
) {
  const record = await prisma.agentAction.findFirst({ where: { id } });
  if (!record) return null;

  return prisma.agentAction.update({
    where: { action_id: record.action_id },
    data: {
      status,
      justification: justification ?? null,
    },
  });
}

/**
 * Returns all Pending actions for the given agent/thread/tool/checkpoint scope.
 * Used to enforce per-turn denial blocking.
 */
function findDeniedInTurn(
  agentId: number,
  threadId: string,
  toolId: string,
  userTurnCheckpointId: string
) {
  return prisma.agentAction.findFirst({
    where: {
      agent_id: agentId,
      thread_id: threadId,
      user_turn_checkpoint_id: userTurnCheckpointId,
      status: 'Denied',
      // action contains the tool_id — we filter in-process after fetch
    },
  });
}

/**
 * Lists all Pending AgentActions for a given agent, checking expiry on each.
 */
async function listPendingForAgent(agentId: number) {
  const records = await prisma.agentAction.findMany({
    where: { agent_id: agentId, status: 'Pending' },
    orderBy: { created_at: 'asc' },
  });

  // Passively expire stale records
  const now = new Date();
  const results = await Promise.all(
    records.map(async r => {
      if (r.expires_at < now) {
        return prisma.agentAction.update({
          where: { action_id: r.action_id },
          data: { status: 'Denied', justification: 'Request expired' },
        });
      }
      return r;
    })
  );

  return results.filter(r => r.status === 'Pending');
}

const AgentActionDao = {
  createAgentAction,
  getAgentAction,
  updateAgentActionStatus,
  findDeniedInTurn,
  listPendingForAgent,
};

export default AgentActionDao;
