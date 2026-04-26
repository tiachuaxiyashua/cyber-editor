# file-tree-ops Specification

## Purpose
Define file-tree creation, import, rename, delete, move, and related project file-management operations.

## Requirements

### Requirement: The system SHALL import external text documents into the active project
The system SHALL allow users to import external Markdown or plain-text files into a valid location within the active project and SHALL block unsupported or conflicting imports safely.

#### Scenario: Importing a valid external Markdown document
- **WHEN** the user imports a supported `.md` or `.txt` file into the active project
- **THEN** the system SHALL copy the file into the selected project location, refresh the file tree, and make the new document available to open immediately

#### Scenario: Importing a conflicting or unsupported file
- **WHEN** the user imports a file whose name conflicts with an existing entry or whose type is unsupported
- **THEN** the system SHALL reject the import or require explicit rename resolution before modifying the project tree
