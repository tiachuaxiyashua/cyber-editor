# INF-054 Document knowledge graph indexer

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 知识底座 / 图谱
- MSABC 分类：S
- 当前状态：未完成

## 2. 责任
1. 把文档、工件、Flow、Role、Template 和运行记录建成统一关系图。

## 3. 节点类型
1. Document
2. Block
3. Artifact
4. Flow
5. Subflow
6. Role
7. Template
8. RuntimeRecord

## 4. 边类型
1. `references`
2. `embeds`
3. `belongs_to`
4. `produces`
5. `consumes`
6. `generated_from`
7. `variant_of`
8. `used_by`

## 5. 自动测试
1. 全量建图
2. 增量更新
3. 删除对象后的边清理

## 6. 当前审计结论
- 审计状态：未完成
- 审计说明：图谱对象和边模型仍未变成正式索引底座。
