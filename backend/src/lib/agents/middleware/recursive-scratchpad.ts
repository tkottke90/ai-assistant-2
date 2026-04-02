/**
 * Recursive Scratchpad Middleware
 *
 * Gives every Agent a per-thread XML scratchpad that acts as distilled working
 * memory for that thread.  The middleware owns the XML structure entirely; the
 * Agent interacts through four LangChain tools.
 *
 * Context flow (per turn):
 *  wrapModelCall (first call of the turn):
 *    – reads scratchpad from checkpointer, populates module-level store
 *    – injects TOC or full XML into the model request (NOT persisted to history)
 *    – returns Command to set _scratchpadActive = true
 *
 *  Tools (scratchpad_*):
 *    – read/write from the module-level store (always consistent within a turn)
 *    – return plain JSON strings
 *
 *  wrapToolCall (after each scratchpad tool):
 *    – emits Command to persist updated scratchpad / _visitedSections to state
 *    – ToolMessage passes through (Command-without-messages is pass-through)
 *
 *  afterAgent:
 *    – clears module-level stores
 *    – resets _scratchpadActive and _visitedSections in state
 */

import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { Command, getConfig, StateSchema } from '@langchain/langgraph';
import { createMiddleware } from 'langchain';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { checkpointer } from '../../database.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TocEntry {
  name: string;
  summary: string;
}

export interface SectionContent {
  name: string;
  content: string;
  relatedSections: string[];
}

export interface ScratchpadDoc {
  toc: TocEntry[];
  sections: SectionContent[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── XML parser / builder config ─────────────────────────────────────────────

const ATTR_PREFIX = '@_';

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  allowBooleanAttributes: true,
  trimValues: true,
  isArray: (name: string) => name === 'entry' || name === 'section',
};

const xmlParser = new XMLParser(PARSER_OPTIONS);

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  format: true,
  indentBy: '  ',
  suppressBooleanAttributes: false,
});

/** Returns a valid empty scratchpad XML string. */
export function buildEmptyScratchpad(): string {
  return `<scratchpad>
  <toc></toc>
</scratchpad>`;
}

/**
 * Parses a scratchpad XML string into the internal ScratchpadDoc shape.
 * Throws a descriptive error if the XML is malformed.
 */
export function parseScratchpad(xml: string): ScratchpadDoc {
  const raw = xmlParser.parse(xml) as any;
  const root = raw?.scratchpad;

  if (!root) throw new Error('Missing <scratchpad> root element');

  const rawEntries: any[] = root?.toc?.entry ?? [];
  const rawSections: any[] = root?.section ?? [];

  const toc: TocEntry[] = rawEntries.map((e: any) => ({
    name: String(e[`${ATTR_PREFIX}section`] ?? ''),
    summary: String(e[`${ATTR_PREFIX}summary`] ?? ''),
  }));

  const sections: SectionContent[] = rawSections.map((s: any) => {
    const seeAlso = String(s[`${ATTR_PREFIX}see-also`] ?? '');
    return {
      name: String(s[`${ATTR_PREFIX}name`] ?? ''),
      content: String(s?.content ?? ''),
      relatedSections: seeAlso ? seeAlso.split(' ').filter(Boolean) : [],
    };
  });

  return { toc, sections };
}

/**
 * Validates the structural integrity of a scratchpad XML string:
 * - <scratchpad> root element is present
 * - Every <toc><entry> has a matching <section>
 * - Every <section> has a matching <toc><entry>
 */
