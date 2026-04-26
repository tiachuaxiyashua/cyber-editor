# 05 代码目录与 Owner 映射

## 1. 目的

本文件把当前 `src/`、`tests/` 与现行文档体系逐项对齐，解决“文档能说、代码能找、测试能证”的问题。读完本文件后，程序员应能直接回答：

1. 某个能力现在落在哪个目录和模块。
2. 哪一层负责页面、状态、IPC、主进程服务、持久化和治理。
3. 该能力已有哪类测试和证据。
4. 哪些文件已经成为当前重构热点。

## 2. 当前代码规模

| 目录 | 文件数 | 说明 |
|---|---:|---|
| `src/main/services/` | 48 | 主进程服务、运行时、治理、导出、索引、日志 |
| `src/main/ipc/` | 6 | IPC 注册与上下文 |
| `src/renderer/components/` | 29 | 页面组件、工作台组件、弹窗与独立视图 |
| `src/shared/` | 28 | 类型、契约、解析器、共享规则与模板包 |
| `tests/unit/` | 105 | 逻辑、边界、治理、契约和回归单测 |
| `tests/e2e/` | 49 | Electron、打包态、UI 契约与闭环验证 |

## 3. 启动与主链路

### 3.1 主进程装配

`src/main/main.ts` 当前直接装配了以下核心 owner：

1. `SettingsStore`
2. `ProjectService`
3. `AiService`
4. `SkillRegistryService`
5. `RolePackageRegistryService`
6. `RuntimeAssetService`
7. `WorkspaceOrchestrator`
8. `ConversationFlowService`
9. `ModelRouter`
10. `StructuredGenerationService`
11. `CapabilityRuntime`
12. `DeliveryExportService`
13. `RuntimeService`

### 3.2 IPC 聚合

`src/main/ipc.ts` 额外装配了：

1. `EvidenceStoreService`
2. `ResourceGovernanceService`
3. `RulesDistillationService`
4. `SideEffectGovernanceService`

### 3.3 统一调用链

当前主路径统一遵守：

`Renderer 组件 / hooks -> preload.ts -> register-*.ts -> main/services -> .project 或工作区文件 -> BootstrapData / UI 可见结果`

## 4. Renderer Owner

| 能力域 | 主要文件 | 负责内容 | 不负责 |
|---|---|---|---|
| 壳层与路由 | `src/renderer/App.tsx`, `src/renderer/components/AppShellSections.tsx`, `src/renderer/components/ShellPrimitives.tsx`, `src/renderer/hooks/useAppDomainStates.ts` | 活动视图切换、全局布局、命令面板、弹窗装配、状态条、上下文面板 | 主进程业务规则、磁盘写入、运行时状态机 |
| 工程与文档 | `FileTree.tsx`, `DocumentTabs.tsx`, `MarkdownContent.tsx`, `TableArtifactView.tsx`, `FindReplaceBar.tsx`, `ConflictDialog.tsx`, `DocumentProtectionDialog.tsx` | 文件树、标签页、文档阅读/编辑、表格工件打开、冲突提示与合并入口 | 真实文件读写、快照持久化、引用图计算 |
| AI 会话与阶段 | `App.tsx`, `AppShellSections.tsx`, `StageBadge.tsx` | 会话列表、消息发送、阶段 guard 展示、阶段草稿入口 | 模型路由、结构化生成、阶段状态持久化 |
| 编排工作台 | `OrchestrationWorkspace.tsx` | 画布、节点库、Inspector、运行控制、审批按钮、治理侧栏、Flow 资产编辑 | 运行调度、审批状态持久化、导出执行 |
| 资源视图 | `ResourceCenterPage.tsx`, `TemplateCenterPage.tsx`, `ProjectTemplateDialog.tsx`, `SaveTemplateDialog.tsx`, `PackageUrlDialog.tsx` | 模板/技能/角色入口、来源选择、导入/安装 UI | 包解析、信任校验、真实安装 |
| 规则与沉淀 | `RulesWorkspacePage.tsx` | 规则列表、沉淀条目、提升草案与知识图展示 | 规则合成、知识图生成、经验同步 |
| 思路地图 | `ThinkingChainPage.tsx`, `KnowledgeGraphCanvas.tsx` | 会话思路结构、节点布局、详情面板 | 投影计算、布局持久化、运行证据生成 |
| 设置 | `SettingsWorkspacePage.tsx`, `ProviderProfilesDialog.tsx` | provider profile 编辑、连接测试、主题与偏好 | 设置落盘、模型能力探测、全局安全策略 |

