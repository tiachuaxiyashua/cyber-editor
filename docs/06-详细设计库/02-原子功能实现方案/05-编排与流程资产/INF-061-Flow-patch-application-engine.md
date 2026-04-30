# INF-061 Flow patch application engine

- MSABC 分类：S
- 当前状态：部分完成

## 1. 职责
接收 AI 生成的 `FlowPatch`，对其做结构校验、冲突检测、补丁应用和回滚控制。

## 1.1 代码反哺状态
- 已实现：`src/shared/conversation-flow.ts` 的 `applyFlowPatch()` 支持 `rename_flow`、`add_node`、`update_node`、`delete_node`，并在应用前复制当前 Flow。
- 已实现：`ConversationFlowService.applyPatch()` 通过 shared helper 生成预览 Flow；Renderer 只在用户确认后保存。
- 已有证据：`tests/unit/conversation-flow-service.test.ts` 覆盖 patch 生成和应用。
- 仍未完成：旧设计要求的用户逐项勾选、结构冲突分类报告和运行态结构补丁阻断证据不足，因此状态保持 `部分完成`。

## 2. 输入
- `FlowPatch`
- 当前 `flowDraft`
- 用户勾选的局部接受项

## 3. 输出
- 新的 `flowDraft`
- 补丁应用报告
- 冲突或失败原因

## 4. 关键规则
- 任何补丁应用必须是事务性的：
  - 全部通过再提交
  - 任一步失败则整体回滚
- 结构冲突优先阻断，不允许部分写坏草稿

## 5. 失败类型
- `patch_conflict`
- `invalid_node_reference`
- `invalid_edge_reference`
- `invalid_contract_change`
