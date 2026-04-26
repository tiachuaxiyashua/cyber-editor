## ADDED Requirements

### Requirement: The system SHALL resolve stage execution from structured execution profiles
Stage execution SHALL resolve its runtime context from a structured execution profile that identifies the role profile, task template, and agent profile for that stage instead of depending only on raw role defaults.

#### Scenario: Generating a stage draft through an execution profile
- **WHEN** the user triggers stage draft generation for a stage that declares an execution profile
- **THEN** the system SHALL resolve the role profile, task template, and agent profile for that stage
- **AND** SHALL assemble the stage runtime context from the resulting execution bundle
