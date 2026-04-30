# INF-056 Context packer and token-budget planner

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 知识底座 / 上下文
- MSABC 分类：S
- 当前状态：部分完成

## 2. 当前代码事实
当前已有运行态 ContextPack 与预算裁剪，不是完整用户可控 ContextPack 产品：

1. `src/main/services/runtime-service.ts`
   - `buildContextPack()` 组装文档、检索命中、固定/排除项、预算计划和 provenance。
   - `applySessionContextControls()` 应用会话级固定/排除控制。
2. `src/main/services/runtime-budget-governor.ts`
   - `planContext()` 根据 provider 上下文窗口估算 prompt 与输出预算。
   - 选择可进入 prompt 的 retrieval hits，并记录被截断数量。
3. `src/main/services/project-service.ts`
   - 会话持久化保存 `SessionContextControls`。
4. `src/main/ipc/register-settings-session-ai-ipc.ts`
   - `knowledge:update-session-context-controls` 更新固定/排除控制。

## 3. 目标责任
1. 将候选命中对象打包成可审查上下文包。
2. 控制 token 预算。
3. 区分主命中、扩展命中和被排除项。
4. 提供用户可控、可复用、可解释的 ContextPack 编辑与回放入口。

## 4. 核心接口
```ts
buildContextPack(taskType, candidates, constraints): ContextPack
```

## 5. 输出结构
1. `primaryItems`
2. `expandedItems`
3. `excludedItems`
4. `budget`
5. `provenance`

## 6. 自动测试
已存在代码证据：

1. `tests/unit/runtime-context-recovery.test.ts`
   - pinned/excluded 应用到 context pack。
   - 缺失或越界路径不会进入 provenance。
2. `tests/unit/runtime-context-explanation.test.ts`
   - 上下文解释和预算字段。
3. `tests/e2e/knowledge-index-refresh.spec.ts`
   - Electron 路径下 context pack 与 retrieval hits 生成。

仍缺少：

1. 用户 UI 固定/排除按钮的完整 e2e。
2. 章节、表格区域或工件粒度控制。
3. 可复用 ContextPack 模板和打包态专项证据。

## 7. 当前审计结论
- 审计状态：部分完成
- 审计说明：运行态 context pack、固定/排除和 token budget 已存在；用户可控的章节级上下文包、复用入口和打包态证据仍未闭环。
