# document-editing Specification

## Purpose
Define document tab behavior, editor interactions, save semantics, and editing ergonomics inside the Cyber Editor document workspace.
## Requirements
### Requirement: The system SHALL support multi-document tab navigation
The system SHALL allow users to keep multiple documents open in the center pane, switch between them using tabs, close the active tab, and reopen recently closed documents within the current session.

#### Scenario: Switching between open document tabs
- **WHEN** the user opens multiple documents and selects another tab
- **THEN** the system SHALL activate the selected document without losing unsaved state in the previously active tab

#### Scenario: Reopening a recently closed document
- **WHEN** the user invokes reopen-last-closed-document during the same session
- **THEN** the system SHALL restore the most recently closed document tab with its document path and view context

### Requirement: The system SHALL support in-document find and replace
The system SHALL support find, next-match, previous-match, replace-current, and replace-all operations for the active document in editable modes.

#### Scenario: Finding and replacing text in the active document
- **WHEN** the user enters a query and replacement value for the current document
- **THEN** the system SHALL show match counts, navigate between matches, and apply replacements only to the active document

### Requirement: The system SHALL import visual references directly into the active document
The system SHALL support inserting stable project artifact links and embeds into the active markdown document in addition to image references.

#### Scenario: Inserting an artifact embed into the active document
- **WHEN** the user chooses to insert a table or diagram artifact into the active document
- **THEN** the editor SHALL insert the supported artifact reference syntax at the current cursor position
- **AND** SHALL preserve that reference through save and reopen

### Requirement: The system SHALL resolve external document changes explicitly
The system SHALL detect when an open document changes on disk outside the current edit action and SHALL require an explicit user decision before discarding unsaved local edits.

#### Scenario: External change arrives while the document has unsaved edits
- **WHEN** the active document changes on disk and the current editor has unsaved local changes
- **THEN** the system SHALL prompt the user to reload from disk, overwrite with local content, or defer resolution

#### Scenario: External change arrives without unsaved local edits
- **WHEN** the active document changes on disk and the current editor has no unsaved local changes
- **THEN** the system SHALL surface the change and allow the user to reload the newest disk version without data-loss ambiguity

### Requirement: The system SHALL support structured Markdown insertion through one editor adapter contract
Structured Markdown authoring SHALL route through one editor-adapter contract that preserves Markdown as the only source of truth while exposing slash-menu and lightweight block insertion actions.

#### Scenario: Inserting a structured block from the slash menu
- **WHEN** the user types `/` on an editable Markdown line and chooses a supported block such as heading, task list, code block, Mermaid, or mindmap
- **THEN** the system SHALL insert the corresponding Markdown syntax through the shared editor adapter
- **AND** SHALL preserve a valid Markdown draft that can be saved and reopened without private editor metadata

#### Scenario: Suppressing structured insertion inside a protected block
- **WHEN** the cursor is inside a code block or another block context that does not allow plain structured insertion
- **THEN** the system SHALL not open or apply the generic structured insertion action
- **AND** SHALL keep the existing Markdown draft unchanged

