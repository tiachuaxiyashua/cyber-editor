# INF-054 Document knowledge graph indexer

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 知识底座 / 图谱
- MSABC 分类：S
- 当前状态：部分完成

## 2. 当前代码事实
当前已有轻量文档知识索引，不是完整跨对象知识图谱：

1. `src/main/services/knowledge-index-service.ts`
   - 写入 `.project/runtime/knowledge/index.json`。
   - 每个 `KnowledgeIndexUnit` 包含路径、标题、摘要、关键词、入链、出链、相关变更记录、修改时间和索引时间。
   - 支持 manual 与 incremental refresh。
2. `src/main/services/project-service.ts`
   - `buildNoteReferenceGraph()` 提供 Markdown 引用关系。
   - `getRelevantDocumentChanges()` 提供文档变更关联。
3. `src/main/services/project-knowledge-graph-builder.ts`
   - 为工程知识图谱和 UI 展示提供结构化构建能力。

## 3. 目标责任
1. 把文档、工件、Flow、Role、Template 和运行记录建成统一关系图。

## 4. 目标节点类型
1. Document
2. Block
3. Artifact
4. Flow
5. Subflow
6. Role
7. Template
8. RuntimeRecord

## 5. 目标边类型
1. `references`
2. `embeds`
3. `belongs_to`
4. `produces`
5. `consumes`
6. `generated_from`
7. `variant_of`
8. `used_by`

## 6. 自动测试
已存在代码证据：

1. `tests/unit/knowledge-index-service.test.ts`
   - 索引刷新、增量状态和索引单元。
2. `tests/unit/project-knowledge-graph.test.ts`
   - 工程知识图谱构建。
3. `tests/e2e/knowledge-index-refresh.spec.ts`
   - Electron 路径下刷新与状态展示。

仍缺少：

1. Flow、Role、Template、RuntimeRecord 统一进入同一图谱的 proof。
2. 删除对象后的跨对象边清理 proof。
3. 打包态专项证据。

## 7. 当前审计结论
- 审计状态：部分完成
- 审计说明：文档索引、引用边和工程知识图谱已形成轻量底座；完整跨对象知识图谱仍未闭环，不能宣称完整 RAG 图谱能力。
