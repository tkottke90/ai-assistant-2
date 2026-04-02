import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage } from "langchain";
import { Logger } from "winston";

const goalModel = new ChatOllama({
  model: 'qwen3:0.6b'
});

const load_prompt = (sections: Array<{ name: string, description: string }>) => new HumanMessage(`
<scratchpad-load>
  
  <task>Identify sections from the list which are relevant to the most recent messages.  Return an empty list of no sections make sense</task>  
  
  <scratchpad-data>
    <description>This section contains a list of scratchpad sections available to pick from</description>

    ${sections.length === 0 ? `<note>No sections currently exist in the scratchpad.</note>` : ''}

    ${  sections.map(({ name, description }) => `
        <section>
          <name>${name}</name>
          <description>${description}</description>
        </section>
      `.trim()).join('\n\n')
    }
  </scratchpad-data>

  <output>
    <description>This section outlines the output format you should use when providing the scratchpad information for context</description>

    <instructions>
      - Review the list of sections and determine which ones are relevant to the current conversation. You should use the section name and description to make this determination.
      - For each relevant section, include the content of that section in your output. The content will be used to provide additional context for the current conversation.
      - ONLY return the sections list, do not respond to the message or add any conversational text in your response.
    </instructions>

    <format>
      Your output should be a list of section names that you have determined should be included:
      {
        "sections": Array<string>
      }
    </format>

    <example>
      {"sections": ["User Preferences", "Important Facts"]}
    </example>

    <example note="this indicates that there are no relevant sections to include in the context" >
      {"sections": []}
    </example>
  </output>

</scratchpad-load>
`.trim());

const refine_prompt = (sectionName: string, existingContent: string, newContent: string) => new HumanMessage(`
<section-refine>
  
  <task>Your task is to refine the content of a section in the scratchpad. The section is called ${sectionName} and currently contains the following information:\n\n${existingContent}\n\nYou have just observed the following new information in the conversation which may be relevant to this section:\n\n${newContent}\n\nYour goal is to integrate the new information with the existing content in a way that keeps the section up to date and relevant for future reference.</task>  
  
  <output>
    <description>This section outlines the output format you should use when providing the refined content for the section</description>

    <instructions>
      - Review the existing content and the new information.
      - Refine the content by integrating the new information. You can choose to append it, rewrite it, or reorganize it as you see fit. The goal is to keep the section as useful and relevant as possible for future reference.
      - ONLY return the refined content, do not respond to the message or add any conversational text in your response.
    </instructions>

    <format>
      Your output should be a string containing the refined content for the section.
    </format>

    <example>
      If the existing content is "The user is building a D&amp;D character" and the new information is "The user is specifically working on the character's backstory", your output might be "The user is building a D&amp;D character and is currently focused on developing the character's backstory."
    </example>
  </output>

</section-refine>
`.trim());

const update_prompt = (sections: Array<{ name: string, description: string, content: string }>) => new HumanMessage(`
<scratchpad-update>
  <task>Your task is to review the conversation you have been having with the user and extract information that might be relevant later in the conversation. This information is collected into your scratchpad which is a document containing notes for this specific conversation.</task>
  
  <scratchpad-data>
    <description>This section contains information about the existing sections in the system</description>

    ${sections.length === 0 ? `<note>No sections currently exist in the scratchpad.</note>` : ''}

    ${  sections.map(({ name, description, content }) => `
        <section>
          <name>${name}</name>
          <description>${description}</description>
          <content>${content}</content>
        </section>
      `.trim()).join('\n\n')
    }
  </scratchpad-data>

  <output>
    <description>This section outlines the output format you should use when providing your list of updates</description>

    <instructions>
      - Review the conversation history and extract any information that might be relevant later in the conversation. This could include user preferences, important facts, observations you hae made, or any other details that could be useful for future reference.
      - For each piece of information you extract, you should
        - Assign it to a _section_ of the scratchpad. Sections are like categories or topics that help organize the information. For example, you might have sections like "User Preferences", "Important Facts", "Observations", etc. You are free to organize the information as you see fit.
        - [Optional] A section _description_ which is a brief summary to assist in future recall of the information
        - Determine if you want to _append_ (add to the existing information), _rewrite_ (replace existing information) for that section, or _refine_ (rework the existing information to integrate the new information) the content in that section based on the new information you are adding.
        - Include the content you want to add or use for rewriting.
        - [Optional] New sections you can include a brief description of the section in the content field when you first create it.
    </instructions>

    <format>
      Your output must be a single JSON object with an "updates" array. Do not include any other text or conversational response in your output.
      {
        "updates": [
          {
            "type": "append" | "rewrite" | "refine",
            "section": string,
            "content": string,
            "description"?: string,
            "justification": string
          }
        ]
      }

      Return {"updates": []} if no information is worth recording.
      
      <example>
        {"updates": [{"type": "append", "section": "user activity", "content": "The user is building a D&amp;D character"}, {"type": "rewrite", "section": "project-repository", "content": "The user is working on the owner/repo GitHub Repository", "description": "the location of the code the user is working on"}]}
      </example>

    </format>

  </output>

</scratchpad-update>
`.trim());

async function updateGoal(state: Record<string, any>, logger: Logger, currentGoal: string = 'No Goal') {
  const lastHuman = [...state.messages]
    .reverse()
    .find(msg => msg._getType() === "human");

  if (!lastHuman) return;

  const content = (lastHuman.content as string).toLowerCase();
  
  const goalShiftSignals = [
    /actually|instead|no wait|forget/i,       // corrections
    /different|new|another|else/i,             // pivots
    /\?$/.test(content.trim()),                // new question
    !currentGoal,            // first turn
  ];

  const shouldUpdate = goalShiftSignals.some(s =>
    typeof s === "boolean" ? s : s.test(content)
  );

  if (!shouldUpdate) return; // skip — goal probably hasn't changed


  logger.info('Updating agent goal');

  return await goalModel.invoke([
    new SystemMessage(`Extract what your current goal should be based on the conversation. ONLY return the goal, do not return any conversational messages. \nPrevious goal: "${currentGoal}"`),
    new HumanMessage(content),
  ], { callbacks: [] });
}

async function m(state: Record<string, any>, logger: Logger, currentGoal: string = 'No Goal') {
  const lastHuman = [...state.messages]
    .reverse()
    .find(msg => msg._getType() === "human");

  if (!lastHuman) return;

  const content = (lastHuman.content as string).toLowerCase();
  
  const goalShiftSignals = [
    /actually|instead|no wait|forget/i,       // corrections
    /different|new|another|else/i,             // pivots
    /\?$/.test(content.trim()),                // new question
    !currentGoal,            // first turn
  ];

  const shouldUpdate = goalShiftSignals.some(s =>
    typeof s === "boolean" ? s : s.test(content)
  );

  if (!shouldUpdate) return; // skip — goal probably hasn't changed


  logger.info('Updating agent goal');

  return await goalModel.invoke([
    new SystemMessage(`Extract what your current goal should be based on the conversation. ONLY return the goal, do not return any conversational messages. \nPrevious goal: "${currentGoal}"`),
    new HumanMessage(content),
  ], { callbacks: [] });
}

export default {
  load_prompt,
  refine_prompt,
  update_prompt,
  updateGoal
};