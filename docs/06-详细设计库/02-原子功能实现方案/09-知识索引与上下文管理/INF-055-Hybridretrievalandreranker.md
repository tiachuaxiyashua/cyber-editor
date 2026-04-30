# INF-055 Hybrid retrieval and reranker

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 知识底座 / 检索
- MSABC 分类：S
- 当前状态：部分完成

## 2. 当前代码事实
当前已有轻量混合检索，不是完整 embedding reranker：

1. `src/main/services/hybrid-retrieval-service.ts`
   - 每次检索先触发 `KnowledgeIndexService.refresh(rootPath, 'incremental')`。
   - 同时执行关键词召回、token overlap 语义重叠、固定上下文/引用扩展。
   - 返回 `RetrievalHit[]`，包含 `score`、`matchedBy[]`、`reason` 和 `relatedChangeRecordIds[]`。
2. `src/main/services/runtime-service.ts`
   - 在 harness prompt 构造时使用 retrieval hits。
3. `src/main/services/runtime-budget-governor.ts`
   - 根据 token 预算选择进入 prompt 的命中。

## 3. 目标责任
1. 同时执行关键词召回、向量语义召回和图谱扩展。
2. 统一输出带理由的重排结果。
3. 对 embedding/reranker/provider 降级给出可审计解释。

## 4. 当前接口
```ts
search(query, scope, options): RetrievalResult[]
```

## 5. 返回结构
```json
{
  "itemId": "doc_001",
  "score": 0.92,
  "reasons": ["keyword", "semantic"],
  "expandedFrom": ["doc_010"]
}
```

## 6. 自动测试
已存在代码证据：

1. `tests/unit/hybrid-retrieval-service.test.ts`
   - 多路召回、score、reason、引用扩展。
2. `tests/e2e/knowledge-index-refresh.spec.ts`
   - AI 运行后产生 retrieval hits。
3. `tests/e2e/architecture-governance.spec.ts`
   - context pack 包含 knowledge-hit provenance。

仍缺少：

1. embedding provider 接入后的向量语义召回。
2. reranker 策略和失败降级 proof。
3. 大工程高文档量性能边界。

## 7. 当前审计结论
- 审计状态：部分完成
- 审计说明：关键词、轻量语义重叠、引用扩展和预算选择已进入运行链路；当前 `semantic` 仍是 token overlap，不得宣称向量语义检索或成熟 reranker。
