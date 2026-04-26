# OpenSpec Change Roadmap

本文档记录当前仓库中仍然活跃的 OpenSpec changes 及建议执行顺序。

规则：
- 只保留仍在推进的 change。
- 已完成并归档的 change 不再继续占用当前路线图。
- 任何 change 关闭前，都必须先通过 `openspec validate <change>`。
- 只有在代码、测试和文档状态都一致时，才能归档。

## 当前活跃 Change

| 顺序 | Change | 目标 | 当前状态 |
|---|---|---|---|
| 1 | `p043-artifact-invalidation-and-rerun` | 打通节点 IO 契约、工件失效传播、下游重跑建议和导出门禁 | 已建，待实现 |
| 2 | `p044-rules-and-distillation-foundation` | 打通规则作用域、冲突解释、沉淀条目提升与运行期注入 | 已建，待实现 |
| 3 | `p045-template-trust-and-runtime-evidence` | 打通模板/技能/角色包信任判定、本地高风险动作治理与运行证据串联 | 已建，待实现 |
| 4 | `p046-workbench-multiwindow-and-progressive-disclosure` | 打通多窗口协调、编排页左右面板稳定性与渐进式降噪入口 | 已建，待实现 |

## 最近完成但尚未归档

| Change | 本轮结论 |
|---|---|
| `p042-role-packages-and-local-tool-binding` | 已完成本地角色包目录加载、连接/工具诊断、节点绑定门禁与本地执行闭环，并完成 lint / unit / build / 目标 e2e。 |
| `p041-orchestration-runtime-semantics-phase2` | 已完成代码、测试和文档回写，可进入归档步骤。 |

## 推荐执行顺序

### P0：先补编排 runtime 的下游依赖

1. `p043-artifact-invalidation-and-rerun`

原因：
- `p041` 与 `p042` 已把并行、审批、恢复，以及角色/连接/工具绑定闭环补到可继续扩展的状态。
- 下一步最卡主线的是“产物变化后下游如何失效与重跑”，否则运行结果仍无法稳定回写到完整工件链。

### P1：再补规则底座与运行治理

1. `p044-rules-and-distillation-foundation`
2. `p045-template-trust-and-runtime-evidence`

原因：
- 规则、沉淀、证据和信任治理都依赖前面的运行事件、检查点和证据索引先稳定。

### P2：最后收口工作台壳层行为

1. `p046-workbench-multiwindow-and-progressive-disclosure`

原因：
- 这是高频体验层，但不应早于 runtime / binding / artifact contract 基座，否则又会出现壳层先行、底层语义缺失的问题。

## 归档策略

- 只有“任务已回写完成 + 自动化测试通过 + 文档状态同步完成”的 change 才能归档。
- 如果 change 只是把状态校正为“尚未完成”，也可以单独归档，但必须明确未完成项已转移到其他 active change。
