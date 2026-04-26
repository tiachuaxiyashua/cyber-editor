# runtime-observability Specification

## Purpose
TBD - created by archiving change p050-runtime-observability-and-approval-closure. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL expose summarized runtime state for long-running work
The system SHALL project runtime controls from persisted background state so the UI only shows actions that are legal for the current long-running task.

#### Scenario: Inspecting a run that is waiting to pause
- **WHEN** the user inspects a run in `pause-requested`
- **THEN** the system SHALL show that the task is waiting for a safe checkpoint boundary
- **AND** SHALL not present the run as already paused or resumable

#### Scenario: Inspecting a run that is paused
- **WHEN** the user inspects a run in `paused`
- **THEN** the system SHALL show the latest checkpoint summary and resume entry
- **AND** SHALL hide unsupported actions that would contradict the persisted run state

### Requirement: The system SHALL preserve recovery entry points for interrupted work
The system SHALL preserve resumable recovery entry points for paused background work so the user can continue from the latest legal checkpoint instead of restarting blindly.

#### Scenario: Resuming a paused run from a persisted checkpoint
- **WHEN** the user rehydrates the workspace or reopens the project after a run was paused at a safe checkpoint
- **THEN** the system SHALL still expose the latest checkpoint summary and resume entry
- **AND** SHALL continue from that persisted recovery point instead of restarting the full task

### Requirement: The system SHALL show user-readable runtime error and rollback summaries
The system SHALL translate runtime failures, quality-gate blocks, deterministic fallback outcomes, and rollback results into product-visible summaries without requiring the user to inspect raw internal logs.

#### Scenario: Reviewing a rollback outcome
- **WHEN** a run or task ends after a rollback or cleanup path
- **THEN** the system SHALL show what failed, what cleanup or rollback was performed, and what remains unresolved

#### Scenario: Reviewing a quality-gate block
- **WHEN** a run ends because a core artifact was degraded or blocked by its quality gate
- **THEN** the system SHALL show which artifact was blocked, why the result was rejected, and what recovery actions remain available

### Requirement: The system SHALL show user-readable summaries for branch, iteration, and subflow scopes
The runtime summary UI SHALL expose user-readable summaries for parallel branches, loop iterations, subflow calls, and their terminal outcomes without requiring the user to inspect raw event logs first.

#### Scenario: Inspecting a complex orchestration run
- **WHEN** the user opens the runtime summary for a run that contains parallel branches, loop iterations, or subflow calls
- **THEN** the system SHALL show the state of those scopes in a user-readable summary
- **AND** SHALL identify which scope is currently blocked, failed, completed, or waiting

#### Scenario: Inspecting a subflow failure from the parent context
- **WHEN** a subflow fails inside a parent run
- **THEN** the system SHALL show the failing child scope and the parent node that triggered it
- **AND** SHALL expose the supported next actions from that parent-visible context

### Requirement: The system SHALL preview rerun and continue plans before execution
The runtime summary UI SHALL preview the computed rerun or continue plan before the system invalidates outputs or resumes execution.

#### Scenario: Reviewing a continue-from-node plan
- **WHEN** the user chooses to continue from a selected node in a previous run
- **THEN** the system SHALL show which upstream results will be reused
- **AND** SHALL show which downstream scopes and artifacts will be invalidated or replayed before the user confirms

#### Scenario: Reviewing a node-scoped debug run
- **WHEN** the user chooses to debug a single node
- **THEN** the system SHALL show the execution scope of that action
- **AND** SHALL clarify that unrelated node outputs will remain unchanged unless the user later applies a rerun plan

### Requirement: The system SHALL expose approval, rollback, and rerun summaries as auditable process blocks
Runtime observability SHALL expose approval decisions, rollback or cleanup outcomes, and rerun-plan summaries as auditable process blocks instead of raw event-log fragments.

#### Scenario: Reviewing a blocked or recovered run
- **WHEN** the user inspects a run that was blocked by approval, ended through rollback, or is resumable through a rerun plan
- **THEN** the system SHALL show user-readable process blocks for that outcome
- **AND** SHALL identify the persisted evidence and supported next action without requiring the user to interpret raw internal event payloads first

