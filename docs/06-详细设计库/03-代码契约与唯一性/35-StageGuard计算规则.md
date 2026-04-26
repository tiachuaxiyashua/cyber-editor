# 35 Stage Guard 计算规则

## 1. 目标
固定阶段 guard 的计算公式、阻断原因和展示方式。

## 2. 输入
- 当前阶段定义
- 阶段输出契约
- 当前工件目录状态
- 当前运行状态
- 审查状态
- 用户必填输入状态

## 3. 计算步骤
1. 读取当前阶段所需工件清单。
2. 检查必需工件是否存在。
3. 检查必需工件是否通过校验。
4. 检查是否存在未解决 blocker。
5. 检查是否仍有运行中的关键任务。
6. 生成 guard 结果：
   - `pass`
   - `blocked`
   - `pending`

## 4. 阻断原因分类
- `missing_required_artifact`
- `artifact_validation_failed`
- `blocking_issue_unresolved`
- `critical_run_in_progress`
- `required_input_missing`

## 5. UI 约束
1. `pass`：可确认，但仍显示已满足项。
2. `pending`：按钮禁用，提示仍在运行。
3. `blocked`：按钮禁用，并列出阻断项与跳转修复入口。

## 6. 测试 Oracle
1. 缺工件时 guard 不能通过。
2. 关键任务运行中时 guard 必须是 `pending`。
3. blocker 清空后 guard 才能从 `blocked` 进入 `pass`。
