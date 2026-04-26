# orchestration-workspace Specification

## Purpose
Define the orchestration editor, runtime interaction semantics, binding gates, artifact invalidation visibility, rule visibility, and compact-width behavior inside the Cyber Editor shell.
## Requirements
### Requirement: The system SHALL provide a dedicated orchestration workspace inside the desktop shell
The system SHALL expose an orchestration workspace that users can enter from the activity bar without losing the current project context.

#### Scenario: Opening the orchestration workspace
- **WHEN** the user opens a valid project and clicks the `编排` activity entry
- **THEN** the system SHALL switch the main area into a dedicated orchestration workspace mode
- **AND** the system SHALL preserve the current project and theme context

### Requirement: The system SHALL manage flow and subflow assets as project data
The system SHALL allow users to create, edit, save, duplicate, delete, import, and export flow and subflow assets stored inside the project.

#### Scenario: Saving a flow
- **WHEN** the user edits nodes or edges in the current flow and saves the flow
- **THEN** the system SHALL persist the updated flow asset inside the project platform directory

#### Scenario: Importing a subflow
- **WHEN** the user imports a valid exported subflow package
- **THEN** the system SHALL register it as a project subflow and make it available to subflow nodes

### Requirement: The system SHALL support reusable role assets for orchestration nodes
The system SHALL allow users to create and maintain roles that agent nodes can reference.

#### Scenario: Binding a role to an agent node
- **WHEN** the user selects an agent node and chooses a role
- **THEN** the system SHALL persist the role binding on that node and show the role details in the inspector

### Requirement: The system SHALL support generic orchestration nodes and edge editing
The orchestration workspace SHALL provide generic node types for start, end, agent, tool, condition, and subflow behaviors and SHALL support user-controlled edge creation.

#### Scenario: Adding and connecting nodes
- **WHEN** the user adds nodes to the canvas and connects them
- **THEN** the system SHALL render the nodes and edges on the canvas and persist the resulting graph on save

### Requirement: The system SHALL execute parallel branch groups with explicit join semantics
The orchestration runtime SHALL persist branch-group state for parallel fork nodes, allocate isolated branch execution scopes, apply the configured join and cancellation policies, and SHALL only release a join node when the configured completion rule is satisfied.

#### Scenario: Waiting for all branches at a join
- **WHEN** a run enters a parallel fork and one branch finishes before another under the `all_success` or `all_settled` join policy
- **THEN** the system SHALL persist the finished branch state in that branch scope
- **AND** SHALL keep the join blocked until the remaining required branches reach a terminal state

#### Scenario: Releasing the join on first success
- **WHEN** a parallel group uses the `first_success` join policy and one branch succeeds while others are still running
- **THEN** the system SHALL persist the winning branch result as the join input
- **AND** SHALL cancel, close, or preserve the remaining branches according to the configured cancellation policy before continuing

#### Scenario: Failing the branch group on configured branch error
- **WHEN** a parallel group uses the `stop_all_on_error` failure policy and any active branch fails before join release
- **THEN** the system SHALL mark the branch group as failed
- **AND** SHALL prevent the join from continuing and expose a recoverable next action

### Requirement: The system SHALL support human approval nodes as resumable runtime gates
Approval nodes in the orchestration workspace SHALL support explicit reject-and-cleanup behavior in addition to approve-and-resume behavior.

#### Scenario: Rejecting a waiting node with cleanup
- **WHEN** the user rejects a run that is waiting on an approval node
- **THEN** the system SHALL record the rejection decision
- **AND** SHALL execute the configured cleanup or rollback contract before moving the run into its resulting state

#### Scenario: Hiding invalid approval controls
- **WHEN** the inspected run is not actively waiting on the selected approval node
- **THEN** the workspace SHALL not expose approve or reject actions for that node
- **AND** SHALL explain the current runtime state instead

### Requirement: The system SHALL block invalid role, connector, and tool bindings on orchestration nodes
The orchestration workspace SHALL only allow a node to run when its required role, connector, and tool bindings resolve to valid local registry entries.

#### Scenario: Blocking a run with an invalid binding
- **WHEN** a user attempts to run a flow whose node references a missing or damaged role package, connector, or tool
- **THEN** the system SHALL block the run
- **AND** SHALL show which binding is invalid and how to fix it

### Requirement: The orchestration workspace SHALL surface artifact invalidation and rerun advice
The orchestration workspace SHALL show when artifacts become invalidated and SHALL present the affected downstream rerun path to the user.

#### Scenario: Reviewing rerun advice after an upstream change
- **WHEN** an upstream artifact change invalidates downstream outputs
- **THEN** the workspace SHALL show the invalidated artifact state
- **AND** SHALL identify which downstream node or stage should be rerun

### Requirement: The orchestration workspace SHALL show effective and conflicting rules on bound nodes
The orchestration workspace SHALL let users bind scoped rules to nodes and SHALL show the effective rule set plus any conflicts or overrides.

#### Scenario: Reviewing node rule conflicts
- **WHEN** a node has conflicting rules across scopes
- **THEN** the workspace SHALL show the conflict
- **AND** SHALL explain which rule is effective and why

