# resource-registry-metadata Specification

## Purpose
TBD - created by archiving change p069-provider-diagnostics-and-remote-assets-closure. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL expose one unified metadata summary for managed resources
The resource-management surfaces SHALL expose one unified metadata summary for templates, Skills, role packages, providers, and connectors that includes source, version, compatibility, trust, health, and the latest available diagnostic or update summary.

#### Scenario: Inspecting a managed resource in the resource center
- **WHEN** the user selects a template, Skill, role package, provider, or connector in a resource-management surface
- **THEN** the system SHALL show a structured metadata summary using one shared vocabulary for source, trust, compatibility, and health
- **AND** SHALL not require each resource kind to invent a different badge language for the same verdict

### Requirement: The system SHALL block unsupported resource actions with explicit metadata-driven reasons
Unsupported resource actions such as install, create-from-template, or activate SHALL be blocked from metadata-driven verdicts instead of hidden silent failures.

#### Scenario: Attempting to use an incompatible or untrusted resource
- **WHEN** the selected resource is incompatible, damaged, or blocked by trust policy
- **THEN** the system SHALL block the unsupported action
- **AND** SHALL show the blocking reason and the available next action

