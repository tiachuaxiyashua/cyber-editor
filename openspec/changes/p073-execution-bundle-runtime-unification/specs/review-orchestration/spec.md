## ADDED Requirements

### Requirement: The system SHALL resolve review runs from structured reviewer execution profiles
Review orchestration SHALL resolve reviewer runtime settings from structured execution profiles instead of depending on raw role defaults alone.

#### Scenario: Starting a reviewer run with a structured execution profile
- **WHEN** a review round starts for a reviewer whose execution profile is declared
- **THEN** the system SHALL resolve that reviewer's role profile, task template, and agent profile
- **AND** SHALL execute the review round through the resulting execution bundle
