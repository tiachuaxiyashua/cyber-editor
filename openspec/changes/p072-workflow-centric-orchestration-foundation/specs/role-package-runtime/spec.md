## ADDED Requirements

### Requirement: The system SHALL import dependency-aware role packages
The role package runtime SHALL allow a role package manifest to declare required dependencies and SHALL evaluate those dependencies during import instead of treating bound skills as metadata-only references.

#### Scenario: Installing required skill dependencies during role package import
- **WHEN** the user imports a role package whose manifest declares required skill dependencies
- **THEN** the system SHALL attempt to install those required skills during the import flow
- **AND** SHALL persist the dependency install result alongside the installed role package metadata

#### Scenario: Marking a role package partial when a required dependency fails
- **WHEN** a required dependency cannot be installed during role package import
- **THEN** the system SHALL keep the install result as a warning or partial health state
- **AND** SHALL identify the failing dependency so the user can repair the package before runtime use
