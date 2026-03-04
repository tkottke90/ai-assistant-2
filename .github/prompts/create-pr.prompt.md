---
name: create-pr
description: Generates a GitHub Pull Request based on the current branch's changes and the target branch.
agent: agent
model: Claude Sonnet 4.6 (copilot)
tools: [execute, read, edit, search, web, mcp_docker/get_label, mcp_docker/get_tag, mcp_docker/issue_read, mcp_docker/list_branches, mcp_docker/list_issues, mcp_docker/list_pull_requests, mcp_docker/list_tags]
---

Please create a Pull Request for the current branch against the default branch of the repository.  You will complete this task using the Github CLI (`gh`) and standard Git commands. Follow the steps below to gather necessary information, review changes, and generate a clear PR description before creating the PR.

## Important: GH CLI Usage

Always use `GH_PAGER=cat gh` in place of `gh` for all GitHub CLI commands. The default `gh` command runs in interactive/paged mode which never terminates in an automated context.

## Instructions

1. **Capture a Git Diff**
  - Compare the current branch against the specified target branch (default branch)
  - Ensure the diff is accurate and up-to-date

2. **Analyze and Summarize Changes**
  - Review all file modifications, additions, and deletions
  - Identify new features, refactors, test updates, and removals

3. **Generate a PR Description**
  - Use Clear Professional Language
  - Save the description to a temporary file (e.g. `/tmp/pr-description.md`)
  - Structure the description with the following sections:
    - Overview of the Changes
      - Explain the purpose of the PR and the problem it solves
    - Summary of File Changes
      - List key files changed and the nature of changes (added, modified, deleted)
    - Summary of Process/Logic Changes
      - Describe any significant changes to the application's logic or structure
    - Deployment Notes/Details (if applicable)
      - Include any important information for reviewers regarding deployment or testing
    - Additional Context
      - Provide any relevant links, references, or context that would help reviewers understand the changes

4. **Create the Pull Request**
  - Use the `gh pr create` command with the appropriate flags to specify the base branch, head branch, title, and body
    - use `--body-file` option to specify the path to the PR description file created in step 3
  - Ensure the PR title is concise and descriptive of the changes made
  - Set the correct base and head branches
  - Do not open a browser or prompt for interactive input during PR creation
  - Output the PR URL for review

## Additional Guidance

- **Repository Context Awareness**: Detect repository type and adjust PR description content accordingly (e.g. if it's a web application, highlight UI changes; if it's a library, focus on API changes)
- **Change Impact Assessment**: Automatically flag high-imact changes (e.g. changes to core functionality, breaking changes) in the PR description to alert reviewers
- **Error Handling**: If any step fails (e.g. git diff command fails, or PR creation fails), provide a clear error message and halt the process to avoid creating incomplete or incorrect PRs
- **Best Practices**: Follow best practices for PR descriptions, such as using bullet points for clarity, keeping sentences concise, and avoiding jargon that may not be universally understood by all reviewers
- **Image Handling**: If images would improve the quality of the PR description (e.g. screenshots of UI changes), include `<image needed>` placeholders in the description and inform the user to manually add images by editing the PR after creation, as automated image uploads are not supported in this context.


## Example Workflow

1. User runs prompt to create a PR
2. Agent verifies git status and captures diff against default branch
3. Agent confirms target branch (defaults to 'main' if not specified)
4. Agent checks for existing PRs for the same branch to avoid duplicates
5. Agent captures and analyzes the diff
6. Agent generates a structured PR description and saves it to a file in the `/tmp` directory
7. Agent creates the PR using `gh pr create` with the generated description
8. Agent outputs the URL of the created PR for user review
10. If any step fails, the agent provides a clear error message and halts the process to prevent incomplete PR creation.