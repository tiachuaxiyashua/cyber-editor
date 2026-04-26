# INF-055 Hybrid retrieval and reranker

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 知识底座 / 检索
- MSABC 分类：S
- 当前状态：未完成

## 2. 责任
1. 同时执行关键词召回、语义召回和图谱扩展。
2. 统一输出带理由的重排结果。

## 3. 核心接口
```ts
search(query, scope, options): RetrievalResult[]
```

## 4. 返回结构
```json
{
  "itemId": "doc_001",
  "score": 0.92,
  "reasons": ["keyword", "semantic"],
  "expandedFrom": ["doc_010"]
}
```

## 5. 自动测试
1. 多路召回合并
2. 重排稳定性
3. 扩展来源保留

## 6. 当前审计结论
- 审计状态：未完成
- 审计说明：混合检索仍停留在设计层，尚未构成统一检索接口。
