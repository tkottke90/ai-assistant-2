import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ATTR_PREFIX, BaseSection, TEXT_NODE_KEY, ToolSection } from "./sections";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { HumanMessage, SystemMessage } from "langchain";
import z from "zod";
import { isEmptyArray } from "../../../utils/array.utils";
import { Logger } from "winston";

const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  textNodeName: TEXT_NODE_KEY,
}

const TRAVERSAL_PROMPT = `
## Task: Select relevant sections from a table of contents based on user input, using the conversation history  

**System Prompt:**  
"Act as a filter for a table of contents (TOC) where each item is in the format \`- <section name>: <section description>\`. Your task is to analyze the user's **current query** and the **previous conversation history** (last 6 messages) to select the most relevant sections from the TOC.  

**Instructions:**  
1. **Analyze the conversation history** to understand the user's context, previous questions, and goals.  
2. **Evaluate relevance** based on the **current query** and the **context from the conversation**.  
3. **Prioritize sections** that:  
   - Match the **current query** explicitly.  
   - Address **tools, techniques, or topics** mentioned in the conversation.  
   - Align with the **user's project** or use case (if applicable).  
4. **Exclude irrelevant sections** that do not align with the conversation's context.  
5. **Output format**: Return a JSON array of section names in order of relevance.  

**Example**:  
If the user asks, *“How would I wait for the whole page to load when scraping a website?”* after discussing DOM manipulation and web scraping tools in prior messages, the relevant sections would include:  
- **"Javascript DOM"** (for DOM manipulation techniques),  
- **"Cherrio"** (for web scraping tools),  
- **"User's Project"** (for project-specific context).  

**Do not include**:  
- "Python BeautifulSoup" (not relevant to the query),  
- "Python" (too broad and unrelated).  

**Response format**:
- Return ONLY the JSON array
- Do not return any explanitory text or additional information, just the array of section names.
- Do not wrap the code in a text block, return it as raw JSON.

**Example Response**:

\`\`\`
["Javascript DOM", "Cherrio", "User's Project"]
\`\`\`
`


export class Scratchpad {
  private sections: Map<string, BaseSection> = new Map();

  constructor() {}

  /**
   * Adds a new section to the scratchpad. If a section with the same name already exists, it will be overwritten.
   * @param section The section to add to the scratchpad.
   * @returns The section that was added to the scratchpad.
   */
  addSection(section: BaseSection) {
    this.sections.set(section.name, section);

    return this.getSection(section.name) as BaseSection;
  }
  
  /**
   * Append content to an existing section. If the section does not exist, it will be created.
   * The content will be appended to the end of the existing content in the section.
   * @param sectionName The name of the section to append content to.
   * @param content The content to append to the section. This should be a string that will be added to the end of the existing content in the section.
   */
  appendSection(sectionName: string, content: string) {
    let section = this.sections.get(sectionName);

    if (!section) {
      this.addSection(new BaseSection(sectionName, '', content));
    } else {
      section.content += content;
    }
  }

  async decomposeSections(
    llm: BaseChatModel,
    logger: Logger,
    maxSize: number = 800,
  ) {
    // Create generator
    const search = this.traverse(100);

    // Get first set of candidates
    let current = search.next();

    // Loop through all the sections
    while (!current.done) {
      for (const section of current.value.candidates) {
        section.decomposeSection(
          // Summarize the existing content
          async (content: string) => {
            const response = await llm.invoke([
              new SystemMessage(''),
              new HumanMessage([
                'Summarize the following content in a single paragraph, keeping the most important details and removing any unnecessary information.',
                'The details will be stored in dedicated sub-sections so the focus is on what this section contains, not the specifics.',
                content,
              ].join("\n"))
            ], { callbacks: [] });

            const summary = response.content?.toString().trim();

            if (!summary) {
              return content;
            }

            return summary;
          },

          // Split the content into sub-sections
          async (content: string) => {
            const response = await llm
              .withStructuredOutput(z.array(
                z.object({
                  name: z.string(),
                  description: z.string(),
                  content: z.string(),
                })
              ))
              .invoke([
                new SystemMessage(''),
                new HumanMessage([
                  'Split the following content into 2-4 sub-sections.',
                  'Each sub-section should be a coherent chunk of content that can stand on its own. The goal is to break down the content into smaller, more manageable pieces while preserving the overall meaning and structure.',
                  content,
                ].join("\n"))
              ], { callbacks: [] });

            // If the response is empty or not in the expected format,
            // return an empty array to indicate that no sub-sections were created.
            if (isEmptyArray(response)) {
              return [];
            }

            return response.map(section => new BaseSection(
                section.name,
                section.description,
                section.content,
              )
            );
          },

          // Max size for a section before we attempt to decompose it further
          maxSize,

          // The Agent's logger to log any relevant information during the decomposition process
          logger
        )
      }

      // Get the next section
      current = search.next(current.value.candidates.map((s: BaseSection) => s.name));
    }
  }

