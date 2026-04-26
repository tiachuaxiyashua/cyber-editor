# 22 Internal Capability Test Map

Source: detailed feature inventory under `docs/06-详细设计库/`. Prefix: INF.

| ID | Description | Logic | Functional | Abuse | Stress | Experience | Scenario | Focus |
|---|---|---|---|---|---|---|---|---|
| INF-001 | Window/launch shell | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Window/launch shell |
| INF-002 | Settings/layout persistence | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Settings/layout persistence |
| INF-003 | Project manifest/scaffold | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Project manifest/scaffold |
| INF-004 | Recent project/template store | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Recent project/template store |
| INF-005 | File tree index/watch | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: File tree index/watch |
| INF-006 | Document read/write service | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Document read/write service |
| INF-007 | Markdown editor/renderer adapter | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Markdown editor/renderer adapter |
| INF-049 | Table artifact adapter | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Table artifact adapter |
| INF-008 | Mermaid renderer | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Mermaid renderer |
| INF-009 | Mindmap renderer | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Mindmap renderer |
| INF-050 | Diagram/table embed-link resolver | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Diagram/table embed-link resolver |
| INF-010 | Image asset importer | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Image asset importer |
| INF-011 | Reference graph indexer | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Reference graph indexer |
| INF-012 | Reference comparison engine | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Reference comparison engine |
| INF-013 | Search index and find/replace | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Search index and find/replace |
| INF-014 | Tab/navigation state service | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Tab/navigation state service |
| INF-051 | Multi-window workspace coordinator | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: Multi-window workspace coordinator |
| INF-015 | Session persistence | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 能力层: Session persistence |
| INF-016 | Agent memory and review round store | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 能力层: Agent memory and review round store |
| INF-017 | Runtime run/event store | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Runtime run/event store |
| INF-018 | Provider adapter layer | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 智能层: Provider adapter layer |
| INF-019 | ModelRouter | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 智能层: ModelRouter |
| INF-020 | StructuredGenerationService | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 智能层: StructuredGenerationService |
| INF-021 | Repair/Fallback pipeline | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 智能层: Repair/Fallback pipeline |
| INF-022 | Provider diagnostics and capability metadata | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 智能层: Provider diagnostics and capability metadata |
| INF-023 | Stage guard engine | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Stage guard engine |
| INF-024 | Review engine | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Review engine |
| INF-025 | Capability registry | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 连接层: Capability registry |
| INF-026 | Skill registry | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 连接层: Skill registry |
| INF-027 | Connector registry and MCP-ready adapter | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 连接层: Connector registry and MCP-ready adapter |
| INF-028 | Script tool adapter | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 连接层: Script tool adapter |
| INF-053 | Role package loader | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 连接层: Role package loader |
| INF-029 | Template registry | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Template registry |
| INF-059 | Template metadata / trust resolver | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Template metadata / trust resolver |
| INF-030 | Template scaffold and save service | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 能力层: Template scaffold and save service |
| INF-031 | Flow asset persistence | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Flow asset persistence |
| INF-032 | Canvas layout state store | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Canvas layout state store |
| INF-033 | Flow validation engine | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Flow validation engine |
| INF-034 | Artifact catalog service | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Artifact catalog service |
| INF-052 | Flow IO directory service | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Flow IO directory service |
| INF-035 | Node IO contract service | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Node IO contract service |
| INF-036 | Export mapping service | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Export mapping service |
| INF-054 | Document knowledge graph indexer | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Document knowledge graph indexer |
| INF-055 | Hybrid retrieval and reranker | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Hybrid retrieval and reranker |
| INF-056 | Context packer and token-budget planner | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Context packer and token-budget planner |
| INF-057 | Incremental indexing coordinator | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Incremental indexing coordinator |
| INF-058 | Citation / provenance tracker | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Citation / provenance tracker |
| INF-037 | Loop runtime | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Loop runtime |
| INF-038 | Parallel runtime | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Parallel runtime |
| INF-039 | Subflow runtime | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Subflow runtime |
| INF-040 | Node debug / partial rerun engine | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Node debug / partial rerun engine |
| INF-041 | Flow history/snapshot/restore | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 编排层: Flow history/snapshot/restore |
| INF-042 | Permission / hook / audit governance | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 观测与治理: Permission / hook / audit governance |
| INF-043 | Usage / cost / error taxonomy | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 观测与治理: Usage / cost / error taxonomy |
| INF-044 | Delivery export service | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 能力层: Delivery export service |
| INF-045 | OpenSpec exporter | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 能力层: OpenSpec exporter |
| INF-046 | UI responsive layout engine | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 壳层与文档底座: UI responsive layout engine |
| INF-047 | Command registry | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 能力层: Command registry |
| INF-048 | Package/test harness | LOG-01 | FUN-01 | ABU-01 | STR-01 | EXP-01 | SCN-01 | 观测与治理: Package/test harness |
