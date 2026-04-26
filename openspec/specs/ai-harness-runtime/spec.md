# ai-harness-runtime Specification

## Purpose
TBD - created by archiving change p047-ai-harness-context-compaction. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL manage AI runs through a unified harness runtime
The system SHALL execute long-running AI runs as persisted background jobs that remain observable and controllable beyond the original page request lifecycle.

#### Scenario: A run remains visible after the user leaves the current page
- **WHEN** the user starts a long-running task and then switches page, collapses panels, or rehydrates the workspace
- **THEN** the system SHALL still expose the persisted run with its current status, heartbeat, and latest checkpoint summary
- **AND** SHALL not require the original page-local request promise to remain alive

### Requirement: The system SHALL compact long conversation context before budget overflow
The system SHALL evaluate the assembled conversation context against a budget and SHALL compact older history into structured summaries before the request exceeds the configured limit.

#### Scenario: Compacting a long conversation
- **WHEN** the assembled context would exceed the configured runtime budget
- **THEN** the system SHALL replace lower-priority historical content with a persisted structured summary
- **AND** SHALL retain pinned evidence, the active document, and the latest high-priority turns in the final context

### Requirement: The system SHALL support stop, retry, and continue semantics for AI runs
The system SHALL treat pause as a two-step runtime transition and only enter a resumable paused state after reaching a valid checkpoint boundary.

#### Scenario: Requesting pause while a task is still running
- **WHEN** the user requests pause for a running task
- **THEN** the system SHALL mark the run as `pause-requested`
- **AND** SHALL continue only until the next valid checkpoint boundary
- **AND** SHALL transition the run to `paused` only after the checkpoint is durably recorded

#### Scenario: Resuming from the latest legal checkpoint
- **WHEN** the user resumes a paused run with a valid checkpoint
- **THEN** the system SHALL continue from the latest legal checkpoint instead of restarting the full task
- **AND** SHALL preserve source lineage and recovery metadata for the resumed execution

