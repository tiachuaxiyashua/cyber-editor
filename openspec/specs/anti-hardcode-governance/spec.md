# anti-hardcode-governance Specification

## Purpose
TBD - created by archiving change p064-hardcode-registry-and-workspace-decomposition. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL provide a repeatable anti-hardcode audit gate for implementation work
The project SHALL provide a repeatable audit workflow that detects business-semantic hardcoding, duplicated registry data, and template-path drift before changes are treated as complete.

#### Scenario: Auditing a change before closure
- **WHEN** a developer completes a change that touches templates, Provider configuration, orchestration, or delivery generation
- **THEN** the project SHALL provide a documented gate or tool that scans for high-risk hardcoding patterns
- **AND** SHALL surface the findings in a reviewable report instead of relying only on manual memory

