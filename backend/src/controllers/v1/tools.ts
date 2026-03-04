import { Router } from 'express';
import { z } from 'zod';
import { ZodBodyValidator, ZodParamValidator, ZodQueryValidator } from '../../middleware/zod.middleware.js';
import AgentActionDao from '../../lib/dao/agent-action.dao.js';
import AgentToolDao from '../../lib/dao/agent-tool.dao.js';
import ToolDao from '../../lib/dao/tool.dao.js';
import { getToolManifest } from '../../lib/tools/registry.js';
import { NotFoundError, BadRequestError } from '../../lib/errors/http.errors.js';

export const router = Router();

// ─── Search ──────────────────────────────────────────────────────────────────

const SearchBodySchema = z.object({
  query: z.string().min(1),
  agent_id: z.number().int().positive(),
});

router.post('/search', ZodBodyValidator(SearchBodySchema), async (req, res) => {
  const { query, agent_id } = req.body;
  const toolsConfig = req.app.config.loadConfig(
    'tools',
    (await import('../../lib/config/tools.schema.js')).ToolsConfigSchema
  );

  const { discoverTools } = await import('../../lib/tools/search.js');
  const results = await discoverTools(
    query,
    agent_id,
    toolsConfig.discovery_max_results,
    toolsConfig.discovery_keyword_min_results,
    (configId) => req.app.tools.getServerStatus(configId),
  );

  res.json(results);
});

// ─── MCP Status ───────────────────────────────────────────────────────────────
// Must be defined before /:id to avoid route conflict

router.get('/mcp/status', (req, res) => {
  res.json(req.app.tools.getAllMcpStatuses());
});

// ─── Actions ─────────────────────────────────────────────────────────────────

const CreateActionBodySchema = z.object({
  agent_id: z.number().int().positive(),
  thread_id: z.string().min(1),
  description: z.string().min(1),
  action: z.array(z.object({ tool_id: z.string(), params: z.record(z.string(), z.unknown()) })),
});

router.post('/actions', ZodBodyValidator(CreateActionBodySchema), async (req, res) => {
  const { agent_id, thread_id, description, action } = req.body;
  const { v4: uuidv4 } = await import('uuid');

  const toolsConfig = req.app.config.loadConfig(
    'tools',
    (await import('../../lib/config/tools.schema.js')).ToolsConfigSchema
  );

  const { getUserTurnCheckpointId } = await import('../../lib/tools/checkpoint.js');
  const userTurnCpId = await getUserTurnCheckpointId(thread_id);

  const actionRecord = await AgentActionDao.createAgentAction({
    id: uuidv4(),
    agent_id,
    thread_id,
    user_turn_checkpoint_id: userTurnCpId,
    description,
    action,
    expires_at: new Date(Date.now() + toolsConfig.permission_request_ttl_seconds * 1000),
  });

  res.status(201).json(actionRecord);
});

const ListActionsQuerySchema = z.object({
  agentId: z.coerce.number().int().positive(),
});

router.get('/actions', ZodQueryValidator(ListActionsQuerySchema), async (req, res) => {
  const { agentId } = res.locals.query as z.infer<typeof ListActionsQuerySchema>;
  const actions = await AgentActionDao.listPendingForAgent(agentId);
  res.json(actions);
});

const ActionIdParamSchema = z.object({ id: z.string().uuid() });

router.get('/actions/:id', ZodParamValidator(ActionIdParamSchema), async (req, res) => {
  const action = await AgentActionDao.getAgentAction(req.params.id as string);
  if (!action) throw new NotFoundError('AgentAction not found');
  res.json(action);
});

const UpdateActionBodySchema = z.object({
  status: z.enum(['Approved', 'Denied']),
  justification: z.string().optional(),
});

router.patch('/actions/:id', ZodParamValidator(ActionIdParamSchema), ZodBodyValidator(UpdateActionBodySchema), async (req, res) => {
  const action = await AgentActionDao.getAgentAction(req.params.id as string);
  if (!action) throw new NotFoundError('AgentAction not found');
  if (action.status !== 'Pending') {
    throw new BadRequestError(`Cannot update action with status: ${action.status}`);
  }

  const updated = await AgentActionDao.updateAgentActionStatus(
    req.params.id as string,
    req.body.status,
    req.body.justification,
  );

  // Emit both the legacy named event and a structured `action_resolved` event.
  // The legacy event (`action:<agent_id>:<action_id>:<status>`) is kept for any
  // future low-level listeners. The `action_resolved` event is what AgentManager
  // listens to in order to resume the suspended LangGraph graph.
  req.app.agents?.emit(`action:${action.agent_id}:${req.params.id}:${req.body.status.toLowerCase()}`);
  req.app.agents?.emit('action_resolved', {
    agentId: action.agent_id,
    actionId: req.params.id,
    threadId: action.thread_id,
    status: req.body.status.toLowerCase() as 'approved' | 'denied',
  });

  res.json(updated);
});

