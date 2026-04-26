## Why

即使基础对象模型拆开之后，当前 runtime 仍然会在不同入口各自拼装执行上下文：node debug 走 role bundle，chat 直接吃 `promptHint`，stage generation 主要读 prompt profile，review 又走另一条 reviewer role 路径。只要这些入口不统一，代码仍然会继续漂在旧的 role-centric 语义上。

这个 change 要把 runtime 统一到“工作流节点 + 任务模板 + 执行配置 + 角色画像”的执行 bundle 上，并让 built-in template 和流程校验一起迁移。这样工作流中心化设计才会真正进入运行时主链路。

## What Changes

- 新增纯函数 `ExecutionBundleAssembler`，把 role profile、task template、agent profile 和节点 override 合并成 `EffectiveExecutionBundle`。
- 将 node debug、chat、stage generation 和 review runtime 路径逐步统一到 execution bundle 装配入口。
- 扩展 flow validator，要求 agent 节点具备角色、任务模板和执行配置的可解析绑定，保留旧项目兼容迁移策略。
- 迁移 built-in template 中的 stage 绑定，从 raw stage role ids 过渡到 execution profile 解析。

## Capabilities

### New Capabilities
- `workflow-execution-runtime`: 运行时支持从工作流绑定解析统一 execution bundle，并保留来源追踪。

### Modified Capabilities
- `ai-stage-orchestration`: stage 运行需要从任务模板和执行配置解析执行上下文，而不再只依赖原始 role 默认值。
- `review-orchestration`: review 运行需要通过结构化 execution profile 装配 reviewer runtime。

## Impact

- `src/shared/execution-bundle.ts`
- `src/shared/flow-validator.ts`
- `src/main/services/runtime-service.ts`
- `src/main/services/platform-service.ts`
- `src/shared/template-packages/software-factory.json`
- `tests/unit/execution-bundle.test.ts`
- `tests/unit/runtime-orchestration-semantics.test.ts`
- `tests/unit/runtime-service.test.ts`
- `tests/unit/runtime-service-controls.test.ts`
