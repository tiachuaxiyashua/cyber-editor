# delivery-handoff Specification

## Purpose
TBD - created by archiving change p015-generate-openspec-handoff. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL generate OpenSpec handoff documents from confirmed planning inputs
The system SHALL generate OpenSpec handoff artifacts from template-selected confirmed planning inputs and their OpenSpec export mapping rather than from fixed software-factory planning file names.

#### Scenario: Generating OpenSpec from a template-defined artifact set
- **WHEN** the user triggers OpenSpec generation for a project whose template defines a custom confirmed artifact set
- **THEN** the system SHALL select handoff source artifacts from the template-defined contract
- **AND** SHALL NOT assume fixed paths such as `01-requirements/01-原始需求.md` or `02-solution/01-技术方案.md`

### Requirement: The system SHALL require pre-handoff validation before finalizing OpenSpec output
The system SHALL verify that required planning artifacts exist and pass the configured consistency gate before finalizing OpenSpec handoff documents.

#### Scenario: Blocking OpenSpec finalization on failed validation
- **WHEN** required planning artifacts are missing or fail consistency checks
- **THEN** the system SHALL block OpenSpec finalization and report the blocking issues

### Requirement: The system SHALL persist OpenSpec outputs as project files
The system SHALL write generated OpenSpec outputs into the active project workspace so they can be reviewed, exported, and handed off to developers.

#### Scenario: Saving OpenSpec outputs to the project
- **WHEN** OpenSpec generation succeeds
- **THEN** the system SHALL persist the generated OpenSpec files inside the active project workspace

### Requirement: The system SHALL block handoff export on unresolved required artifact invalidation
Export and handoff generation SHALL not finalize while required artifacts remain invalidated or unresolved.

#### Scenario: Blocking export on stale required output
- **WHEN** the user triggers an export while a required artifact is marked invalidated
- **THEN** the system SHALL block the export
- **AND** SHALL show which artifact must be rerun or repaired first

### Requirement: The system SHALL resolve handoff-required artifacts through governed runtime artifact state
Delivery handoff generation SHALL resolve required artifacts through the governed artifact catalog, flow IO directory contract, and invalidation state before finalizing handoff output.

#### Scenario: Generating handoff output after a runtime artifact change
- **WHEN** the user triggers handoff generation after upstream runtime work changed or invalidated one of the required artifacts
- **THEN** the system SHALL evaluate the handoff requirement through the governed artifact state
- **AND** SHALL block finalization until the required artifact is valid again or the user completes the supported repair path

