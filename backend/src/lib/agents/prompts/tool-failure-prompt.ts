


export const TOOL_FAILURE_PROMPT = (err: Error) => `
The tool call failed with the following error message:
${err.name}: ${err.message}.
Review the error message for any clues on what went wrong and any recommended next steps.
Do NOT retry the same call with the same inputs. Instead, try a different approach or use different arguments.
**Common Issues**:
- Invalid arguments: Check if the arguments you provided to the tool are correct and in the expected format. Review the tool documentation and error message for any hints on what might be wrong with the arguments.
- Rate limits: You may have hit a rate limit for the tool or an external API it uses. Stop and ask the user to try again later
- Permissions: The tool may require certain permissions or access that it does not have. Stop and let the user know to review the tool configuration and permissions.
`.trim();