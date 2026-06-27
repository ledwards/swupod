# AGENTS.md

## Git Worktree Protocol

This repository may be shared by multiple agents at the same time. Do not change branches in the main checkout for agent work.

- Use a dedicated git worktree for each agent task or parallel feature.
- If work touches multiple repos, create one worktree per repo with matching branch names.
- Inspect dirty state and existing worktrees before moving or committing changes.
- Do not run `git checkout` or `git switch` in a shared checkout unless the user explicitly asks for that exact operation.
- Never disrupt another agent's uncommitted work.
