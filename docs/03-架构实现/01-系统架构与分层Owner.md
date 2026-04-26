# 01 系统架构与分层 Owner

## 分层

```text
Renderer UI
  -> Renderer State / Hooks
  -> IPC Client
  -> Main Process Services
  -> Runtime / Persistence / Governance
  -> Project Files / Artifact Store / Evidence Store
```

## owner 规则

| 层 | owner 职责 | 不允许 |
|---|---|---|
| 页面组件 | 展示、用户输入、当前对象操作 | 直接写业务持久化 |
| UI hooks | 页面状态、选择、过滤、乐观反馈 | 承载跨服务业务规则 |
| IPC client | 类型化调用、错误映射 | 写第二套业务逻辑 |
| main service | 业务动作、文件访问、运行调度 | 返回松散字符串协议 |
| runtime service | run、node、checkpoint、事件、恢复 | 依赖 React 状态 |
| persistence | manifest、flow、artifact、evidence 落盘 | 混入 UI 文案 |
| governance | 权限、审批、风险、审计 | 只做前端提示 |
| tests | 用户路径、契约、恢复、打包态证明 | 只测 happy path |

## 关键 owner

| 对象 | UI owner | Runtime owner | Persistence owner | Test owner |
|---|---|---|---|---|
| Project | WorkbenchShell | ProjectService | ProjectManifestStore | project journey tests |
| Document | DocumentWorkspace | DocumentService | DocumentStore | editor journey tests |
| Session | AISidebar | SessionService | SessionStore | AI context tests |
| Flow | OrchestrationWorkspace | FlowService | FlowStore | orchestration journey tests |
| Node | NodeInspector | FlowRuntime | FlowStore | node config tests |
| Run | RunStatusStrip | RuntimeService | RunEventStore | pause/resume/recovery tests |
| Approval | DecisionInbox | ApprovalService | ApprovalStore | approval UI tests |
| Artifact | ArtifactPanel | ArtifactService | ArtifactStore | artifact invalidation tests |
| Evidence | EvidenceViewer | EvidenceService | EvidenceStore | provenance tests |

## 架构完成标准

一个模块只有满足以下条件才算边界清楚：

1. UI 只处理呈现和用户输入。
2. 业务动作进入 service。
3. service 有类型化输入输出。
4. 状态持久化有版本和修复策略。
5. 错误能映射到 UI 恢复动作。
6. 测试能覆盖跨层主路径。

