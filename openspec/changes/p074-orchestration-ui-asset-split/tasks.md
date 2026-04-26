## 1. Asset State Wiring

- [x] 1.1 在 `src/renderer/App.tsx` 和 workspace helpers 中接入 task templates / agent profiles 的前端状态
- [x] 1.2 为编排资产区增加 task template 与 agent profile 的列表 / 选择入口
- [x] 1.3 更新依赖的单元测试或绑定测试夹具

## 2. Node Inspector Split

- [x] 2.1 为 agent 节点 inspector 增加 role、task template、agent profile 三个绑定控件
- [x] 2.2 在节点 inspector 中加入 effective execution summary 和来源预览
- [x] 2.3 收缩 role inspector，仅保留身份段落与 dependency summary

## 3. Regression Closure

- [x] 3.1 更新 `tests/e2e/orchestration-local-bindings.spec.ts` 断言新的绑定与预览行为
- [x] 3.2 运行编排相关 targeted e2e / unit 回归
- [x] 3.3 根据实际落地结果回写文档和 change 状态
