
/**
 * Utility function for joining an array of strings into a single string
 * with the specified delimiter.  This strategy of using arrays to build
 * up multiline strings makes the code more readable and easier to maintain,
 * especially when constructing complex strings like markdown content or LLM Promts
 * @param strings 
 * @param delimiter 
 * @returns 
 */
export function multilineString(strings: string[], delimiter = '\n') {
  return strings.join(delimiter);
}

/**
 * Creates a markdown code block "fence" with an optional language specifier. This helps
 * keep our code clean and easier to write since we do not have to write escaped backticks everywhere.
 * @param language Optional language specifier for syntax highlighting (e.g., 'javascript', 'python'). If not provided, creates a generic code block.
 * @returns A string representing the opening or closing fence of a markdown code block, depending on the context in which it's used. For example, if language is 'javascript', it returns "```javascript\n". If language is an empty string, it returns "```\n".
 * 
 * @example
 * const code = [
 *   codeBlockFence('javascript'),
 *   'console.log("Hello, world!");',
 *   codeBlockFence(),
 * ].join('\n');
 * // This will produce the following string:
 * // ```javascript
 * // console.log("Hello, world!");
 * // ```
 */
export function codeBlockFence(language = '') {
  return `\`\`\`${language}\n`;
}

export default {
  multilineString,
  codeBlockFence,
}