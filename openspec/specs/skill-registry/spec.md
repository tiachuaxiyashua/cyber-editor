# skill-registry Specification

## Purpose
Define skill browsing, installation or import, lifecycle display, and registry behavior for reusable Cyber Editor skills.
## Requirements
### Requirement: The system SHALL expose a remote skill catalog for browsing
The system SHALL allow users to browse a remote catalog of available Skills from a dedicated primary-sidebar Skills view, including metadata such as name, description, source, version, applicable stages, trust summary, and install provenance, and it SHALL support installing a selected catalog entry through the governed Skill registry path.

#### Scenario: Viewing available Skills
- **WHEN** the user opens the Skills management view and requests downloadable Skills
- **THEN** the system SHALL display the remote Skill catalog with available metadata inside that view

#### Scenario: Installing a Skill from the remote catalog
- **WHEN** the user selects a remote Skill catalog entry whose trust and compatibility checks pass
- **THEN** the system SHALL install that Skill through the Skill registry
- **AND** SHALL preserve the remote source and install provenance in the installed Skill metadata

### Requirement: The system SHALL block unsafe Skill deletion
The system SHALL prevent deletion of a locally installed Skill while that Skill is still referenced by an active project or session scope and SHALL display the dependency state inside the Skills view.

#### Scenario: Deleting a referenced Skill
- **WHEN** the user attempts to delete an installed Skill that is still referenced
- **THEN** the system SHALL block the deletion and show the remaining dependency state inside the Skills view

### Requirement: The system SHALL register locally promoted Skills as normal installed Skills
The Skill registry SHALL treat a locally promoted Skill as a normal installed Skill with lifecycle metadata, source information, and provenance references.

#### Scenario: Viewing a promoted Skill in the registry
- **WHEN** a Skill promotion has been accepted and installed
- **THEN** the Skill registry SHALL list that Skill with its installed metadata
- **AND** SHALL preserve the link back to the promotion and source accumulation entry

