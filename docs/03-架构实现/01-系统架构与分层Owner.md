# 01 系统架构与分层 Owner

## 当前分层

```text
Renderer 页面 / 组件
  -> Renderer hooks / state
  -> src/main/preload.ts 白名单 API
  -> src/main/ipc/register-*.ts
  -> src/main/services/*
  -> 工作区文件 / .project/runtime / .project/evidence / 用户设置
```

## Owner 规则

| 层 | 当前 owner | 负责 | 不允许 |
|---|---|---|---|
| 页面与组件 | `src/renderer/App.tsx`, `src/renderer/components/*` | 展示、用户输入、当前对象操作、状态反馈 | 直接写磁盘、写第二套运行规则 |
| Renderer hooks | `src/renderer/hooks/useAppDomainStates.ts` | 视图状态、对话框状态、乐观反馈、布局状态 | 承载跨服务业务规则 |
| IPC client | `src/main/preload.ts` | 类型化 API、调用白名单、renderer-main 边界 | 拼字符串协议、隐式 side effect |
| IPC registration | `src/main/ipc/register-*.ts` | 参数校验、窗口上下文、服务转发 | 变成第二业务层 |
| Main services | `src/main/services/*` | 业务动作、文件访问、运行调度、规则合成、导出、索引 | 依赖 React 状态或 UI 文案 |
| Persistence | 工程目录、`.project/runtime/`、`.project/evidence/`、用户设置 | manifest、flow、run、evidence、layout 落盘 | 混入页面文案或 UI 结构 |
| Governance | `resource-governance-service.ts`, `side-effect-governance-service.ts`, `artifact-governance-service.ts`, `rules-distillation-service.ts` | 风险审查、审批、副作用、规则沉淀、证据写入 | 只做前端提示不落证据 |
| Tests | `tests/unit/`, `tests/e2e/` | 用户路径、契约、恢复、打包态证明 | 只测 happy path |

## 关键对象与实际 Owner

| 对象 | Renderer owner | IPC owner | Main owner | 持久化 / 证据 | Test owner |
|---|---|---|---|---|---|
| Project | `App.tsx`, `FileTree.tsx`, `DocumentTabs.tsx` | `register-project-document-ipc.ts` | `ProjectService`, `PlatformService` | 工程根目录、`.project/` | `workbench-basics.spec.ts`, `recent-projects.spec.ts`, `project-service-*.test.ts` |
| Document / Artifact | `MarkdownContent.tsx`, `TableArtifactView.tsx`, `ConflictDialog.tsx`, `DocumentProtectionDialog.tsx` | `register-project-document-ipc.ts` | `ProjectService`, `TableArtifactService`, `DocumentSnapshotService`, `HumanAiMergeService` | 文档文件、快照、工件文件、审计 | `note-references.spec.ts`, `table-artifact-workbench.spec.ts`, `document-merge-protection.spec.ts` |
| Session / Stage | `AppShellSections.tsx`, `StageBadge.tsx` | `register-settings-session-ai-ipc.ts` | `AiService`, `WorkspaceOrchestrator`, `ModelRouter`, `StructuredGenerationService` | 会话状态、阶段草稿、review 结果 | `user-behavior-ollama.spec.ts`, `runtime-stage-generation-prompt.test.ts` |
| Flow / Node / Run | `OrchestrationWorkspace.tsx` | `register-runtime-platform-ipc.ts`, `register-settings-session-ai-ipc.ts` | `RuntimeAssetService`, `RuntimeService`, `CapabilityRuntime`, `ConversationFlowService`, `DeliveryExportService` | Flow 资产、运行事件、rerun 计划、导出结果 | `critical-editor-workflows.spec.ts`, `orchestration-approval-runtime.spec.ts`, `runtime-service*.test.ts` |
| Approval / Side effect | `OrchestrationWorkspace.tsx`, `App.tsx` | `register-runtime-platform-ipc.ts`, `register-resource-ipc.ts` | `RuntimeService`, `SideEffectGovernanceService`, `ResourceGovernanceService` | `.project/evidence/approvals/`, `.project/evidence/side-effects/`, 资源审查记录 | `orchestration-runtime-pause-resume.spec.ts`, `side-effect-governance-service.test.ts`, `resource-governance-service.test.ts` |
| Rules / Knowledge / Thinking chain | `RulesWorkspacePage.tsx`, `ThinkingChainPage.tsx`, `App.tsx` | `register-runtime-platform-ipc.ts`, `register-settings-session-ai-ipc.ts` | `RulesDistillationService`, `KnowledgeIndexService`, `HybridRetrievalService`, `ProjectKnowledgeGraphBuilder`, `ThinkingChainProjector`, `ThinkingChainLayoutStore`, `ProvenanceService` | `.project/runtime/rules-distillation/`, `.project/runtime/idea-map-layouts/`, 索引与上下文相关缓存 | `rules-distillation.spec.ts`, `knowledge-index-refresh.spec.ts`, `thinking-chain.spec.ts` |
| Template / Skill / Role | `ResourceCenterPage.tsx`, `TemplateCenterPage.tsx`, `PackageUrlDialog.tsx`, `ProviderProfilesDialog.tsx` | `register-resource-ipc.ts`, `register-settings-session-ai-ipc.ts` | `TemplateRegistryService`, `SkillRegistryService`, `RolePackageRegistryService`, `PlatformService` | 模板/技能/角色包目录、来源校验和安装记录 | `template-lifecycle.spec.ts`, `platform-mvp.spec.ts`, `skill-package.test.ts` |

## 当前主链

### 文档工作台

`用户动作 -> App.tsx / FileTree.tsx / DocumentTabs.tsx -> preload.ts -> register-project-document-ipc.ts -> ProjectService / TableArtifactService / HumanAiMergeService -> 文件系统与 .project -> BootstrapData / 冲突与审计反馈`

### 编排与运行时

`用户动作 -> OrchestrationWorkspace.tsx -> preload.ts -> register-runtime-platform-ipc.ts / register-settings-session-ai-ipc.ts -> RuntimeService / RuntimeAssetService / CapabilityRuntime / ConversationFlowService -> Flow 资产、运行事件、审批、导出 -> 画布状态与运行结果`

### 资源导入与治理

`用户动作 -> ResourceCenterPage.tsx / PackageUrlDialog.tsx -> preload.ts -> register-resource-ipc.ts -> TemplateRegistryService / SkillRegistryService / RolePackageRegistryService / ResourceGovernanceService -> 安装目录、审查记录、BootstrapData -> 导入结果与风险提示`

## 架构完成标准

一个模块只有满足以下条件才算边界清楚：

1. Renderer 只处理呈现、输入和状态反馈。
2. 所有真实业务动作都进入 preload + IPC + service 链路。
3. Service 输入输出是类型化对象，不靠松散字符串协议。
4. 持久化对象有版本、恢复或降级策略。
5. 错误能映射到用户可见的阻断、恢复或审批入口。
6. 至少存在一条可定位的测试或运行证据路径。

目录级完整对照见 `05-代码目录与Owner映射.md`。
