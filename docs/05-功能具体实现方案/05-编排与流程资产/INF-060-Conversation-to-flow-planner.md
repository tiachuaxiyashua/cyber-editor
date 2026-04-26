# INF-060 Conversation-to-flow planner

## 1. 职责
把自然语言需求、当前 Flow 上下文、模板上下文转换为结构化 `FlowPatch`。

## 2. 输入
- 用户消息
- 当前 `flowDraft` 摘要
- 当前模板默认节点类型约束
- 当前已安装角色/技能/连接清单

## 3. 输出
- `FlowPatch`
- 生成摘要
- 警告列表

## 4. 设计要求
- 只负责规划补丁，不直接写盘。
- 产物必须是可校验 JSON 结构。
- 缺失字段时应进入 repair loop，而不是输出纯文本解释。

## 5. 与其他服务关系
- 上游：`FlowConversationPanel`
- 下游：`FlowPatchApplicationEngine`

## 6. 失败策略
- 结构化输出失败：走 repair
- repair 后仍失败：返回 `planning_failed`
