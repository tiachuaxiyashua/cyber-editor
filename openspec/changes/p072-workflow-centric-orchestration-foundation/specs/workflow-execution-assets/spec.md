## ADDED Requirements

### Requirement: The system SHALL persist workflow execution assets as separate platform objects
The system SHALL persist role profiles, task templates, and agent profiles as separate platform assets instead of requiring a single role object to carry all execution configuration.

#### Scenario: Saving workflow execution assets
- **WHEN** the user or runtime saves orchestration platform assets for a project
- **THEN** the system SHALL persist role profiles, task templates, and agent profiles in separate platform asset files
- **AND** SHALL make those assets available for later runtime and workspace resolution

### Requirement: The system SHALL provide compatibility migration from legacy role-centric assets
The system SHALL normalize legacy role-centric asset fields into workflow-centric role profile and agent profile defaults so existing projects remain loadable during migration.

#### Scenario: Loading a legacy role-centric project
- **WHEN** the project contains legacy role records without task template or agent profile assets
- **THEN** the system SHALL derive compatible role profile and default agent profile values from the legacy role fields
- **AND** SHALL preserve legacy project behavior until the project is explicitly upgraded
