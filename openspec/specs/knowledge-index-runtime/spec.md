# knowledge-index-runtime Specification

## Purpose
TBD - created by archiving change p048-knowledge-index-and-hybrid-retrieval. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL maintain a refreshable project knowledge index
The system SHALL maintain a project knowledge index that tracks document chunks, references, refresh status, freshness, normalized source paths, and graph-visible runtime evidence so AI runs and graph navigation can rely on one project knowledge model.

#### Scenario: Inspecting index freshness
- **WHEN** the user opens a project that has indexed documents
- **THEN** the system SHALL show the knowledge index freshness state
- **AND** SHALL allow the user to trigger a manual refresh when the index is stale or incomplete

#### Scenario: Building graph coverage for runtime-linked project objects
- **WHEN** the system refreshes the project knowledge index
- **THEN** it SHALL normalize persisted project paths before emitting graph nodes and edges
- **AND** SHALL include runtime-run relations needed to connect flows, runs, artifacts, and accumulation evidence in the project graph

### Requirement: The system SHALL perform hybrid retrieval across keyword, semantic, and reference signals
The retrieval layer SHALL combine keyword matches, semantic matches, and reference-expansion matches before ranking final context candidates.

#### Scenario: Retrieving context for a project task
- **WHEN** the user asks AI to continue work on a project task
- **THEN** the system SHALL retrieve candidate context using hybrid retrieval
- **AND** SHALL rank the final results before building context packs

### Requirement: The system SHALL expose context packs that users can pin or exclude
The system SHALL turn retrieved context into explicit context packs that can be recommended, pinned, or excluded per task.

#### Scenario: Pinning a context pack
- **WHEN** the user marks a context pack as pinned for the current task
- **THEN** the system SHALL preserve that pack in subsequent context assembly
- **AND** SHALL not drop it during normal retrieval recomputation unless the user unpins it

#### Scenario: Excluding a context pack
- **WHEN** the user excludes a retrieved context pack
- **THEN** the system SHALL keep it out of subsequent context assembly for the current task
- **AND** SHALL explain that exclusion in the context explanation view

### Requirement: The system SHALL show retrieval evidence and hit reasons
The system SHALL show why a document or chunk was retrieved, including source type, hit reason, and evidence path.

#### Scenario: Reviewing retrieval evidence
- **WHEN** the user inspects a retrieved context pack or cited chunk
- **THEN** the system SHALL show whether it came from keyword, semantic, or reference expansion
- **AND** SHALL expose the corresponding evidence path or source document relation

### Requirement: The system SHALL maintain one project-scoped knowledge model with freshness and graph-visible runtime evidence
The knowledge index runtime SHALL maintain one persisted project-scoped knowledge model that includes freshness state, normalized source paths, document reference links, related change evidence, and graph-visible runtime relations needed by retrieval and navigation surfaces.

#### Scenario: Refreshing the project knowledge model
- **WHEN** the system performs a manual or incremental knowledge-index refresh for a project
- **THEN** it SHALL persist normalized project document units with freshness metadata and reference links
- **AND** SHALL keep the graph-visible runtime relations needed to connect documents, runs, rules, promotions, and artifacts in the project knowledge model

### Requirement: The system SHALL explain hybrid retrieval hit reasons in user-auditable terms
The retrieval layer SHALL preserve user-auditable hit reasons for keyword, semantic, direct-reference, and reference-expansion matches instead of reducing retrieval to one opaque relevance score.

#### Scenario: Reviewing hybrid retrieval evidence for a context pack
- **WHEN** the user inspects a retrieved context pack or one of its underlying hits
- **THEN** the system SHALL show which retrieval signals contributed to that hit
- **AND** SHALL preserve the corresponding path, change, or relation evidence needed to explain why the hit was included

