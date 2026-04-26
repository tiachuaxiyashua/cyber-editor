## Context

目前 runtime 的主要问题不是“有没有 role package”，而是不同入口的装配方式并不一致：

- 节点调试仍以 role bundle 为主
- 对话路径直接读 `role.promptHint`
- stage draft 和 review 各自依赖不同的 prompt profile / reviewer role 入口

这会导致：

- 新的 task/agent 分层无法真正生效
- 同一个角色在不同入口上表现不同
- 很难解释“这次运行到底是由谁决定的”

因此第二阶段必须先把 execution bundle 装配链建立起来，再让 runtime 各入口复用它。

## Goals / Non-Goals

**Goals:**
- 引入统一的 execution bundle 纯函数装配逻辑。
- 把 node debug、stage、review 和 chat 逐步迁到同一组执行合同。
- 为 flow validator 和 built-in template 增加 task/agent 绑定支撑。

**Non-Goals:**
- 这一 change 不做主要 UI 交互改版。
- 这一 change 不清理全部 legacy role 字段；兼容读取保留到后续清理批次。
- 这一 change 不实现学习/进化 pipeline。

## Decisions

### Decision: 用纯函数 assembler 作为 runtime 统一入口

新增 `src/shared/execution-bundle.ts`，只负责合并 role profile、task template、agent profile 与节点 override，输出 `EffectiveExecutionBundle`。

Why:
- 纯函数更容易测试，也能在 main / renderer 共用执行预览逻辑。
- 避免 runtime service 再次成为“既解析资产又定义语义”的巨石。

Alternative rejected:
- 继续在 `runtime-service.ts` 的每个入口手写合并逻辑。 rejected，因为这正是当前分叉问题的来源。

### Decision: flow validator 先要求 agent 节点具备 taskTemplateId / agentProfileId

validator 会把新的 workflow-centric 绑定视为强语义，但同时允许 legacy fallback 在迁移阶段补出默认 agent profile。

Why:
- 工作流层必须先有明确的数据契约，runtime 才不会继续吃隐式默认值。
- validator 比运行时更适合第一时间阻断错误配置。

Alternative rejected:
- 只在 runtime 才报错。 rejected，因为用户会更晚才发现配置不完整。

### Decision: built-in template 通过 execution profile 过渡，而不是直接删除 stageRoleIds

模板先增加 `stageExecutionProfiles`，运行时优先读取新字段，没有时再 fallback。

Why:
- 可以平滑迁移现有模板和测试，不必一次性重写所有模板消费者。

Alternative rejected:
- 立即删除 `stageRoleIds`。 rejected，因为当前还有多条 runtime 代码路径直接依赖旧字段。

## Risks / Trade-offs

- [runtime 各入口迁移顺序不当会造成语义短暂分裂] -> 以 assembler 为唯一新入口，先引入再逐条替换。
- [validator 过早收紧会让旧项目全红] -> 保留 legacy fallback，并在测试中覆盖迁移行为。
- [template 双读阶段会增加复杂度] -> 将 fallback 集中在 template resolution helpers 中，避免散落多处。
- [execution bundle source map 如果设计太弱，后续 UI 预览价值不够] -> 第一版至少记录 skill/capability/modelPolicy 的来源字段。

## Migration Plan

1. 新增 execution bundle assembler 与单元测试。
2. 扩展 flow validator 的 agent 节点绑定检查。
3. 逐步替换 runtime node debug / stage / review / chat 入口。
4. 为 built-in template 增加 execution profile 映射并保留旧字段 fallback。
5. 跑 targeted runtime 与 semantics regression。

## Open Questions

- chat 路径在第一版是否必须显式拥有 task template，还是允许只用 role + agent profile。
- reviewer execution profiles 是否直接并入统一 stage execution profile，还是保持 review 专用 profile 映射。
