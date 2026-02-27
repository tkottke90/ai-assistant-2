---
name: pr-local
description: Review the pending changes as if it was a pull request
agent: Project Engineer Review
---

You task is to review the current pending changes in the local git repository as if they were part of a pull request.

## Steps

1. Identify the files that have been changed, added, or deleted in the local git repository.
2. For each changed file, analyze the code modifications in detail.
3. Evaluate the code quality, including readability, maintainability, and adherence to coding standards.
4. Check for potential bugs, security vulnerabilities, and performance issues in the changes.
5. Assess the overall design and architecture of the changes, ensuring they align with best practices
6. Check for proper testing, including unit, orchestration, and external-orchestration tests.
7. Summarize your findings, highlighting both strengths and areas for improvement.

## Summary Format

Provide a clear and structured summary that includes:

1. **Overview of Changes**: A brief description of the overall changes made in the pull request.
2. **Detailed Review**:
   - For each file, provide specific feedback on the changes, including:
     - Code quality and readability
     - Potential issues or bugs
     - Suggestions for improvement
3. **Testing Assessment**: Evaluate the adequacy of the tests provided and suggest any additional tests that may be necessary.
4. **Design and Architecture**: Comment on the design choices made and their alignment with best practices.
5. **Final Recommendations**: Provide actionable recommendations for the author to improve the code before merging.

## Additional Guidance

- Avoid code block examples in your review as this makes the summary harder to read.
- Be concise but thorough in your analysis.
- Use bullet points and headings to organize your feedback clearly.