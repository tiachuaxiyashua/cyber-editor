# review-orchestration Specification

## Purpose
Define review-round orchestration, review visibility, and structured review tracking inside the Cyber Editor process workflow.

## Requirements

### Requirement: The system SHALL display review rounds as visible sidebar process cards
The system SHALL display review rounds in a dedicated bottom process panel using role-labeled process cards that include round identity, status, summary, and affected document references.

#### Scenario: Viewing completed review rounds
- **WHEN** one or more review rounds have completed for the active session
- **THEN** the system SHALL show those rounds as visible process cards in the bottom process panel
- **AND** the contextual AI pane SHALL remain focused on the active session conversation

## ADDED Requirements

### Requirement: The system SHALL separate stage progress and review history from the conversation pane
The system SHALL present workflow stage progress, review history, and confirmation actions inside distinct process panel sections so that they are not mixed into the conversation timeline.

#### Scenario: Confirming a reviewed stage
- **WHEN** the active stage is ready for user confirmation
- **THEN** the system SHALL surface the pending confirmation action in the process panel
- **AND** the conversation pane SHALL not become the primary container for that action
