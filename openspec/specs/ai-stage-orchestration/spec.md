# ai-stage-orchestration Specification

## Purpose
TBD - created by archiving change p007-build-context-and-stage-orchestration. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL assemble AI context from layered project sources
The system SHALL assemble AI requests from system instructions, project memory, session history, referenced documents, and current stage state.

#### Scenario: Sending a staged AI request
- **WHEN** the user sends a message or triggers a stage action
- **THEN** the system SHALL construct the AI request context from the layered project sources

### Requirement: The system SHALL execute staged AI work through an agent loop
The system SHALL support an execution loop that can analyze the task, call allowed tools, inspect results, and continue until a stage draft or decision point is reached.

#### Scenario: Generating a stage draft
- **WHEN** the user triggers draft generation for the current stage
- **THEN** the system SHALL execute the agent loop until a draft result or structured failure is produced

### Requirement: The system SHALL control workflow progression with a stage state machine
The system SHALL track the current workflow stage, enforce stage confirmation rules, and support controlled rollback when users reject or revisit a stage.

#### Scenario: Confirming a stage
- **WHEN** the user confirms the current stage result
- **THEN** the system SHALL update workflow state and make the next stage available

#### Scenario: Rejecting a stage
- **WHEN** the user rejects the current stage result
- **THEN** the system SHALL keep the workflow in or return it to an editable state instead of progressing

### Requirement: The system SHALL resume staged AI work from persisted orchestration checkpoints
The runtime SHALL resume long-running orchestration work from persisted checkpoints instead of restarting the entire run when recovery data exists.

#### Scenario: Resuming an interrupted orchestration run
- **WHEN** the user resumes a run that has a valid checkpoint and pending runtime state
- **THEN** the system SHALL continue from the persisted checkpoint
- **AND** SHALL append new runtime events to the original run lineage

### Requirement: The system SHALL apply effective rules and promoted knowledge during staged AI execution
Staged AI execution SHALL include the effective scoped rules and explicitly promoted knowledge objects relevant to the current task.

#### Scenario: Generating with effective project rules
- **WHEN** the user runs a stage or node that has applicable scoped rules
- **THEN** the system SHALL include the effective rules in prompt assembly
- **AND** SHALL keep inactive accumulation entries out of the execution context

### Requirement: The system SHALL control stage artifact requirements from runtime template contracts
The system SHALL derive stage draft targets and consistency requirements from the active runtime template's `stageDocuments` and `stageContracts` instead of fixed software-factory file names or directories.

#### Scenario: Running consistency for a non-software template
- **WHEN** the active project uses a template whose confirmed-stage artifacts do not live under `01-requirements/` or `02-solution/`
- **THEN** the system SHALL evaluate consistency against the template-defined artifact paths
- **AND** SHALL NOT require software-factory-specific directories or document names

