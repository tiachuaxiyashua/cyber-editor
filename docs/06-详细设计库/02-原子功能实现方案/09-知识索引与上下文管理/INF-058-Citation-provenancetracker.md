# INF-058 Citation / provenance tracker

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 知识底座 / 追溯
- MSABC 分类：A
- 当前状态：已完成

## 2. 责任

`ProvenanceService` 负责把上下文来源转换为结构化证据，并为旧 UI / 旧测试保留 provenance token。它是 context pack 来源追踪的唯一 owner。

## 3. 代码 owner

| 层 | 文件 | 职责 |
|---|---|---|
| Service | `src/main/services/provenance-service.ts` | 构造 `ProvenanceRecord[]` 和 legacy tokens |
| Runtime | `src/main/services/runtime-service.ts` | 在 harness prompt 和 context pack 中写入 provenance |
| Evidence | `src/main/services/evidence-store-service.ts` | 持久化 context packs |
| Renderer | `src/renderer/components/AppShellSections.tsx` | 展示来源证据和打开原文 |

## 4. 输入

| 输入 | 含义 |
|---|---|
| `retrievalHits[]` | 知识检索命中 |
| `contextDocumentPaths[]` | 显式上下文文档 |
| `pinnedDocumentPaths[]` | 用户固定文档 |
| `rollingSummary` | 会话滚动摘要 |
| `resumedFromRunId` | 恢复运行来源 |
| `effectiveRules[]` | 生效规则 |
| `promotedKnowledge[]` | 已提升知识节点 |
| `baseProvenance[]` | 调用方传入的基础来源 |

## 5. 输出

1. `ProvenanceRecord[]`
   - `id`
   - `kind`
   - `label`
   - `detail`
   - `sourcePath`
   - `score`
2. Legacy tokens
   - `knowledge-hit:<path>`
   - `context-document:<path>`
   - `conversation-summary`
   - `resume:<runId>`
   - `recent-change:<id>`
   - `rule:<name>`
   - `knowledge:<title>`

## 6. 测试证据

1. `tests/unit/provenance-service.test.ts`
2. `tests/unit/runtime-context-explanation.test.ts`
3. `tests/unit/runtime-context-recovery.test.ts`
4. `tests/e2e/architecture-governance.spec.ts`

## 7. 不允许的错误实现

1. 不允许只保留字符串 token 而不保留结构化记录。
2. 不允许固定上下文与普通上下文显示同一 label。
3. 不允许被排除文档进入 provenance records。
