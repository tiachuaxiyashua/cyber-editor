## 1. Shared Contracts

- [x] 1.1 新增 `src/shared/orchestration-contracts.ts`，定义 `RoleProfile`、`TaskTemplate`、`AgentProfile`、`DependencySpec` 和 legacy migration helper
- [x] 1.2 扩展 `src/shared/types.ts`，为 flow node 和 runtime bundle 增加任务模板、执行配置与 execution bundle 引用
- [x] 1.3 添加 `tests/unit/orchestration-contracts.test.ts`，锁定旧 role 到新合同的迁移语义

## 2. Role Package Dependency Import

- [x] 2.1 扩展 `src/shared/role-package.ts` 支持 `dependencySpec` 解析与写入
- [x] 2.2 新增 `src/main/services/dependency-installer-service.ts` 并接入 `role-package-registry-service.ts`
- [x] 2.3 添加 `tests/unit/role-package-registry-service.test.ts` 和 `tests/unit/dependency-installer-service.test.ts` 验证 required dependency 自动安装与 warning 状态

## 3. Platform Asset Persistence

- [x] 3.1 扩展 `platform-service.ts`、IPC 和 preload，持久化 `task-templates.json` 与 `agent-profiles.json`
- [x] 3.2 在 `src/renderer/App.tsx` 注入 task templates 和 agent profiles 的应用级状态装载
- [x] 3.3 更新 `tests/unit/platform-service-bindings.test.ts` 并完成本 change 的 targeted test 验证
