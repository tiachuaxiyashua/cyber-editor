## ADDED Requirements

### Requirement: The system SHALL assemble a unified execution bundle for workflow runtime
The runtime SHALL assemble a unified execution bundle from the bound role profile, task template, agent profile, and node-scoped overrides before an agent node starts execution.

#### Scenario: Starting a workflow agent node with split bindings
- **WHEN** a workflow agent node has a resolvable role profile, task template, and agent profile binding
- **THEN** the runtime SHALL merge those bindings into one effective execution bundle
- **AND** SHALL use that bundle as the runtime source for skills, capabilities, and model policy

### Requirement: The system SHALL preserve execution bundle source attribution
The runtime SHALL retain source attribution for effective execution fields so the workspace and diagnostics can explain whether a skill, capability, or policy came from the role, task, agent profile, or node override.

#### Scenario: Inspecting an execution bundle
- **WHEN** the system resolves an execution bundle for a node
- **THEN** the bundle SHALL include source attribution for effective fields
- **AND** SHALL expose that attribution to downstream diagnostics or UI consumers
