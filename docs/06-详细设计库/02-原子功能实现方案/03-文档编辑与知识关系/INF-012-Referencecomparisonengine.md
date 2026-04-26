# INF-012 Reference comparison engine

## 1. 基本信息
- 类型：内部能力
- 所属层级：壳层与文档底座 / 知识关系 / 比较
- MSABC 分类：B
- 当前状态：已完成
- 对应功能：
  - [F-042 对比两篇笔记的引用关系](./F-042-对比两篇笔记的引用关系.md)

## 2. 能力目标
- 基于引用图计算两篇文档的共同/独有引用关系。

## 3. 输入输出
- 输入：`leftDocPath`、`rightDocPath`、`NoteReferenceGraph`
- 输出：`NoteReferenceComparison`

## 4. 实现要求
- 输出必须结构化分组，不由 renderer 手动拼集合。

## 5. 校验与异常
- 同一路径对比自己时直接报校验错误。

## 6. 自动测试
- unit：共同集合、独有集合、共同来源集合。

## 7. 审计结论
- 审计状态：实现级文档已补齐。