  /**
   * Get a section from the scratchpad by name.
   * @param sectionName The name of the section to retrieve from the scratchpad.
   * @returns The section with the specified name, or undefined if no such section exists in the scratchpad.
   */
  getSection(sectionName: string) {
    return this.sections.get(sectionName);
  }

  sectionList() {
    return Array.from(this.sections.values()).map(section => ({
      name: section.name,
      description: section.description,
      content: section.content,
    }));
  }

  /**
   * Removes a section from the scratchpad by name. If the section does not exist, this method does nothing.
   * @param sectionName The name of the section to remove from the scratchpad.
   */
  removeSection(sectionName: string) {
    this.sections.delete(sectionName);
  }

  /**
   * Rewrite the content of an existing section. If the section does not exist, it will be created.
   * The content of the section will be replaced with the provided content.
   * @param sectionName The name of the section to rewrite.
   * @param content The new content for the section. This should be a string that will replace the existing content in the section.
   * @returns The updated section after rewriting its content.
   */
  rewriteSection(sectionName: string, data: { content: string, description?: string }) {
    let section = this.sections.get(sectionName);

    if (!section) {
      this.addSection(new BaseSection(
        sectionName,
        data.description ?? '',
        data.content
      ));
    } else {
      if (data.description) {
        section.description = data.description;
      }
      section.content = data.content;
    }
  }

  /**
   * Creates a generator that will traverse the sections of the scratchpad in a depth-first manner,
   * yielding each section as it is visited.
   * @param maxDepth The maximum depth to traverse in the section hierarchy. This is a safeguard against infinite loops in case of circular references. The default value is 10.
   * @returns A generator that yields sections of the scratchpad as they are visited during the traversal.
   * The generator will yield an object containing the current depth and the list of candidate sections at that depth. The caller can then select which sections to traverse into next by passing their names back to the generator.
   * Once the traversal is complete, the generator will return a list of all sections that were visited during the traversal.
   * 
   * @example
   * const scratchpad = new Scratchpad();
   * // ... add sections to the scratchpad ...
   * const traversal = scratchpad.traverse();
   * let result = traversal.next();
   * 
   * while (!result.done) {
   *   const { depth, candidates } = result.value;
   *   // ... decide which sections to traverse into next based on the candidates ...
   *   const selectedSections = candidates.map(c => c.name); // for example, select all candidates
   *   result = traversal.next(selectedSections);
   * }
   * 
   * const visitedSections = result.value; // this will contain all sections that were visited during the traversal
   */
  * traverse(maxDepth = 5) {
    const collectedSections: BaseSection[] = [];

    let depth = 0;
    let candidates = Array.from(this.sections.values());

    while (
      depth < maxDepth &&    // Prevent infinite looping with a max depth
      candidates.length > 0  // Stop if there are no more sections to traverse 
    ) {

      // Yield the current candidates for the system to select from,
      // we expect that the system will call `next()` with the name(s) of the section(s) it wants to traverse into next.
      const selectedSections: string[] = yield { depth, candidates };
      const nextCandidates: BaseSection[] = [];

      selectedSections.forEach(name => {
        const section = candidates.find(s => s.name === name);
        if (!section) return;

        if (section.hasChildren) {
          nextCandidates.push(...section.getAllSections());
        } else {
          collectedSections.push(section);
        }

        candidates = nextCandidates;
        depth++;
      });
    }

    return collectedSections;
  }

  static get traversalPrompt() {
    return TRAVERSAL_PROMPT;
  }

  /**
   * Loads a scratchpad from an XML document string.
   */
  static fromXML(xml?: string) {
    const parser = new XMLParser({
      ...XML_OPTIONS,
      allowBooleanAttributes: true,
      trimValues: true,
      isArray: (name: string) => name === "entry" || name === "section",
    });
    
    // Create a new scratchpad instance
    const scratchpad = new Scratchpad();

    if (!xml) {
      return scratchpad;
    }

    // Parse the scratchpad XML
    const parsed = parser.parse(xml);

    // Extract sections from the parsed XML and add them to the scratchpad
    const sections = parsed?.scratchpad?.sections?.section ?? [];
    sections.forEach((sectionData: Record<string, any>) => {
      switch (sectionData['@_type']) {
        case 'tool':
          const toolSection = ToolSection.fromXML(sectionData);
          scratchpad.addSection(toolSection);
          break;
        default:
          const baseSection = BaseSection.fromXML(sectionData);
          scratchpad.addSection(baseSection);
      }
    });

    return scratchpad;
  }

  /**
   * Converts the scratchpad to an XML document string
   */
  toXML() {
    const builder = new XMLBuilder({
      ...XML_OPTIONS,
      format: true,
      suppressEmptyNode: true,
    });
    
    const sections = Array.from(this.sections.values()).map(section => section.toXML());
    const toc = Array.from(this.sections.values()).map(section => ({ name: section.name, description: section.description }));

    return builder.build({
      scratchpad: {
        toc: { section: toc },
        sections: { section: sections },
      }
    })
  }
}