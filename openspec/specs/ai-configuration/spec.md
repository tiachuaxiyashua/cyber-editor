# ai-configuration Specification

## Purpose
Define provider-profile configuration, active model selection, local/remote provider persistence, and provider diagnostics for Cyber Editor AI execution.
## Requirements
### Requirement: The system SHALL provide configurable AI connection settings
The system SHALL allow the user to configure and persist provider profiles for `Mock`, `OpenAI-compatible`, `DeepSeek`, and `Ollama`, including provider-specific defaults sourced from a unified registry shared by the main-process settings layer and the renderer settings UI.

#### Scenario: Creating a new Provider profile draft
- **WHEN** the user creates or switches a Provider profile draft
- **THEN** the system SHALL apply registry-defined defaults for that Provider kind
- **AND** SHALL render the same Provider label and capability metadata in storage, settings UI, and runtime status surfaces

### Requirement: The system SHALL support AI connection testing
The system SHALL provide a lightweight test action that verifies whether the current active provider profile can reach the configured provider.

#### Scenario: Testing an active Ollama profile
- **WHEN** the user runs a connection test for an available local Ollama endpoint
- **THEN** the system SHALL return a success result without requiring a project workflow run

#### Scenario: Testing an unavailable Ollama profile
- **WHEN** the user runs a connection test for an unavailable local Ollama endpoint
- **THEN** the system SHALL show a failed result and preserve the unsaved or saved configuration state

### Requirement: The system SHALL expose provider capability labels and latest diagnostic state
Provider configuration surfaces SHALL expose capability labels and the latest diagnostic snapshot derived from provider metadata and test results.

#### Scenario: Reviewing a configured provider profile
- **WHEN** the user selects a saved provider profile in settings or another diagnostics surface
- **THEN** the system SHALL show capability labels such as structured output, tool calls, long context, and local/cloud execution
- **AND** SHALL show the latest diagnostic state, including the last checked time and last known latency when available

#### Scenario: Reviewing an untested provider profile
- **WHEN** the user selects a provider profile that has not been tested yet
- **THEN** the system SHALL mark the diagnostic state as untested
- **AND** SHALL not present the profile as already verified

