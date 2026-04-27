# INF-060 Conversation-to-flow planner

## 1. 职责
把自然语言需求、当前 Flow 上下文、模板上下文转换为结构化 `FlowPlan`、初始 `PlatformFlowAsset` 草稿或 `FlowPatch`。

当前代码没有独立的自然语言转 Flow planner 类；该职责由 `src/main/services/conversation-flow-service.ts` 和 `src/shared/conversation-flow.ts` 共同承担。保留本 INF 名称仅用于追踪原始设计意图。

## 2. 输入
- 用户消息
- 当前 `flowDraft` 摘要
- 当前模板默认节点类型约束
- 当前已安装角色/技能/连接清单

## 3. 输出
- `FlowPlan`
- `PlatformFlowAsset`
- `FlowPatch`
- 生成摘要
- 警告列表

## 4. 设计要求
- 只负责规划补丁，不直接写盘。
- 产物必须是可校验 JSON 结构。
- 模型不可用、mock provider 或结构化 JSON 缺失字段时，必须降级到启发式 plan/patch，而不是输出纯文本解释。

## 5. 与其他服务关系
- 上游：`ContextPane.sendMessage()` / `App.tsx` 的 `orchestration-flow` 会话目标。
- 服务：`ConversationFlowService.planFromPrompt()`、`draftFromPlan()`、`patchFromPrompt()`、`applyPatch()`。
- 共享实现：`buildFlowPlanFromPrompt()`、`buildFlowDraftFromPlan()`、`buildFlowPatchFromPrompt()`、`applyFlowPatch()`。
- 下游：`flowConversationPreview` 预览模态框；用户确认后由 `saveFlow()` 或 `saveDraftFlow()` 写盘。

## 6. 失败策略
- 结构化输出失败：降级到启发式输出。
- patch 为空：生成保底 `add_node` 操作，避免返回不可操作的空结果。
- 保存失败：不清空预览，不覆盖旧 Flow。
