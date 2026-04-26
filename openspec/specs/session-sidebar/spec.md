# session-sidebar Specification

## Purpose
Define multi-session management, session switching, and session-scoped context visibility in the AI conversation sidebar.

## Requirements

### Requirement: The system SHALL manage multiple AI sessions within a project
The system SHALL allow each project to contain multiple named AI sessions and SHALL let the user create, switch, rename, archive, pin, and delete those sessions from a dedicated primary-sidebar session view.

#### Scenario: Switching to another project session
- **WHEN** the user selects another session in the primary-sidebar session view
- **THEN** the system SHALL activate that session and load its messages, stage state, and contextual AI pane content
- **AND** the system SHALL not force the center document area to switch documents

### Requirement: The system SHALL display project session context explicitly in the sidebar
The system SHALL display the active session stage, referenced documents, effective Skills summary, and input controls in the contextual AI pane while keeping the session list outside that pane.

#### Scenario: Viewing the active session context
- **WHEN** the user is inside an active project session
- **THEN** the contextual AI pane SHALL show the active stage and current session context sources without requiring hidden menus
- **AND** the session list SHALL remain available from the primary-sidebar session view instead of inside the AI pane
