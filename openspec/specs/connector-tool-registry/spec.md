# connector-tool-registry Specification

## Purpose
Define connector registration, controlled script-tool execution, diagnostics persistence, and local trust/policy governance for tool-capability bindings.
## Requirements
### Requirement: The system SHALL manage MCP-style connection definitions
The system SHALL allow users to configure local or remote MCP-style connection definitions, including transport metadata, enabled state, and health status.

#### Scenario: Saving a remote connection definition
- **WHEN** the user enters a valid remote connection definition and saves it
- **THEN** the system SHALL persist the connection metadata and show it in the connector registry

#### Scenario: Testing an invalid connection definition
- **WHEN** the user runs a health check on an unreachable or invalid connection
- **THEN** the system SHALL keep the definition and show a failed status with an error message

### Requirement: The system SHALL register and execute controlled script tools
The system SHALL allow users to register controlled script-backed tools with explicit command, arguments, working directory, and timeout metadata.

#### Scenario: Running a valid script tool
- **WHEN** the user runs a registered script tool with valid configuration
- **THEN** the system SHALL execute the script in a controlled process and show the structured output or exit status

#### Scenario: Running a failing script tool
- **WHEN** the registered script exits with an error or exceeds the timeout
- **THEN** the system SHALL mark the run as failed and show the captured error or timeout state

### Requirement: Tool nodes SHALL reference registered connectors or controlled tools
Tool nodes in the orchestration workspace SHALL be able to reference saved connection or tool definitions.

#### Scenario: Selecting a tool for a tool node
- **WHEN** the user selects a tool node and binds it to a registered tool
- **THEN** the system SHALL persist the binding and display the selected tool in the node inspector

### Requirement: The system SHALL persist structured diagnostics for local connectors and script tools
Saved local connectors and script tools SHALL keep structured validation and diagnostic results that the workspace and runtime can both consume.

#### Scenario: Testing a configured script tool
- **WHEN** the user tests a valid local script tool definition
- **THEN** the system SHALL persist a structured diagnostic result
- **AND** SHALL expose the latest status to the node binding UI and runtime gate checks

### Requirement: Registered local tools SHALL participate in trust and policy governance
Script-backed tools and governed local connectors SHALL pass trust and policy checks before execution.

#### Scenario: Blocking a risky local tool run before approval
- **WHEN** a local tool run is classified as high risk by policy
- **THEN** the system SHALL block execution until approval is granted
- **AND** SHALL record the governed run preview and decision

### Requirement: The system SHALL expose connector health and authorization as separate states
Connector diagnostics SHALL distinguish transport health from authorization state so users can tell whether a connector is unreachable, reachable but unauthorized, or ready.

#### Scenario: Reviewing a connector that is reachable but unauthorized
- **WHEN** the user inspects a connector whose endpoint is reachable but whose credentials are rejected or missing
- **THEN** the system SHALL show a healthy-or-reachable transport state separately from the failed authorization state
- **AND** SHALL provide an authorization-focused repair message instead of one ambiguous error label

