## Why

即使底层合同和 runtime 被拆开，如果编排工作台仍然只让用户绑定 role、编辑 role skill、并把所有执行语义都藏在旧 inspector 中，新的对象模型仍然无法被真实使用。用户需要在工作流层显式看到：这一步的角色是什么、任务是什么、执行配置是什么，以及最终生效结果从哪里来。

这个 change 负责把编排 UI 和资产中心切到新的工作流中心化模型，同时解决 role inspector 继续过度承载执行配置的问题。

## What Changes

- 在编排工作台中新增 task templates 和 agent profiles 的资产入口与状态装载。
- 将 agent 节点 inspector 拆分为角色、任务模板、执行配置三个绑定控件，并显示 effective execution summary。
- 收缩 role inspector，使其回到身份、原则、包段落与依赖摘要，不再继续承担默认 skill 配置真源。
- 更新相关 e2e 回归，确保节点本地绑定与 execution preview 一致。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `orchestration-workspace`: 编排工作台需要支持分离的 role/task/agent 绑定、执行预览和新的资产视图。

## Impact

- `src/renderer/App.tsx`
- `src/renderer/components/OrchestrationWorkspace.tsx`
- `src/renderer/components/orchestration/workspace-helpers.ts`
- `tests/e2e/orchestration-local-bindings.spec.ts`
- `tests/unit/platform-service-bindings.test.ts`
