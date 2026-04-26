# project-reliability Specification

## Purpose
TBD - created by archiving change p013-add-consistency-recovery-and-audit. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL detect cross-document inconsistencies before handoff
The system SHALL compare key planning artifacts and identify missing or conflicting mappings between requirements, feature definitions, solution plans, and handoff inputs.

#### Scenario: Running a consistency check
- **WHEN** the user or workflow triggers a consistency check before a major handoff stage
- **THEN** the system SHALL report any detected inconsistencies as structured findings

### Requirement: The system SHALL create recoverable snapshots around critical writes
The system SHALL create project snapshots around critical write operations so users can restore the workspace after destructive actions or failed generation.

#### Scenario: Snapshot before a destructive change
- **WHEN** the system is about to perform a critical write or destructive operation
- **THEN** the system SHALL create a recoverable snapshot of the relevant project state

### Requirement: The system SHALL record auditable workflow events
The system SHALL record auditable events for application lifecycle, session actions, review actions, errors, and Skill lifecycle changes.

#### Scenario: Recording a review or Skill lifecycle event
- **WHEN** a tracked workflow event occurs
- **THEN** the system SHALL append an audit record that can be used for later diagnosis or review

### Requirement: The system SHALL persist recoverable orchestration-run history
The system SHALL store recoverable runtime history for both orchestration runs and AI harness session runs, including checkpoints, approval waits, cancellation lineage, retries, and resume metadata, so interrupted work can be inspected and recovered.

#### Scenario: Inspecting a recoverable run
- **WHEN** a run stops in a recoverable state because of interruption, approval wait, cancellation, or recoverable failure
- **THEN** the system SHALL retain recovery metadata and runtime evidence for that run
- **AND** SHALL expose a deterministic resume, retry, continue, or cleanup path

### Requirement: The system SHALL retain auditable trace records for governed runtime actions
The system SHALL persist trace records for trust-checked imports and governed privileged actions so those decisions can be inspected after the run.

#### Scenario: Inspecting governed runtime evidence
- **WHEN** the user or developer reviews a governed runtime action after completion
- **THEN** the system SHALL expose trace metadata that links trust verdict, approval decision, and outcome

### Requirement: The system SHALL persist hierarchical checkpoints for complex orchestration scopes
The system SHALL persist recoverable checkpoints and lineage records for branch groups, loop iterations, subflow calls, and node-scoped rerun attempts so interrupted work can continue from the correct scope instead of restarting the entire run.

#### Scenario: Recovering an interrupted complex run
- **WHEN** a run is interrupted while inside a loop iteration, parallel branch, or subflow call and valid checkpoint data exists
- **THEN** the system SHALL preserve the nested runtime lineage for that interrupted scope
- **AND** SHALL offer a recovery action that resumes from the latest valid checkpoint in that scope

#### Scenario: Creating descendant lineage for a partial rerun
- **WHEN** the user launches a node-scoped rerun or continue-from-node action on a completed run
- **THEN** the system SHALL create descendant lineage that references the original run
- **AND** SHALL preserve the original run evidence instead of overwriting it

### Requirement: The system SHALL create recoverable snapshots before destructive rerun application
The system SHALL create a recoverable snapshot of the affected runtime and artifact state before applying a rerun plan that invalidates or clears existing downstream outputs.

#### Scenario: Snapshot before applying a partial rerun plan
- **WHEN** the user confirms a rerun plan that will invalidate downstream outputs or runtime scopes
- **THEN** the system SHALL create a recoverable snapshot of the affected artifacts and runtime metadata
- **AND** SHALL expose that snapshot as the rollback point for the rerun action

