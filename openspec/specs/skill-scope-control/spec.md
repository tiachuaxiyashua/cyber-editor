# skill-scope-control Specification

## Purpose
Define effective skill resolution, session or project scope display, and scope-aware skill activation behavior.

## Requirements

### Requirement: The system SHALL display the effective Skill set in the active sidebar context
The system SHALL display the Skills currently in effect for the active session in both the dedicated Skills view and the active session header, including whether each Skill comes from project defaults or session-specific scope.

#### Scenario: Viewing active Skills in session context
- **WHEN** the active session has one or more effective Skills
- **THEN** the Skills view SHALL show the effective Skill set with its source scope information
- **AND** the active session header SHALL surface a compact summary of the same effective Skills
