# rich-document-artifacts Specification

## Purpose
TBD - created by archiving change p049-human-ai-merge-and-rich-artifacts. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL manage table-style artifacts as first-class project files
The system SHALL allow table artifacts to be created, reopened, lightly edited, and saved as stable project assets instead of transient view state.

#### Scenario: Creating and reopening a table artifact
- **WHEN** the user creates a new table artifact and later reopens it from the project
- **THEN** the system SHALL restore the stored table structure and content
- **AND** SHALL preserve the same artifact identity for future document references

### Requirement: The system SHALL allow markdown documents to reference linked project artifacts
Markdown documents SHALL support stable link and embed semantics for project artifacts such as tables and diagrams.

#### Scenario: Inserting a table artifact reference into markdown
- **WHEN** the user inserts a reference to a table artifact into a markdown document
- **THEN** the system SHALL serialize a stable artifact reference
- **AND** SHALL keep that reference resolvable after save, reopen, and export

### Requirement: The system SHALL preserve artifact references through save and export flows
The system SHALL keep artifact link metadata stable when documents are saved, reopened, or exported through supported handoff flows.

#### Scenario: Saving a document with linked artifacts
- **WHEN** the user saves a markdown document that references project artifacts
- **THEN** the system SHALL preserve the artifact link metadata
- **AND** SHALL keep those links resolvable when the project is reopened

### Requirement: The system SHALL support lightweight in-workbench table editing
The workbench SHALL support lightweight editing for first-class table artifacts so users can inspect and make small structural or cell updates without leaving the editor.

#### Scenario: Editing and reopening a table artifact
- **WHEN** the user opens a table artifact, edits cells or rows, saves it, and later reopens it
- **THEN** the workbench SHALL restore the saved table data
- **AND** SHALL preserve the artifact as the same project file instead of exporting a detached temporary copy

### Requirement: The system SHALL keep markdown artifact links and embeds reopen-safe
Markdown references to project artifacts SHALL remain usable after save, reopen, and renderer mode switches.

#### Scenario: Following a saved artifact reference
- **WHEN** the user inserts an artifact link or embed into markdown, saves the document, and later follows that reference
- **THEN** the system SHALL reopen the referenced artifact successfully
- **AND** SHALL preserve the same reference target across workbench reloads

