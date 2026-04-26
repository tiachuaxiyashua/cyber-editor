## 1. Execution Bundle Assembly

- [x] 1.1 新增 `src/shared/execution-bundle.ts` 并添加 `tests/unit/execution-bundle.test.ts`
- [x] 1.2 扩展 `src/shared/flow-validator.ts`，为 agent 节点增加 task template 和 agent profile 绑定验证
- [x] 1.3 在 `tests/unit/runtime-orchestration-semantics.test.ts` 中补齐 bundle 语义断言

## 2. Runtime Entry Unification

- [x] 2.1 将 node debug 路径切换为 execution bundle 装配
- [x] 2.2 将 stage generation、chat 和 review 路径切换为 execution profile + execution bundle 装配
- [x] 2.3 更新 `tests/unit/runtime-service.test.ts` 与 `tests/unit/runtime-service-controls.test.ts` 锁定新入口行为

## 3. Template Migration

- [x] 3.1 扩展 built-in template payload，增加 stage execution profiles 并保留 legacy fallback
- [x] 3.2 在 runtime/template resolution 中优先使用新的 execution profile 绑定
- [x] 3.3 完成本 change 的 targeted runtime 回归验证
