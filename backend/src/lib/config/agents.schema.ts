import { z } from 'zod';

export const ScratchpadConfigSchema = z.object({
  llm: z.string()
    .describe('Selects the LLM API to use for managing the scratchpad. Must match an alias defined in the llm.apis array of the main config.')
    .optional(),
  
  model: z.string()
    .describe('Selects the model to use for managing the scratchpad. Overrides the defaultModel specified in the selected LLM API config. Must be a model available from that API.')
    .optional(),

  recentTurns: z.number()
    .describe('Number of recent turns (human + assistant messages) to include in the scratchpad context for reflection and operations.')
    .default(8),

  selectionCredit: z.number()
    .describe('Amount of "credit" given for selecting a message or tool use in the reflection process. Higher values make it more likely that the selected item will be included in the scratchpad context, even if it is not among the most recent turns or highest-scoring items.')
    .default(2),

  sectionCreditCap: z.number()
    .describe('Maximum total credit that can be applied to selected items. This prevents the scratchpad context becoming immortal, ensuring a balance between recency and relevance.')
    .default(10),

  graveyardTTL: z.number()
    .describe('Time-to-live (in number of turns) for items moved to the graveyard. After this many turns have passed, the item will be permanently removed from the scratchpad memory. This allows the scratchpad to forget old information that may no longer be relevant.')
    .default(30),

  initialTTL: z.object({
    tool: z.number()
      .describe('Initial time-to-live (in number of turns) for tool use messages added to the scratchpad. This determines how long a tool use will remain in the scratchpad context if it is not selected for retention or moved to the graveyard.')
      .default(10),
    text: z.number()
      .describe('Initial time-to-live (in number of turns) for regular human or assistant messages added to the scratchpad. This determines how long a message will remain in the scratchpad context if it is not selected for retention or moved to the graveyard.')
      .default(5),
  }).default({
    tool: 10,
    text: 5,
  }),

  maxSectionSize: z.number()
    .describe('Maximum number of items that can be included in a single section of the scratchpad context. If a section exceeds this size, it will be truncated to include only the most recent items. This prevents the scratchpad context from becoming too large and unwieldy for the LLM to process effectively.')
    .default(800)
});


export type ScratchpadConfig = z.infer<typeof ScratchpadConfigSchema>;

export const AgentSchema = z.object({
  scratchpad: ScratchpadConfigSchema.optional(),
}).default({});

export type AgentConfig = z.infer<typeof AgentSchema>;