# Truth Directory Instructions

`truth/` is the emerging source of truth for the future refactor.

- Treat `truth/` as the primary place for future-facing principles, object models, file protocols, and migration direction.
- Treat `docs/` as legacy reference material unless the user explicitly asks to maintain the old system.
- Do not resolve conflicts by forcing `truth/` back into the old `docs/` worldview.
- Do not prematurely convert brainstorms into rigid architecture. Mark open questions clearly.
- When proposing code changes for the future refactor, trace them back to `truth/` first, then use `docs/` and `src/` as migration evidence.
