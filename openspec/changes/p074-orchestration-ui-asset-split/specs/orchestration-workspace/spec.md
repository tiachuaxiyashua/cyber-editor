## MODIFIED Requirements

### Requirement: The system SHALL support reusable role assets for orchestration nodes
The system SHALL allow users to create and maintain roles, task templates, and agent profiles that agent nodes can reference separately inside the orchestration workspace.

#### Scenario: Binding role, task template, and agent profile to an agent node
- **WHEN** the user selects an agent node and chooses a role, task template, and agent profile
- **THEN** the system SHALL persist those bindings on that node
- **AND** SHALL show the bound role, task template, and agent profile details in the inspector

### Requirement: The system SHALL block invalid role, connector, and tool bindings on orchestration nodes
The orchestration workspace SHALL only allow a node to run when its required role, task template, agent profile, connector, and tool bindings resolve to valid local registry entries or compatible migration defaults.

#### Scenario: Blocking a run with an invalid workflow execution binding
- **WHEN** a user attempts to run a flow whose node references a missing or invalid role, task template, agent profile, connector, or tool binding
- **THEN** the system SHALL block the run
- **AND** SHALL show which binding is invalid and how to fix it

## ADDED Requirements

### Requirement: The orchestration workspace SHALL preview effective execution settings for agent nodes
The orchestration workspace SHALL show the effective execution summary for an agent node, including the resolved skill set and execution-source attribution available to the workspace.

#### Scenario: Reviewing an agent node execution preview
- **WHEN** the user inspects an agent node that has resolvable workflow execution bindings
- **THEN** the workspace SHALL show the effective execution summary for that node
- **AND** SHALL identify the available source attribution for the effective settings
