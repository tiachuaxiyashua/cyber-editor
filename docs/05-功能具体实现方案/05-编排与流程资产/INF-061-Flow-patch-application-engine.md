# INF-061 Flow patch application engine

## 1. 职责
接收 AI 生成的 `FlowPatch`，对其做结构校验、冲突检测、补丁应用和回滚控制。

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