export function validateScratchpad(xml: string): ValidationResult {
  const errors: string[] = [];

  let doc: ScratchpadDoc;
  try {
    doc = parseScratchpad(xml);
  } catch (e: any) {
    return { valid: false, errors: [`Parse error: ${e?.message ?? e}`] };
  }

  const tocNames = new Set(doc.toc.map(e => e.name));
  const sectionNames = new Set(doc.sections.map(s => s.name));

  for (const name of tocNames) {
    if (!sectionNames.has(name)) {
      errors.push(`TOC entry "${name}" has no matching <section>`);
    }
  }
  for (const name of sectionNames) {
    if (!tocNames.has(name)) {
      errors.push(`<section name="${name}"> has no matching TOC entry`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Builds a TOC-only XML block for injection when the full scratchpad exceeds
 * the threshold.  Cheap for the LLM to read; full section content is fetched
 * on demand via the scratchpad_get_section tool.
 */
export function buildTocBlock(doc: ScratchpadDoc): string {
  if (doc.toc.length === 0) return '';
  const entries = doc.toc
    .map(e => `    <entry section="${e.name}" summary="${escapeAttr(e.summary)}" />`)
    .join('\n');
  return `<scratchpad-toc>\n${entries}\n</scratchpad-toc>`;
}

/** Serialises a ScratchpadDoc back to canonical XML. */
export function serialiseScratchpad(doc: ScratchpadDoc): string {
  const tocEntries = doc.toc.map(e => ({
    [`${ATTR_PREFIX}section`]: e.name,
    [`${ATTR_PREFIX}summary`]: e.summary,
  }));

  const sections = doc.sections.map(s => {
    const obj: any = {
      [`${ATTR_PREFIX}name`]: s.name,
      content: s.content,
    };
    if (s.relatedSections.length > 0) {
      obj[`${ATTR_PREFIX}see-also`] = s.relatedSections.join(' ');
    }
    return obj;
  });

  const xmlObj: any = {
    scratchpad: {
      toc: tocEntries.length > 0 ? { entry: tocEntries } : {},
      ...(sections.length > 0 ? { section: sections } : {}),
    },
  };

  return xmlBuilder.build(xmlObj) as string;
}

/**
 * Adds a new section.  Throws if a section with that name already exists.
 * Returns updated XML.
 */
export function addSection(
  xml: string,
  name: string,
  summary: string,
  content: string,
  relatedSections: string[] = [],
): string {
  const doc = parseScratchpad(xml);

  if (doc.toc.some(e => e.name === name)) {
    throw new Error(
      `Section "${name}" already exists. Use scratchpad_update_section to modify it.`,
    );
  }

  doc.toc.push({ name, summary });
  doc.sections.push({ name, content, relatedSections });

  return serialiseScratchpad(doc);
}

/**
 * Updates an existing section.  Only the provided fields are changed.
 * Throws if the section does not exist.
 * Returns updated XML.
 */
export function updateSection(
  xml: string,
  name: string,
  summary?: string,
  content?: string,
  relatedSections?: string[],
): string {
  const doc = parseScratchpad(xml);

  const tocEntry = doc.toc.find(e => e.name === name);
  const section = doc.sections.find(s => s.name === name);

  if (!tocEntry || !section) {
    throw new Error(
      `Section "${name}" not found. Use scratchpad_add_section to create it.`,
    );
  }

  if (summary !== undefined) tocEntry.summary = summary;
  if (content !== undefined) section.content = content;
  if (relatedSections !== undefined) section.relatedSections = relatedSections;

  return serialiseScratchpad(doc);
}

/**
 * Threshold function — returns true when the scratchpad is large enough that
 * only the TOC should be injected rather than the full XML.
 * Replaceable: swap this export to change the strategy (e.g. token count).
 */
export const SCRATCHPAD_THRESHOLD = (xml: string): boolean => xml.length > 4000;

export const ScratchpadStateSchema = new StateSchema({
  /** The XML scratchpad document, persisted by the checkpointer per thread_id. */
  scratchpad: z.string().default(''),
  /** Private: set to true after the first model call of a turn to prevent double-injection. */
  _scratchpadActive: z.boolean().default(false),
  /** Private: section names already retrieved this turn — prevents circular traversal. */
  _visitedSections: z.array(z.string()).default([]),
});

// ─── Module-level per-thread stores ──────────────────────────────────────────
// These give tools consistent, up-to-date access to scratchpad state within a
// single agent turn.  They are initialised from the checkpointer on the first
// wrapModelCall of each turn and cleared in afterAgent.

/** Current scratchpad XML, keyed by thread_id. */
const scratchpadStore = new Map<string, string>();

/** Current visited-section names for the active turn, keyed by thread_id. */
const visitedStore = new Map<string, string[]>();

function getThreadId(): string | undefined {
  return (getConfig()?.configurable as any)?.thread_id as string | undefined;
}

function getStoreXml(threadId: string): string {
  return scratchpadStore.get(threadId) ?? '';
}

function getVisited(threadId: string): string[] {
  return visitedStore.get(threadId) ?? [];
}

/** Tool names that modify the scratchpad. Used by wrapToolCall to emit state updates. */
const SCRATCHPAD_WRITE_TOOLS = new Set([
  'scratchpad_add_section',
  'scratchpad_update_section',
]);

/** All scratchpad tool names (used for targeted wrapToolCall handling). */
const ALL_SCRATCHPAD_TOOLS = new Set([
  'scratchpad_list_sections',
  'scratchpad_get_section',
  'scratchpad_add_section',
  'scratchpad_update_section',
]);

/**
 * Creates the four scratchpad tools.  These are always registered alongside
 * the middleware — they rely on the module-level stores populated by wrapModelCall.
 */
export function createScratchpadTools() {
  const listSections = tool(
    async () => {
      const threadId = getThreadId();
      if (!threadId) {
        return JSON.stringify({ sections: [], message: 'No active thread.' });
      }
      const xml = getStoreXml(threadId);
      if (!xml) {
        return JSON.stringify({ sections: [], message: 'Scratchpad is empty.' });
      }
      let doc: ScratchpadDoc;
      try {
        doc = parseScratchpad(xml);
      } catch {
        return JSON.stringify({ error: 'Scratchpad could not be read (corrupt XML).' });
      }
      return JSON.stringify({ sections: doc.toc });
    },
    {
      name: 'scratchpad_list_sections',
      description:
        'List all sections in your per-thread scratchpad. Returns each section name and its ' +
        'one-line summary. Use this at the start of a turn to discover what working knowledge ' +
        'is available before deciding which sections to retrieve in full.',
      schema: z.object({}),
    },
  );

  const getSection = tool(
    async ({ name }) => {
      const threadId = getThreadId();
      if (!threadId) {
        return JSON.stringify({ error: 'No active thread.' });
      }

      const visited = getVisited(threadId);
      if (visited.includes(name)) {
        return JSON.stringify({
          error: `Section "${name}" has already been retrieved this turn (circular reference blocked).`,
        });
      }

      const xml = getStoreXml(threadId);
      if (!xml) {
        return JSON.stringify({ error: 'Scratchpad is empty. No sections exist yet.' });
      }

      let doc: ScratchpadDoc;
      try {
        doc = parseScratchpad(xml);
      } catch {
        return JSON.stringify({ error: 'Scratchpad could not be read (corrupt XML).' });
      }

      const section = doc.sections.find(s => s.name === name);
      if (!section) {
        return JSON.stringify({
          error: `Section "${name}" not found. Use scratchpad_list_sections to see available sections.`,
        });
      }

      // Update visited store — wrapToolCall persists this to LangGraph state
      visitedStore.set(threadId, [...visited, name]);

      return JSON.stringify({
        name: section.name,
        content: section.content,
        relatedSections: section.relatedSections,
      });
    },
    {
      name: 'scratchpad_get_section',
      description:
        'Retrieve the full content of a single scratchpad section by name. ' +
        'Also returns related section names (see-also references) you can follow. ' +
        'Use scratchpad_list_sections first to find the right name. ' +
        'Each section can only be retrieved once per turn to prevent circular loops.',
      schema: z.object({
        name: z.string().describe(
          'The exact section name as returned by scratchpad_list_sections',
        ),
      }),
    },
  );

  const addSectionTool = tool(
    async ({ name, summary, content, relatedSections }) => {
      const threadId = getThreadId();
      if (!threadId) {
        return JSON.stringify({ success: false, error: 'No active thread.' });
      }

      const currentXml = getStoreXml(threadId) || buildEmptyScratchpad();

      let newXml: string;
      try {
        newXml = addSection(currentXml, name, summary, content, relatedSections ?? []);
      } catch (e: any) {
        return JSON.stringify({ success: false, error: e?.message ?? String(e) });
      }

      // Update store — wrapToolCall persists this to LangGraph state
      scratchpadStore.set(threadId, newXml);

      return JSON.stringify({ success: true, message: `Section "${name}" added to scratchpad.` });
    },
    {
      name: 'scratchpad_add_section',
      description:
        'Add a new section to your per-thread scratchpad. Use this when you learn or decide ' +
        'something worth retaining for the rest of this thread — key facts, decisions made, ' +
        'current task context, user preferences for this session, or a plan you are working through. ' +
        'Each section has a short summary (shown in the TOC for cheap lookup) and a full markdown ' +
        'content body. Use relatedSections to link to other sections the agent may want to follow.',
      schema: z.object({
        name: z.string().describe(
          'Unique section identifier, e.g. "current-task" or "user-preferences"',
        ),
        summary: z.string().describe(
          'One sentence describing the section contents (shown in the TOC)',
        ),
        content: z.string().describe('Full markdown content for this section'),
        relatedSections: z.array(z.string()).optional().describe(
          'Names of related sections to link from this one (see-also references)',
        ),
      }),
    },
  );

  const updateSectionTool = tool(
    async ({ name, summary, content, relatedSections }) => {
      const threadId = getThreadId();
      if (!threadId) {
        return JSON.stringify({ success: false, error: 'No active thread.' });
      }

      const currentXml = getStoreXml(threadId);
      if (!currentXml) {
        return JSON.stringify({
          success: false,
          error: 'Scratchpad is empty — use scratchpad_add_section first.',
        });
      }

      let newXml: string;
      try {
        newXml = updateSection(currentXml, name, summary, content, relatedSections);
      } catch (e: any) {
        return JSON.stringify({ success: false, error: e?.message ?? String(e) });
      }

      // Update store — wrapToolCall persists this to LangGraph state
      scratchpadStore.set(threadId, newXml);

      return JSON.stringify({ success: true, message: `Section "${name}" updated in scratchpad.` });
    },
    {
      name: 'scratchpad_update_section',
      description:
        'Update an existing section in your per-thread scratchpad. Only the fields you provide ' +
        'are changed — omit fields to leave them unchanged. Use this to refine working knowledge, ' +
        'mark a task step as complete, or add a new decision to an existing section. ' +
        'Use scratchpad_list_sections to find the exact section name.',
      schema: z.object({
        name: z.string().describe('The exact section name to update'),
        summary: z.string().optional().describe(
          'Updated one-line summary for the TOC (omit to keep current)',
        ),
        content: z.string().optional().describe(
          'Updated full markdown content (omit to keep current)',
        ),
        relatedSections: z.array(z.string()).optional().describe(
          'Updated list of related section names (omit to keep current)',
        ),
      }),
    },
  );

  return [listSections, getSection, addSectionTool, updateSectionTool];
}

/**
 * Creates the recursive scratchpad middleware.
 *
 * Hook responsibilities:
 *
 *  wrapModelCall  — first call of a turn: initialise module-level stores from
 *                   the checkpointer, inject scratchpad context into the model
 *                   request without persisting it to message history, return
 *                   Command to set _scratchpadActive = true.
 *
 *  wrapToolCall   — after each scratchpad tool call: emit Command to persist
 *                   updated scratchpad XML and _visitedSections to LangGraph
 *                   state.  ToolMessage flows through (Command-without-messages
 *                   is pass-through per LangChain middleware semantics).
 *
 *  afterAgent     — clear module-level stores, reset _scratchpadActive and
 *                   _visitedSections for the next turn.
 */
export function createScratchpadMiddleware() {
  return createMiddleware({
    name: 'recursive-scratchpad',
    stateSchema: ScratchpadStateSchema,

    wrapModelCall: async (request, handler) => {
      const threadId = getThreadId();
      if (!threadId) return handler(request);

      // Read current state from checkpointer
      const ckpt = await checkpointer.get({ configurable: { thread_id: threadId } });
      const isActive = (ckpt?.channel_values?._scratchpadActive as boolean | undefined) ?? false;

      // Already injected this turn — pass through unchanged
      if (isActive) return handler(request);

      const storedXml = (ckpt?.channel_values?.scratchpad as string | undefined) ?? '';

      // Initialise module-level stores for this turn
      scratchpadStore.set(threadId, storedXml);
      visitedStore.set(threadId, []);

      // Cold start — no scratchpad yet, inject a hint so the model knows to use the tools
      if (!storedXml) {
        const hintMsg = new HumanMessage({
          content:
            '<scratchpad-context>\n' +
            'Your scratchpad for this thread is currently empty.\n' +
            'If this conversation produces important facts, decisions, a running plan, or user preferences ' +
            'worth remembering in future turns, save them now using scratchpad_add_section.\n' +
            '</scratchpad-context>',
        });
        const hintRequest = {
          ...request,
          messages: [...(request as any).messages, hintMsg],
        };
        await handler(hintRequest as any);
        return new Command({ update: { _scratchpadActive: true, _visitedSections: [] } });
      }

      // Build context block: TOC-only if above threshold, full XML if below
      let contextBlock: string;
      try {
        if (SCRATCHPAD_THRESHOLD(storedXml)) {
          const doc = parseScratchpad(storedXml);
          contextBlock = buildTocBlock(doc);
        } else {
          contextBlock = storedXml;
        }
      } catch {
        // Corrupted scratchpad — skip injection to avoid breaking the agent
        await handler(request);
        return new Command({ update: { _scratchpadActive: true, _visitedSections: [] } });
      }

      // Inject as a HumanMessage appended to the request (not persisted to state)
      const contextMsg = new HumanMessage({
        content: `<scratchpad-context>\n${contextBlock}\n</scratchpad-context>`,
      });

      const modifiedRequest = {
        ...request,
        messages: [...(request as any).messages, contextMsg],
      };

      await handler(modifiedRequest as any);

      return new Command({ update: { _scratchpadActive: true, _visitedSections: [] } });
    },

    wrapToolCall: async (request, handler) => {
      const result = await handler(request);

      // Pass through Commands from inner middleware unchanged
      if (result instanceof Command) return result;

      const toolName: string = (result as any)?.name ?? '';

      // Not a scratchpad tool — pass through unchanged
      if (!ALL_SCRATCHPAD_TOOLS.has(toolName)) return result;

      const threadId = getThreadId();
      if (!threadId) return result;

      // Always sync _visitedSections (scratchpad_get_section updates the store mid-turn)
      const visited = getVisited(threadId);
      const stateUpdate: Record<string, unknown> = { _visitedSections: visited };

      // For write tools, also persist the updated scratchpad XML to LangGraph state
      if (SCRATCHPAD_WRITE_TOOLS.has(toolName)) {
        const newXml = scratchpadStore.get(threadId);
        if (newXml) {
          stateUpdate.scratchpad = newXml;
        }
      }

      // Returning Command without messages is pass-through for the ToolMessage
      return new Command({ update: stateUpdate });
    },

    afterAgent: () => {
      // Clear module-level stores — re-populated on next wrapModelCall
      const threadId = getThreadId();
      const finalXml = threadId ? (scratchpadStore.get(threadId) ?? '') : '';

      if (threadId) {
        scratchpadStore.delete(threadId);
        visitedStore.delete(threadId);
      }
      return { _scratchpadActive: false, _visitedSections: [], scratchpad: finalXml };
    },
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
