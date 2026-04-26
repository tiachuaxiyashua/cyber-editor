# test-harness Specification

## Purpose
Define automated smoke coverage, regression harness expectations, and validation entry points for the core Cyber Editor workflow.
## Requirements
### Requirement: The system SHALL include smoke coverage for the primary planning journey
The system SHALL treat discover and clarify artifact quality as first-class regression gates in the real-model planning journey.

#### Scenario: Failing regression on weak discover quality
- **WHEN** the real-model closed-loop run produces a discover artifact that falls below the configured quality floor or lacks required discover contract sections
- **THEN** the regression SHALL fail even if later stages still complete mechanically

#### Scenario: Failing regression on weak clarify quality
- **WHEN** the real-model closed-loop run produces a clarify artifact that falls below the configured quality floor or lacks required clarify contract sections
- **THEN** the regression SHALL fail
- **AND** SHALL preserve the per-dimension quality report in the evidence pack

