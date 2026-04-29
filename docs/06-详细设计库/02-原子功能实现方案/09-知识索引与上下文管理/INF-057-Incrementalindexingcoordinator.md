# INF-057 Incremental indexing coordinator

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 知识底座 / 刷新
- MSABC 分类：A
- 当前状态：部分完成

## 2. 责任

增量索引协调器负责判断哪些知识文件需要重建，并在刷新时复用未变化的索引单元。当前能力由 `KnowledgeIndexService` 内聚实现，还没有拆成独立调度器或 watcher coordinator。

## 3. 当前实现

1. `getStatus(rootPath)`
   - 读取持久化索引。
   - 调用 `projectService.listKnowledgeFiles(rootPath)` 获取当前文件。
   - 计算 `staleDocumentPaths`。
2. `refresh(rootPath, mode)`
   - `manual`：所有当前文件重建。
   - `incremental`：只重建 stale 文件，其余 unit 复用。
3. `HybridRetrievalService.retrieve()`
   - 检索前强制 incremental refresh，保证召回前索引不陈旧。

## 4. 持久化

文件位置：

`<projectRoot>/.project/runtime/knowledge/index.json`

结构：

| 字段 | 含义 |
|---|---|
| `version` | 索引版本 |
| `builtAt` | 构建时间 |
| `units[]` | 索引单元 |
| `lastError` | 最近错误 |

## 5. 当前差距

1. 没有独立 watcher coordinator。
2. 没有后台队列和进度事件。
3. 错误状态不会细分为 parse error、permission error、schema error。

## 6. 测试证据

1. `tests/unit/knowledge-index-service.test.ts`
2. `tests/e2e/knowledge-index-refresh.spec.ts`

## 7. 不允许的错误实现

1. 不允许每次检索都无条件全量重建。
2. 不允许删除 stale 文件后旧 unit 继续参与检索。
3. 不允许刷新失败时写入半截索引。
