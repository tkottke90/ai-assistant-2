---
name: start-story
description: Retrieve a story from Obsidian, and prepare the context for starting work on it
argument-hint: Story or task name (e.g., "Story - Create Credentials Config Model")
---

## Steps

1. Make sure that locally in the repository, a `.ai` directory exists
2. Remove any existing `.ai/story.md` files
3. Using the obsidian mcp tool (`obsidianvault/*`), locate the story or task document in the Obsidian vault based on the provided name.
4. Extract relevant information from the document and store it in `.ai/story.md`, including:
   - Story or task title
   - Acceptance criteria
   - Implementation notes
   - Any references to design documents
5. If a relevant design document exists, review references in from the story in the design document
6. Summarize the story or task, including key acceptance criteria, implementation notes, and any dependencies
7. Using the obsidian mcp tool, make sure that the status of the story is set to `3 - in-progress`

## Summary Format

Provide a clear summary that includes:

1. **Purpose**: A brief description of what the story aims to accomplish
2. **Key Expectations**: Extract and organize the acceptance criteria into logical groupings
3. **Implementation Details**: Highlight any specific design notes, technical requirements, or patterns to follow
4. **Dependencies**: Note any dependencies or related work
5. **Deliverables**: Summarize what needs to be completed

## Additional Details

Search the Obsidian vault systematically:
- Start with the Tasks/ directory
- Check Projects/ subdirectories if not found
- Use exact filename matching when possible

All Wiki-style links in the documents should be resolved to markdown links with obsidian urls (e.g., `[File](obsidian://open?vault=VaultName&file=FilePath)`).  That way the user can access them directly from the summary.

Present the summary in a concise, actionable format that a developer can use to understand requirements quickly without reading the full story document.