## 5. IPC Domain Owner

| IPC 文件 | 负责域 | 主要接口 |
|---|---|---|
| `register-project-document-ipc.ts` | 工程、文件、文档、工件、快照 | `project:*`, `document:*`, `artifact:*`, `search:*`, `notes:*`, `window:open-document` |
| `register-settings-session-ai-ipc.ts` | 设置、会话、AI、阶段、review、consistency、handoff | `settings:*`, `ai:*`, `conversation-flow:*`, `workflow:*`, `review:*`, `consistency:*`, `handoff:*`, `knowledge:*` |
| `register-runtime-platform-ipc.ts` | 运行时、Flow、规则、思路地图、平台资产 | `runtime:*`, `platform:*`, `rules:*`, `runtime.thinkingChain.*` |
| `register-resource-ipc.ts` | 模板、技能、角色、导入安装与审查 | `templates:*`, `skills:*`, `roles:*`, `dialog:create-project-base` |
| `register-recent-system-ipc.ts` | 最近工程与系统辅助 | `recent:*`, `path:basename` |

`src/main/preload.ts` 是 renderer 与 main 的唯一白名单接口面。文档对代码时，优先对照这个文件。

## 6. Main Service Owner

| 能力域 | 主要服务 | 持久化/证据落点 |
|---|---|---|
| 工程与工作台 | `project-service.ts`, `platform-service.ts`, `store.ts`, `document-snapshot-service.ts`, `human-ai-merge-service.ts`, `table-artifact-service.ts` | 工程根目录、`.project/`、文档快照、表格工件文件 |
| AI 会话与阶段 | `ai-service.ts`, `model-router.ts`, `structured-generation-service.ts`, `workspace-orchestrator.ts`, `conversation-compaction-service.ts` | 会话状态、阶段草稿、review 数据、模型调用结果 |
| Flow 与运行时 | `runtime-asset-service.ts`, `runtime-service.ts`, `capability-runtime.ts`, `conversation-flow-service.ts`, `runtime-budget-governor.ts`, `runtime-interrupts.ts` | Flow 资产、运行事件、审批、rerun 计划、恢复状态 |
| 导出与交付 | `delivery-export-service.ts`, `openspec-handoff.ts`, `runtime-template-contracts.ts`, `runtime-template-paths.ts` | `03-openspec/`、导出目录、打包验证产物 |
| 资源治理 | `template-registry-service.ts`, `skill-registry-service.ts`, `role-package-registry-service.ts`, `resource-governance-service.ts`, `remote-fetch-guard.ts`, `network-target-guard.ts` | 安装目录、来源校验结果、风险审查记录 |
| 规则与知识底座 | `rules-distillation-service.ts`, `knowledge-index-service.ts`, `hybrid-retrieval-service.ts`, `project-knowledge-graph-builder.ts`, `provenance-service.ts`, `thinking-chain-projector.ts`, `thinking-chain-layout-store.ts` | `.project/runtime/rules-distillation/`, `.project/runtime/idea-map-layouts/`, 索引与上下文相关缓存 |
| 证据与治理 | `evidence-store-service.ts`, `side-effect-governance-service.ts`, `artifact-governance-service.ts` | `.project/evidence/`, `.project/runtime/artifact-governance/` |
| 日志与窗口 | `app-log-service.ts`, `live-log-service.ts`, `live-log-console-service.ts`, `window-state.ts` | 用户数据目录、实时日志、窗口布局与主题 |

## 7. Shared Contract Owner

| 文件 | 作用 |
|---|---|
| `src/shared/types.ts` | 全局类型主表，覆盖工程、Flow、运行、规则、证据、资源、表格工件等对象 |
| `src/shared/conversation-flow.ts` | 自然语言到 Flow 的规划与 patch 契约 |
| `src/shared/orchestration-contracts.ts` | 编排层共享契约 |
| `src/shared/runtime-template.ts` | 运行模板定义 |
| `src/shared/runtime-run-controls.ts` | 运行控制能力定义 |
| `src/shared/platform-bindings.ts` | 平台绑定与受控脚本工具类型 |
| `src/shared/provider-registry.ts` | provider 能力与模型信息 |
| `src/shared/openspec.ts` | OpenSpec 导出契约 |
| `src/shared/template-package.ts` | 模板包解析与校验 |
| `src/shared/skill-package.ts` | 技能包解析与校验 |
| `src/shared/role-package.ts` | 角色包解析与校验 |

