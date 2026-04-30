# INF-060 Conversation-to-flow planner

- MSABC 分类：S
- 当前状态：部分完成

## 1. 职责
把自然语言需求、当前 Flow 上下文、模板上下文转换为结构化 `FlowPlan`、初始 `PlatformFlowAsset` 草稿或 `FlowPatch`。

当前代码没有独立的自然语言转 Flow planner 类；该职责由 `src/main/services/conversation-flow-service.ts` 和 `src/shared/conversation-flow.ts` 共同承担。保留本 INF 名称仅用于追踪原始设计意图。

## 1.1 代码反哺状态
- 已实现：`ConversationFlowService.planFromPrompt()`、`draftFromPlan()`、`patchFromPrompt()` 和 `applyPatch()` 承担自然语言到 Flow 的规划、草稿、补丁和预览应用。
- 已实现：`src/shared/conversation-flow.ts` 提供启发式 `FlowPlan`、`PlatformFlowAsset` 草稿和 `FlowPatch` 构造。
- 已有证据：`tests/unit/conversation-flow-service.test.ts` 覆盖模型 JSON、mock provider 降级和 patch 应用；`tests/e2e/real-user-deepseek-solo-company.spec.ts` 覆盖编排对话预览和应用。
- 仍未完成：当前 planner 未独立输出完整角色建议、工件目录建议和输入/输出目录合同，因此状态保持 `部分完成`。

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
