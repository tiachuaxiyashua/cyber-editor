# artifact-contract-governance Specification

## Purpose
Define artifact IO contract validation, invalidation propagation, and rerun advice inside the orchestration runtime.
## Requirements
### Requirement: The system SHALL validate node IO contracts against declared artifact catalogs
Every node-bound artifact input or output SHALL be validated against the flow's artifact catalog, stage contract, and active execution scope, including branch, loop-iteration, and subflow boundaries, before execution or writeback.

#### Scenario: Blocking a node with an invalid artifact binding
- **WHEN** a node references an artifact that is missing, mismatched, outside its declared contract, or outside the active runtime scope
- **THEN** the system SHALL block the node execution
- **AND** SHALL record the contract failure as structured runtime evidence

#### Scenario: Blocking a subflow with an invalid mapped artifact
- **WHEN** a subflow node maps a parent artifact into a child input that does not satisfy the declared child contract
- **THEN** the system SHALL block the subflow execution
- **AND** SHALL explain which mapping is invalid before any child writeback occurs

### Requirement: The system SHALL propagate artifact invalidation and suggest downstream reruns
When a required upstream artifact changes or becomes invalid, the system SHALL mark dependent artifacts as invalidated and compute which downstream nodes should be rerun.

#### Scenario: Upstream artifact invalidates downstream output
- **WHEN** an upstream artifact revision changes after a downstream output was produced
- **THEN** the system SHALL mark the dependent downstream artifact as invalidated
- **AND** SHALL surface a rerun suggestion for the dependent node or stage

### Requirement: The system SHALL compute scoped rerun plans for partial execution
When a user debugs a node, resumes from a selected node, or reruns part of a complex flow, the system SHALL compute a scoped rerun plan that distinguishes reusable upstream outputs from invalidated downstream outputs inside the affected branch, loop, or subflow scope.

#### Scenario: Rerunning one branch without invalidating unrelated branches
- **WHEN** the user reruns a node inside one branch of a completed parallel group
- **THEN** the system SHALL invalidate only the outputs that depend on that branch lineage
- **AND** SHALL keep unrelated sibling-branch outputs reusable unless the join policy requires recomputation

#### Scenario: Continuing from a node after upstream reuse
- **WHEN** the user chooses to continue from a node in a run whose upstream artifacts are still valid
- **THEN** the system SHALL preserve the reusable upstream artifacts
- **AND** SHALL clear or invalidate only the downstream artifacts and scopes that must be recomputed

### Requirement: The system SHALL resolve governed artifact paths through the flow IO directory contract
Runtime artifact bindings, rerun decisions, and export mapping SHALL resolve through the persisted flow IO directory contract plus any valid node-scoped overrides instead of bypassing that contract with ad hoc path rules.

#### Scenario: Resolving an artifact path for runtime and export
- **WHEN** a node or export mapping references an artifact that lives under the current flow IO configuration
- **THEN** the system SHALL resolve the effective artifact path through the flow IO directory contract
- **AND** SHALL reject bindings that escape the allowed contract boundary or conflict with governed naming rules

### Requirement: The system SHALL require governed preview before applying artifact writeback or merge outcomes
Artifact writeback, patch application, and merge resolution SHALL expose a governed preview/result path that preserves traceability, rollback context, and structured failure reasons.

#### Scenario: Reviewing a governed writeback outcome
- **WHEN** the runtime or user action proposes a writeback or merge resolution for an artifact
- **THEN** the system SHALL route that operation through the governed writeback path
- **AND** SHALL preserve preview/result evidence that explains what changed or why the operation was blocked

