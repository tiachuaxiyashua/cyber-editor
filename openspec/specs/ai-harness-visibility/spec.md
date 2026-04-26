# ai-harness-visibility Specification

## Purpose
TBD - created by archiving change p047-ai-harness-context-compaction. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL display AI context sources, budget, and compaction results
The system SHALL show the user which context sources were included in an AI run, how much budget was available or consumed, and what content was compacted.

#### Scenario: Inspecting the context explanation of a run
- **WHEN** the user opens the run explanation for a completed or running AI task
- **THEN** the system SHALL list the main context sources, budget summary, and compaction result
- **AND** SHALL expose a deeper view for the detailed breakdown without overloading the first screen

### Requirement: The system SHALL explain retry and recovery affordances
The system SHALL show why a run can be retried or continued and what previous state will be reused.

#### Scenario: Viewing retry details after failure
- **WHEN** a run fails, is stopped, or becomes recoverable
- **THEN** the system SHALL explain whether retry or continue is available
- **AND** SHALL show which context recipe and runtime lineage will be reused if the user proceeds

### Requirement: The system SHALL project an auditable thinking chain from runtime evidence
The system SHALL build a user-readable idea-map projection from auditable session, runtime, review, and artifact evidence without exposing raw hidden reasoning or internal payloads as the primary view.

#### Scenario: Building semantic thought units instead of raw message nodes
- **WHEN** the user opens the idea-map page for an active or completed session
- **THEN** the system SHALL normalize auditable evidence into thought units and relation edges instead of rendering raw message chronology as the primary structure
- **AND** SHALL preserve explicit semantic relations such as decomposition, constraints, derivation, exploration, discard, and landed outputs

#### Scenario: Preserving multiple parent relations in the projected map
- **WHEN** a thought unit is supported or constrained by more than one upstream unit
- **THEN** the system SHALL keep those multiple incoming relations in the snapshot
- **AND** SHALL not collapse the idea map to a single-parent tree only because the renderer needs a layout

#### Scenario: Hiding internal payloads from the primary map view
- **WHEN** the projected evidence contains tool-call payloads, JSON fragments, capability identifiers, or other runtime-only metadata
- **THEN** the system SHALL strip those internal details from the primary node title and summary fields
- **AND** SHALL only expose user-readable explanations plus auditable source links in the detail view

### Requirement: 思路地图必须按阶段化思路图展示

思路地图 MUST 使用固定阶段列，而不是仅按宽分区或时间顺序堆叠节点。

#### Scenario: 阶段列展示
- **WHEN** 系统投影一段包含前提、约束、结论、探索与文档沉淀的会话
- **THEN** 画布中的节点必须落在固定阶段列中
- **AND** 核心命题在最左，文档沉淀在最右

### Requirement: 文档沉淀必须属于主结构

文档或工件节点 MUST 表示为 `materialized` 主结构节点，而不是仅作为附属结果。

#### Scenario: 文档沉淀映射
- **WHEN** 某条思路已经沉淀到文档或工件
- **THEN** 系统必须生成对应的文档沉淀节点
- **AND** 该节点必须与产生它的思路节点存在显式“落地到”关系

### Requirement: 节点位置必须支持用户持久化

思路地图 MUST 支持用户拖拽节点并保存位置。

#### Scenario: 拖拽后复开
- **WHEN** 用户拖动思路地图节点并关闭页面后再次打开
- **THEN** 该节点必须恢复到用户上次保存的位置
- **AND** 未手工固定的新节点仍由自动布局计算

### Requirement: The system SHALL summarize auditable AI/runtime process state without exposing hidden reasoning
AI/runtime process visibility SHALL summarize selected model/profile, included context, tool or capability activity, current node or stage, and output artifact summaries without exposing raw hidden chain-of-thought or internal payloads as the primary UI.

#### Scenario: Inspecting a process card for an AI-assisted run
- **WHEN** the user opens the process or runtime summary for a run that invoked AI assistance
- **THEN** the system SHALL show summary-level context, model/tool activity, and output artifact information
- **AND** SHALL keep raw internal payloads or hidden reasoning out of the primary view while retaining auditable source links

### Requirement: The system SHALL expose context-pack provenance and user controls in the AI harness
The AI harness SHALL expose context-pack provenance, retrieval evidence, pin or exclude controls, and reuse/recovery context in a user-auditable summary without requiring raw internal ranking tables as the primary UI.

#### Scenario: Inspecting and controlling retrieved context
- **WHEN** the user opens the AI harness context explanation for an active or completed task
- **THEN** the system SHALL show the context packs, their provenance and retrieval reasons, and whether they were pinned, excluded, or reused from recovery state
- **AND** SHALL let the user adjust supported pin or exclude controls without losing the summary-first workflow

