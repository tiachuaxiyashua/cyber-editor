# human-ai-merge Specification

## Purpose
TBD - created by archiving change p049-human-ai-merge-and-rich-artifacts. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL detect divergence between direct user edits and pending AI write-back
The system SHALL compare AI write-back base revision and current local revision before applying AI output to an existing artifact, including partial artifact writes.

#### Scenario: Blocking partial AI overwrite after a local edit
- **WHEN** AI attempts to patch or replace an artifact whose current revision differs from the revision used to generate that AI output
- **THEN** the system SHALL block automatic write-back
- **AND** SHALL persist a merge-required state with both revisions and the pending AI patch

### Requirement: The system SHALL require an explicit merge decision before resolving conflicting AI writes
The merge flow SHALL provide stable user choices for conflicting AI writes and SHALL preserve the selected resolution as runtime evidence.

#### Scenario: Reviewing merge options for a conflicting AI write
- **WHEN** a merge flow opens for an AI write conflict
- **THEN** the system SHALL let the user keep the local version, apply the AI version, or confirm a reviewed merge path
- **AND** SHALL record the chosen resolution and resulting downstream impact

### Requirement: The system SHALL preserve merge lineage and downstream impact evidence
The system SHALL persist enough evidence about conflicting revisions, the selected resolution, and impacted downstream artifacts so later workflow steps can explain what changed.

#### Scenario: Inspecting merge impact
- **WHEN** the user inspects a resolved merge event
- **THEN** the system SHALL show the chosen resolution path
- **AND** SHALL expose the directly impacted downstream artifacts or invalidated outputs

