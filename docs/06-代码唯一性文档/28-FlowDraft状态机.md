# 28 FlowDraft 状态机

## 1. 目标
固定编排草稿从新建、编辑、校验、保存、导出、恢复过程中的状态变化。

## 2. 状态集合
- `draft_empty`
- `draft_loaded`
- `draft_dirty`
- `draft_invalid`
- `draft_valid`
- `draft_saving`
- `draft_saved`
- `draft_snapshotting`
- `draft_restoring`
- `draft_exporting`
- `draft_error`

## 3. 核心规则
1. 节点位置属于 `draft` 本身，不属于临时 UI。
2. 任何结构性改动都必须把草稿置为 `draft_dirty`。
3. `draft_valid` 只是校验结果，不代表已保存。

## 4. 跃迁
1. `draft_empty -> draft_loaded`
   - 打开一个已存在 flow 或创建新 flow
2. `draft_loaded|draft_saved -> draft_dirty`
   - 节点/边/Inspector/布局/输入输出目录任一变更
3. `draft_dirty -> draft_invalid`
   - 校验失败
4. `draft_dirty -> draft_valid`
   - 校验通过
5. `draft_valid|draft_invalid -> draft_saving`
   - 用户点击保存
6. `draft_saving -> draft_saved`
   - 持久化成功
7. `draft_saved -> draft_snapshotting -> draft_saved`
8. `draft_saved|draft_dirty -> draft_restoring -> draft_loaded`
9. `draft_saved|draft_valid -> draft_exporting -> draft_saved`

## 5. 失效规则
1. 修改 node position、panel size、edge binding 后，旧校验结果立即失效。
2. 子流程变更会使父 flow 中引用该子流程的运行快照失效，但不自动删除。

## 6. UI 约束
1. `draft_dirty`：保存按钮高亮，标题显示脏标记。
2. `draft_invalid`：运行按钮禁用，错误列表展开。
3. `draft_saved`：不得重置用户节点布局。

## 7. 测试 Oracle
1. Inspector 改配置后必须进入 `draft_dirty`。
2. 保存成功后再重开，节点位置必须恢复。
3. 恢复旧快照后，当前草稿内容必须完全替换成快照内容。
