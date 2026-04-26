# quality-gate-review Specification

## Purpose
Define anti-false-green quality review rules for core user-facing artifacts and the validation loop required before a change is archive-ready.
## Requirements
### Requirement: The system SHALL define anti-false-green acceptance for core user-facing artifacts
The system SHALL support artifact-type quality profiles so that discover and clarify artifacts are reviewed against dedicated specificity and actionability expectations instead of only generic structural validity.

#### Scenario: Evaluating a discover artifact against its quality profile
- **WHEN** the system reviews a discover artifact
- **THEN** the quality review SHALL check its discover-specific required sections and missing-action heuristics
- **AND** SHALL produce a per-dimension verdict that can block acceptance when the artifact is too generic

#### Scenario: Evaluating a clarify artifact against its quality profile
- **WHEN** the system reviews a clarify artifact
- **THEN** the quality review SHALL check its clarify-specific required sections, decision completeness, and next-stage input completeness
- **AND** SHALL classify the artifact as degraded or blocked if the content is still too generic to guide downstream planning

### Requirement: The system SHALL require an anti-false-green validation loop before archive-ready status
The system SHALL require a fixed validation loop for changes that affect AI generation, orchestration runtime, exports, or core user-facing artifacts.

#### Scenario: Validating a change before archive
- **WHEN** a developer prepares to archive a change that affects core artifact generation or validation
- **THEN** the validation process SHALL execute the fixed post-change regression entry point
- **AND** SHALL review the artifact-quality report and real-model output samples before the change is considered archive-ready

#### Scenario: Blocking archive on degraded core artifacts
- **WHEN** the validation loop detects a degraded or blocked core user-facing artifact
- **THEN** the change SHALL remain not archive-ready until the failure is corrected or the expected behavior is updated explicitly