router.post('/actions/:id/execute', ZodParamValidator(ActionIdParamSchema), async (req, res) => {
  const action = await AgentActionDao.getAgentAction(req.params.id as string);
  if (!action) throw new NotFoundError('AgentAction not found');
  if (action.status !== 'Approved') {
    throw new BadRequestError(`Cannot execute action with status: ${action.status}`);
  }

  const { executeTool } = await import('../../lib/tools/executor.js');
  const batch = action.action as unknown as import('../../lib/tools/models.js').ToolCallBatch;

  await AgentActionDao.updateAgentActionStatus(req.params.id as string, 'InProgress');

  const activeLangChainTools = new Map(
    batch.map(c => {
      const t = req.app.tools.getActiveTool(c.tool_id);
      return [c.tool_id, t!] as [string, NonNullable<typeof t>];
    }).filter(([, t]) => !!t)
  );

  const results = await Promise.all(
    batch.map(c =>
      executeTool(c, action.agent_id, activeLangChainTools as any, req.app.tools.getServerStatus.bind(req.app.tools), req.params.id as string)
    )
  );

  await AgentActionDao.updateAgentActionStatus(req.params.id as string, 'Completed');

  res.json({ description: action.description, results });
});

// ─── Tool manifest ────────────────────────────────────────────────────────────

const ToolIdParamSchema = z.object({ id: z.string().min(1) });
const ToolQuerySchema = z.object({ agent_id: z.coerce.number().int().positive().optional() });

router.get('/:id', ZodParamValidator(ToolIdParamSchema), ZodQueryValidator(ToolQuerySchema), async (req, res) => {
  const { agent_id } = res.locals.query ?? {};
  const toolId = decodeURIComponent(req.params.id as string);

  if (agent_id) {
    const manifest = await getToolManifest(toolId, agent_id);
    if (!manifest) throw new NotFoundError('Tool not found');
    return res.json(manifest);
  }

  const tool = await ToolDao.getTool(toolId);
  if (!tool) throw new NotFoundError('Tool not found');
  return res.json(tool);
});

// ─── Agent tool assignments ───────────────────────────────────────────────────

const AgentToolParamSchema = z.object({ agentId: z.coerce.number().int().positive() });

router.get('/agent/:agentId', ZodParamValidator(AgentToolParamSchema), async (req, res) => {
  const tools = await AgentToolDao.listAgentTools(Number(req.params.agentId));
  res.json(tools);
});

const UpsertAgentToolBodySchema = z.object({
  tool_id: z.number().int().positive(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
});

router.put('/agent/:agentId', ZodParamValidator(AgentToolParamSchema), ZodBodyValidator(UpsertAgentToolBodySchema), async (req, res) => {
  const agentId = Number(req.params.agentId);
  const { tool_id, tier } = req.body;

  // Prevent overriding locked_tier
  const tool = await ToolDao.getToolById(tool_id);
  if (!tool) throw new NotFoundError('Tool not found');
  if (tool.locked_tier !== null) {
    throw new BadRequestError('Cannot override tier for a built-in system tool.');
  }

  const result = await AgentToolDao.upsertAgentTool(agentId, tool_id, tier);
  res.json(result);
});

const DeleteAgentToolParamSchema = z.object({
  agentId: z.coerce.number().int().positive(),
  toolId: z.coerce.number().int().positive(),
});

router.delete('/agent/:agentId/:toolId', ZodParamValidator(DeleteAgentToolParamSchema), async (req, res) => {
  const { agentId, toolId } = req.params as any;

  const tool = await ToolDao.getToolById(Number(toolId));
  if (!tool) throw new NotFoundError('Tool not found');
  if (tool.locked_tier !== null) {
    throw new BadRequestError('Cannot remove a built-in system tool.');
  }

  await AgentToolDao.deleteAgentTool(Number(agentId), Number(toolId));
  res.status(204).send();
});

export default router;
