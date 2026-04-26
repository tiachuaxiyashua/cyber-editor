# Repo Local Instructions

## Docs Single Source

- `docs/` is the only current documentation system for Cyber Editor. Do not create parallel documentation or archive-style truth sources.
- Before any product, UI, architecture, runtime, safety, or test change, read `docs/README.md`, then the relevant files under `docs/01-需求与PRD/`, `docs/02-产品设计/`, `docs/03-架构实现/`, `docs/04-测试验收/`, and task-relevant details under `docs/06-详细设计库/`.
- For broad system reviews, global refactors, feature-state claims, or release decisions, read the whole `docs/` tree first.
- Do not treat a UI shell, callable API, or old status label as completion. Mature completion means: document consistency, code owner, user-visible path, tests/evidence, and packaged-app proof where user-facing.
- If code conflicts with `docs/`, update or propose a documentation change first. Do not silently implement from conflicting assumptions.
- Do not delete detailed design content merely to simplify docs. First migrate the detail into the current source file or `docs/06-详细设计库/`, then remove only duplicated or obsolete wording.

## GitHub Synchronization

- The GitHub repository is the source-controlled handoff path for this project. All durable code, docs, tests, scripts, and configuration changes must be committed through git and pushed to the GitHub remote.
- Before starting any code or document modification, run `git status --short` and synchronize with the remote using `git fetch origin` plus the appropriate pull/rebase flow for the current branch. Do not begin from an unknown local-only state.
- Before handing work back, commit the completed change with a clear message and push it to the remote branch unless the user explicitly asks not to commit or push.
- Do not commit local runtime state, build output, test artifacts, recovered scratch material, `node_modules/`, packaged executables, `.env*`, or secrets. Keep those excluded by `.gitignore`.
- If the remote is unavailable or authentication fails, stop and report the exact blocker before making further durable changes.

## UI Validation And Screenshots

- When validation, screenshots, or Electron/desktop regression work needs to open the app UI on Windows, run it from an extra Windows virtual desktop instead of the user's primary desktop.
- Avoid any workflow that makes the primary screen flash, steals focus on the main desktop, or visibly disrupts the user's current workspace.

## Packaged Runtime Validation

- Once a packaged Cyber Editor build exists, all user-facing validation must use the packaged executable under `out/package/` instead of `electron .` as the final proof path.
- Preserve manual verification projects under `out/manual-projects/`, not under `out/package/`, so repackaging does not delete the project the user needs to reopen later.
- If the preserved verification project lives outside `out/package/`, the packaged app folder must still contain a visible launcher or pointer entry so a human opening `out/package/...` can immediately find and reopen the exact verification project.
