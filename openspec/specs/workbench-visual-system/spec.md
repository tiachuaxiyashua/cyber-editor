# workbench-visual-system Specification

## Purpose
Define shared visual tokens, theme semantics, and consistent workbench-region presentation across the desktop shell.
## Requirements
### Requirement: The system SHALL render the desktop workbench with a unified visual token system
The system SHALL apply a unified visual token system for light and dark themes across the title bar, activity bar, sidebars, center document area, contextual AI pane, process panel, and status bar.

#### Scenario: Switching themes
- **WHEN** the user switches between light and dark themes
- **THEN** the system SHALL update all major workbench regions using the same theme token set
- **AND** the shell SHALL not show mismatched background, border, or accent treatments between regions

### Requirement: The system SHALL use a single navigation icon family with tooltip-first labels
The system SHALL use a single icon family for workbench navigation and SHALL expose localized labels primarily through hover tooltips and expanded view headers instead of persistent button text in the activity bar.

#### Scenario: Hovering an activity icon
- **WHEN** the user hovers an activity icon in the activity bar
- **THEN** the system SHALL show a localized label for that view
- **AND** the activity bar SHALL not require persistent text labels next to each icon

### Requirement: The system SHALL keep permanent action chrome out of the document surface
The system SHALL keep the center document surface focused on reading and editing content, SHALL keep persistent top chrome limited to cross-object global actions, and SHALL avoid mixing session management, review controls, Skill management controls, or object-local rename/delete actions into the permanent document chrome.

#### Scenario: Opening a document in the center pane
- **WHEN** the user opens a document in the center pane
- **THEN** the system SHALL present document tabs, title information, and document-mode controls
- **AND** the system SHALL keep session, review, and Skill management controls outside the permanent document surface

#### Scenario: Acting on an object-local command
- **WHEN** the user needs an object-local action such as rename, delete, duplicate, or node-local edit
- **THEN** the system SHALL expose that action on the selected document, node, or session surface instead of the persistent top chrome
- **AND** SHALL keep the global chrome readable at compact desktop widths

### Requirement: The system SHALL preserve readable shell regions at compact widths
The desktop workbench SHALL keep major shell regions readable and non-overlapping when the window narrows into compact desktop sizes.

#### Scenario: Using the shell at compact width
- **WHEN** the workbench window shrinks below the preferred wide layout
- **THEN** the shell SHALL apply compact-width fallback rules that preserve readable pane regions
- **AND** SHALL avoid overlapping, unreadable, or inaccessible workbench chrome