### Requirement: The orchestration workspace SHALL preserve deep-entry panel state and remain stable at compact widths
The orchestration workspace SHALL persist inspector and deep-entry panel widths, preserve canvas context when those panels open or close, and apply deterministic fallback behavior at compact widths.

#### Scenario: Restoring orchestration panel widths
- **WHEN** the user resizes orchestration panels and later returns to the workspace
- **THEN** the system SHALL restore the persisted panel layout for that mode
- **AND** SHALL keep the current flow and canvas context intact

#### Scenario: Collapsing low-priority panels at compact widths
- **WHEN** the orchestration workspace no longer has enough width to show all panels safely
- **THEN** the system SHALL collapse or defer lower-priority panels according to the layout policy
- **AND** SHALL keep the canvas and one primary editing surface usable

### Requirement: The orchestration workspace SHALL persist explicit execution contracts for complex nodes
The orchestration workspace SHALL persist loop, parallel, and subflow execution contracts on nodes and SHALL validate required contract fields before allowing the flow to run.

#### Scenario: Saving a loop execution contract
- **WHEN** the user configures a loop node with maximum iterations, exit mode, timeout, and failure policy and saves the flow
- **THEN** the system SHALL persist that execution contract in the flow asset
- **AND** SHALL restore the same contract when the flow is reopened

#### Scenario: Blocking a node with an incomplete complex contract
- **WHEN** the user attempts to run a flow whose loop, parallel, or subflow node is missing a required execution-contract field
- **THEN** the system SHALL block the run
- **AND** SHALL explain which contract field is missing and where the user can fix it

### Requirement: The orchestration workspace SHALL execute loop nodes with persisted iteration state
The orchestration runtime SHALL execute loop nodes through explicit iteration scopes, persist each iteration result, and stop only when the exit condition, timeout policy, or maximum iteration guard determines the outcome.

#### Scenario: Exiting a loop after a satisfied condition
- **WHEN** a loop iteration produces the configured exit signal before the maximum iteration limit is reached
- **THEN** the system SHALL persist the completed iterations
- **AND** SHALL continue execution from the loop exit path instead of starting another iteration

#### Scenario: Stopping a loop at the maximum iteration guard
- **WHEN** a loop reaches its configured maximum iteration count without satisfying the exit condition
- **THEN** the system SHALL stop the loop with a guarded terminal outcome
- **AND** SHALL expose the reason and available recovery action to the user

### Requirement: The orchestration workspace SHALL execute subflow nodes with explicit parent-child mappings
The orchestration runtime SHALL execute subflow nodes as real child runs, map declared parent inputs into the child flow, map declared child outputs back to the parent flow, and preserve traceability between parent and child scopes.

#### Scenario: Running a subflow with mapped inputs and outputs
- **WHEN** a parent flow reaches a subflow node with valid input and output mappings
- **THEN** the system SHALL start a child subflow scope using the mapped parent artifacts or signals
- **AND** SHALL write the declared subflow outputs back into the parent scope before the parent flow continues

#### Scenario: Reporting a subflow failure in the parent flow
- **WHEN** a child subflow fails during execution
- **THEN** the system SHALL retain the child failure record
- **AND** SHALL show the parent node that triggered the failing subflow so the user can recover from the correct location

### Requirement: The orchestration workspace SHALL support node-scoped debug, continue, and partial rerun actions
The orchestration workspace SHALL let the user run a single node, continue from a selected node, or rerun a scoped part of a flow, and SHALL do so through a deterministic rerun plan instead of blindly restarting the full run.

#### Scenario: Previewing a continue-from-node action
- **WHEN** the user selects a completed or blocked run and chooses to continue from a specific node
- **THEN** the system SHALL compute a rerun plan that identifies reusable upstream results and affected downstream scopes
- **AND** SHALL require the user to confirm that plan before execution starts

#### Scenario: Running a single node in debug mode
- **WHEN** the user triggers a node-scoped debug run for a node whose required inputs are satisfied
- **THEN** the system SHALL execute only that node attempt in an isolated runtime scope
- **AND** SHALL preserve the result and evidence without rewriting unrelated node outputs

### Requirement: The orchestration workspace SHALL keep asset-area switching stable without resetting canvas context
The orchestration workspace SHALL let users switch among flow/subflow, artifact, role, connector, and tool asset groups without resetting the current canvas viewport, selected node, or active runtime context.

#### Scenario: Switching asset groups after editing the canvas
- **WHEN** the user has an active orchestration canvas selection or viewport position and switches the asset area from one group to another
- **THEN** the system SHALL update only the asset-area list/detail surface
- **AND** SHALL keep the current canvas viewport, selection, and inspector/runtime context intact unless the user explicitly changes them

### Requirement: The orchestration workspace SHALL summarize complex runtime scopes and next actions in one process surface
The orchestration workspace SHALL summarize branch groups, loop iterations, subflow calls, approvals, rollback results, and rerun next actions in one user-readable runtime/process surface backed by auditable runtime evidence.

#### Scenario: Inspecting a run with mixed complex scopes
- **WHEN** the user opens runtime details for a run that contains branch groups, loop iterations, subflow calls, and approval or rollback outcomes
- **THEN** the workspace SHALL show those scope summaries in one coherent process surface
- **AND** SHALL expose only the next actions that are legal for the persisted runtime state

