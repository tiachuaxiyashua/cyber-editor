# rules-distillation Specification

## Purpose
Define scoped rule resolution, accumulation storage, and promotion flows for reusable Cyber Editor knowledge assets.
## Requirements
### Requirement: The system SHALL resolve effective rules across global, project, and node scopes
The system SHALL maintain scoped rule registries and SHALL compute the effective rule set for a run or node using deterministic precedence and override explanations.

#### Scenario: Resolving effective node rules
- **WHEN** a node has both project-scoped and node-scoped rules that affect the same target
- **THEN** the system SHALL compute one effective rule result
- **AND** SHALL record which scope won and why

### Requirement: The system SHALL store accumulation entries separately from active rules
The system SHALL allow users and runtime flows to capture accumulation entries without making them active runtime rules until promoted.

#### Scenario: Capturing a reusable finding
- **WHEN** the user or runtime captures a reusable finding as an accumulation entry
- **THEN** the system SHALL persist that entry in the accumulation store
- **AND** SHALL not apply it as an active rule until promotion is reviewed

### Requirement: The system SHALL promote reviewed accumulation entries into reusable assets
Accumulation entries SHALL be promotable into reviewable rule, skill, or knowledge proposals.

#### Scenario: Promoting an accumulation entry
- **WHEN** the user promotes a valid accumulation entry
- **THEN** the system SHALL create a reviewable proposal for the selected promotion target
- **AND** SHALL keep the original accumulation entry linked as provenance

### Requirement: The system SHALL expose a navigable project knowledge graph
The rules and distillation center SHALL expose a navigable graph that connects documents, artifacts, flows, rules, Skills, accumulation entries, promotion drafts, accepted knowledge assets, and related runtime evidence.

#### Scenario: Searching the project graph
- **WHEN** the user searches for an object inside the knowledge graph
- **THEN** the system SHALL show matching graph nodes and their labeled relations
- **AND** SHALL allow the user to inspect the selected object's nearby evidence without opening unrelated project files first

#### Scenario: Finding a path between two project objects
- **WHEN** the user selects two graph objects and requests path navigation
- **THEN** the system SHALL compute a deterministic relation path using persisted graph edges
- **AND** SHALL label each step so the user can understand why the objects are connected

#### Scenario: Browsing the local neighborhood of a selected graph object
- **WHEN** the user focuses a graph object in the rules workspace
- **THEN** the system SHALL render a graph canvas centered on that object with its direct inbound and outbound neighbors
- **AND** SHALL preserve any active path-navigation overlay so the user can relate the local neighborhood to the selected path

#### Scenario: Jumping from a graph object back to the owning workbench surface
- **WHEN** the user invokes the jump action for a graph object such as a document, flow, Skill, or artifact
- **THEN** the system SHALL open the owning workbench surface focused on that object
- **AND** SHALL not leave the user on an unrelated page or an unfocused destination

### Requirement: The system SHALL complete accepted Skill promotions into reusable assets
When an accumulation entry is promoted to the `skill` target and the proposal is accepted, the system SHALL materialize that result into a reusable Skill asset instead of leaving it as a draft-only record.

#### Scenario: Accepting a Skill promotion draft
- **WHEN** the user accepts a valid Skill promotion draft
- **THEN** the system SHALL generate a local Skill package, install it through the Skill registry, and record provenance back to the source accumulation entry
- **AND** SHALL not mark the draft accepted unless installation succeeds

