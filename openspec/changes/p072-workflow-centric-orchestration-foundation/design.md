## Context

现有实现把 `PlatformRole` 当作运行时主装配对象，导致：

- 角色定义同时承载身份、技能、能力、输出格式和模型策略
- 平台持久化只有 roles，没有 task templates 和 agent profiles
- 角色包 manifest 无法表达“随包导入的依赖”
- role 导入后，用户仍需手动安装 skill，角色包无法完整复用

文档已经明确切换为“工作流为核心”的对象模型：工作流决定步骤，任务模板定义目标与完成标准，角色只定义稳定立场与边界，执行配置负责把角色、技能、能力和模型策略装配成一次可运行实体。因此第一阶段必须先把共享合同和平台资产形态纠正过来。

## Goals / Non-Goals

**Goals:**
- 建立可兼容旧 `PlatformRole` 的新对象模型基础类型。
- 让角色包 manifest 可以声明 required dependency，并在导入时执行安装。
- 将 task templates 和 agent profiles 作为一等平台资产持久化。
- 保留旧字段兼容读取，避免一次性 flag day。

**Non-Goals:**
- 这一 change 不统一 runtime 入口，不改 stage/chat/review 的主调用链。
- 这一 change 不做编排 UI 的大面积交互改造。
- 这一 change 不引入完整的学习/进化流水线。

## Decisions

### Decision: 先增加新合同文件，而不是立即删除旧 `PlatformRole`

新增 `src/shared/orchestration-contracts.ts` 承载 `RoleProfile`、`TaskTemplate`、`AgentProfile`、`DependencySpec` 和兼容迁移辅助。`types.ts` 先只加引用字段和 bundle 合同，不立即删旧字段。

Why:
- 这样可以在保持现有测试和 IPC 大体稳定的前提下，逐步把调用点迁走。
- 让 runtime 和 UI 后续 change 有明确的新类型可依赖。

Alternative rejected:
- 直接重写 `PlatformRole`。 rejected，因为当前 runtime、UI、测试耦合都很深，容易造成一次性大面积红测。

### Decision: dependency 安装作为角色包导入的显式服务

新增 `DependencyInstallerService`，由 `RolePackageRegistryService` 在安装角色包后调用，并把安装结果持久化为 `dependencySummary`。

Why:
- 角色包导入与依赖安装属于不同职责，单独服务更易测试。
- 之后 agent/profile 依赖也可以复用同一条安装链。

Alternative rejected:
- 把依赖安装逻辑直接写入 `role-package-registry-service.ts`。 rejected，因为会继续扩大一个已经很重的注册服务。

### Decision: TaskTemplate 和 AgentProfile 先作为平台资产持久化，而非立即强绑定到流程运行

在 `platform-service.ts`、IPC 和 preload 中先暴露 `task-templates.json` 与 `agent-profiles.json` 的保存/读取。

Why:
- 先让资产存在，后续 runtime 和 UI 才能以真实数据推进。
- 这符合“资产先存在，再被工作流和运行时消费”的顺序。

Alternative rejected:
- 让 runtime 在没有持久化资产的情况下直接从节点草稿拼装。 rejected，因为会让后续 UI 和模板迁移继续依赖临时结构。

## Risks / Trade-offs

- [新旧合同并存会带来一段时间的重复字段] -> 通过迁移辅助函数和单位测试确保兼容边界明确。
- [dependency 安装先只覆盖 skill，后续还要扩展插件/connector] -> 在 `DependencySpec` 中先把 kind 留完整，第一阶段只落 skill 执行分支。
- [新增资产文件会影响平台加载路径] -> 在 `PlatformService` 中使用不存在即空数组的兼容读取策略，避免旧项目损坏。
- [角色包健康状态从“只看包结构”变成“还看依赖安装结果”] -> 用 `dependencySummary` 单独说明原因，避免把包损坏和依赖缺失混为一谈。

## Migration Plan

1. 新增共享合同和 legacy migration helper。
2. 扩展角色包 manifest parser/writer，支持 `dependencySpec`。
3. 新增 dependency installer，并接入 role package import。
4. 扩展 platform asset save/load 与 IPC。
5. 用 targeted unit tests 锁定兼容语义。

## Open Questions

- builtin skill 与 registry/url skill 的更严格来源校验是否在本 change 就收口，还是放到后续 trust/governance change。
- 角色包导入失败时，是否要直接阻断安装，还是允许 warning 状态继续保留包元数据。
