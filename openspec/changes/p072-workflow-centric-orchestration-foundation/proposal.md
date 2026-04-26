## Why

当前编排代码仍以 `PlatformRole` 作为主要装配对象，角色同时承担身份、方法、依赖、输出和模型策略，已经与新的“工作流为核心、任务/角色/执行配置分层”的设计口径冲突。与此同时，role 绑定的 skill 仍然只是 ID 列表，导入角色包后不会自动安装必需依赖，导致角色包无法成为真正可移植、可复用的执行资产。

这个 change 需要先打基础：把工作流中心化对象模型落到共享合同、角色包 manifest、导入依赖安装和平台资产持久化上。只有这层成立，后续 runtime 和 UI 拆分才不会继续围绕旧的 role-centric 结构打补丁。

## What Changes

- 新增工作流中心化共享合同，拆分 `RoleProfile`、`TaskTemplate`、`AgentProfile`、`DependencySpec` 和 `EffectiveExecutionBundle` 的基础类型与兼容迁移辅助。
- 扩展角色包 manifest，支持 `dependencySpec` 和依赖安装结果摘要，不再只依赖 `Skills/skills.json`。
- 为角色包导入增加 required dependency 自动安装路径，先覆盖 skill 依赖，并把失败结果回写到安装状态。
- 将平台资产持久化从“只有 roles/connectors/tools”扩展为“roles/task templates/agent profiles”并保持兼容读取。
- 保留旧字段兼容读取，但不再把旧 role 字段视作未来唯一真源。

## Capabilities

### New Capabilities
- `workflow-execution-assets`: 编排系统支持分离的角色画像、任务模板、执行配置与兼容迁移基础。

### Modified Capabilities
- `role-package-runtime`: 角色包导入与注册需要支持 `dependencySpec`、required skill 自动安装和依赖健康摘要。

## Impact

- `src/shared/types.ts`
- `src/shared/orchestration-contracts.ts`
- `src/shared/role-package.ts`
- `src/main/services/platform-service.ts`
- `src/main/services/role-package-registry-service.ts`
- `src/main/services/dependency-installer-service.ts`
- `src/main/ipc.ts`
- `src/main/preload.ts`
- `src/renderer/App.tsx`
- `tests/unit/orchestration-contracts.test.ts`
- `tests/unit/platform-service-bindings.test.ts`
- `tests/unit/role-package-registry-service.test.ts`
- `tests/unit/dependency-installer-service.test.ts`
