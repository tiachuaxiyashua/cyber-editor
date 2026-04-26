## Context

现在的编排 UI 仍然围绕“角色绑定”组织：

- 节点 inspector 主要是 role + node skill override
- role inspector 直接编辑 `allowedSkillIds`
- 用户无法在工作流层看到任务模板与执行配置

这会让底层对象模型即使已经拆分，前台仍然把所有内容重新压回 role-centric 视角。第三阶段需要把 UI 调整为“工作流节点显式装配、角色只负责稳定身份”的结构。

## Goals / Non-Goals

**Goals:**
- 在工作流节点层显式展示 role / task / agent 三层绑定。
- 让用户看到 effective execution summary 与来源。
- 收缩 role inspector，避免继续编辑本应由 task/agent 持有的执行配置。

**Non-Goals:**
- 这一 change 不重新设计整套视觉样式，只调整信息架构和交互结构。
- 这一 change 不引入新的运行时能力；它消费前两个 change 产出的资产与 execution preview。

## Decisions

### Decision: 节点 inspector 以“绑定面板 + 生效预览”组织

agent 节点 inspector 增加三个绑定控件：role、task template、agent profile；下方显示 effective execution preview。

Why:
- 这样最符合“工作流节点是编排核心”的心智模型。
- 用户能直接判断当前执行语义来自哪一层。

Alternative rejected:
- 继续把 task/agent 配置塞进 role inspector。 rejected，因为这会再次让 role 成为垃圾桶对象。

### Decision: Role inspector 保留身份与依赖摘要，不再承担执行方法编辑

role inspector 只显示 identity/soul/agents/user/memory 段落与 dependency summary。

Why:
- 角色只负责稳定边界与身份。
- required skill 的真实来源应来自 dependency summary 与 agent profile，而不是散落的编辑入口。

Alternative rejected:
- 保留现有 `allowedSkillIds` 直接编辑。 rejected，因为它会和新的 task/agent 资产持续冲突。

## Risks / Trade-offs

- [UI 入口变多，用户短期需要适应] -> 用 effective preview 和清晰命名降低理解成本。
- [如果 execution preview 依赖 runtime-only 逻辑，UI 可能预览不一致] -> 直接复用 shared execution bundle helper。
- [旧 e2e 测试大量依赖 role-centric 文案] -> 将测试一并迁到新的绑定和预览文案。

## Migration Plan

1. 在 App 和 workspace helpers 中接入 task templates / agent profiles 状态。
2. 改造 node inspector 的绑定结构。
3. 收缩 role inspector 为身份与依赖摘要。
4. 增加 execution preview 展示与 e2e 覆盖。

## Open Questions

- task template 与 agent profile 的独立资产编辑入口是放在当前 asset pane 中分组展示，还是进入专门 detail pane。
- execution preview 第一版是否显示完整 source map，还是先显示生效 skill/capability 摘要。
