# document-rendering Specification

## Purpose
TBD - created by archiving change p004-build-document-rendering-pipeline. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL treat Markdown files as the source of truth for documents
The system SHALL parse project Markdown files into a document model that can be rendered and serialized back to Markdown without losing supported content blocks.

#### Scenario: Opening a Markdown document
- **WHEN** the user opens a supported Markdown file from the project tree
- **THEN** the system SHALL parse it into the document model and render it in the center pane

### Requirement: The system SHALL render mixed document content inline in reading view
The reading view SHALL render supported artifact references as lightweight inline previews or linked cards instead of raw unresolved tokens.

#### Scenario: Rendering an embedded table or diagram artifact
- **WHEN** the opened markdown document contains a supported artifact embed reference
- **THEN** the reading view SHALL render a lightweight preview or linked artifact card in document order

#### Scenario: Showing a broken artifact reference
- **WHEN** the document contains an artifact reference whose target no longer exists or cannot be resolved
- **THEN** the reading view SHALL show a recoverable broken-link state for that block
- **AND** SHALL keep the rest of the document readable

### Requirement: The system SHALL isolate block-level rendering failures
The system SHALL keep the rest of the document readable when a specific block fails to render and SHALL show a block-level error state for the failed content.

#### Scenario: Diagram block fails to render
- **WHEN** a supported block contains invalid content that cannot be rendered
- **THEN** the system SHALL display an error state for that block while preserving the rest of the document view