## 8. 代码到文档映射

| 代码域 | 先读文档 | 再读详细设计 |
|---|---|---|
| 壳层、活动视图、页面层级 | `01-需求与PRD/02-用户旅程与信息架构.md`, `02-产品设计/01-页面与交互PRD.md` | `06-详细设计库/04-UI设计/`, `06-详细设计库/08-开发设计方案/07-系统壳层与知识底座开发设计.md` |
| 文档工作台与表格工件 | `02-产品设计/01-页面与交互PRD.md`, `03-架构实现/01-系统架构与分层Owner.md` | `06-详细设计库/05-功能具体实现方案/02-工程与文件/`, `03-文档编辑与知识关系/`, `06-代码唯一性文档/06-文档工作台代码契约.md` |
| AI 会话、阶段、review | `03-架构实现/02-AI编排运行时.md` | `06-详细设计库/05-功能具体实现方案/04-AI会话与阶段控制/`, `08-开发设计方案/03-AI会话与阶段控制开发设计.md` |
| 编排、运行、审批、重跑 | `02-产品设计/02-编排工作台PRD.md`, `03-架构实现/02-AI编排运行时.md` | `06-详细设计库/05-功能具体实现方案/05-编排与流程资产/`, `06-模板工件与导出/`, `06-代码唯一性文档/08-编排层与Flow编辑器代码契约.md` |
| 资源导入与模板/技能/角色 | `02-产品设计/01-页面与交互PRD.md`, `03-架构实现/03-数据契约状态机与安全.md` | `06-详细设计库/05-功能具体实现方案/01-平台入口与模板/`, `07-技能连接与模型/`, `08-开发设计方案/06-技能连接与模型中心开发设计.md` |
| 规则、知识底座、思路地图 | `01-需求与PRD/02-用户旅程与信息架构.md`, `03-架构实现/03-数据契约状态机与安全.md` | `06-详细设计库/05-功能具体实现方案/09-知识索引与上下文管理/`, `08-开发设计方案/07-系统壳层与知识底座开发设计.md`, `06-代码唯一性文档/34-混合检索与ContextPack规则.md` |

## 9. 当前测试 Owner

| 测试层 | 当前重点文件 | 覆盖口径 |
|---|---|---|
| 单测 | `runtime-service*.test.ts`, `project-service*.test.ts`, `resource-governance-service.test.ts`, `side-effect-governance-service.test.ts`, `knowledge-index-service.test.ts`, `thinking-chain-*.test.ts`, `table-artifact-service.test.ts`, `service-boundaries.test.ts` | 业务逻辑、边界、防御性、契约、恢复 |
| Electron e2e | `platform-mvp.spec.ts`, `workbench-basics.spec.ts`, `critical-editor-workflows.spec.ts`, `orchestration-approval-runtime.spec.ts`, `artifact-invalidation-rerun.spec.ts`, `knowledge-index-refresh.spec.ts`, `rules-distillation.spec.ts`, `thinking-chain.spec.ts`, `table-artifact-workbench.spec.ts`, `template-lifecycle.spec.ts` | 用户路径、编排闭环、审批、重跑、知识索引、规则沉淀、工件编辑 |
| 打包态 | `packaged-smoke.spec.ts`, `packaged-ui-contracts.spec.ts`, `packaged-workbench-ui-fixes.spec.ts`, `packaged-idea-map-complex.spec.ts` | 打包应用可启动、UI 合同、思路地图和工作台回归 |

## 10. 当前热点文件

| 文件 | 行数 | 风险 |
|---|---:|---|
| `src/renderer/styles.css` | 7145 | 全局样式耦合过高，容易引起跨页回归 |
| `src/renderer/components/OrchestrationWorkspace.tsx` | 5422 | 画布、Inspector、治理、运行控制集中在单文件 |
| `src/renderer/App.tsx` | 5182 | 壳层、路由、弹窗、状态装配过于集中 |
| `src/main/services/runtime-service.ts` | 4158 | 运行状态机、审批、重跑、恢复集中 |
| `src/shared/types.ts` | 2007 | 跨域类型过度聚合 |
| `src/main/services/project-service.ts` | 1594 | 工程、文档、工件、审计边界混合 |

这些热点就是 `03-架构实现/04-代码重构执行计划.md` 的直接依据。
