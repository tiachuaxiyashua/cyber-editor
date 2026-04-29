# 文档编辑与知识关系

负责文档视图、编辑体验、图文混排、保存链路与引用关系。

## 共享代码边界
- `src/renderer/components/MarkdownContent.tsx`
- `src/renderer/App.tsx`
- `src/main/services/project-service.ts`
- `src/shared/ui-preview.ts`

## 共享数据结构
- Markdown source
- TableArtifactModel
- Mermaid blocks
- Mindmap blocks
- NoteReferenceGraph
- NoteReferenceComparison

## 共享实现要求
### 前端/交互
- 文档区默认降噪，保留阅读/编辑/源码三态和少量高频动作。
- 引用关系以当前文档为中心展示，不额外制造独立噪音页面。

### 主进程/服务
- 主进程负责文档保存、图片导入、引用图索引、外部变更检测与比较计算。
- Renderer 负责视图切换和编辑状态。

### 数据与持久化
- 文档以 Markdown 为真实源文件。
- 表格工件以 CSV/TSV/XLSX 形式存在，由独立适配层读取。
- 引用图以工程级缓存或派生索引存在，保存后必须刷新。

### 校验与异常
- 保存链路必须在写回前校验路径、内容和外部冲突。
- Mermaid / 思维导图等结构化块必须有解析失败提示。

### 自动化测试
- e2e：编辑保存、图文插入、引用关系查看、引用对比、冲突弹窗。
- unit：引用索引、文档比较、图块解析。

## 本分类原子功能
- [F-031 文档内查找与替换](./F-031-文档内查找与替换.md) - A / 已完成
- [F-032 阅读/编辑/源码视图切换](./F-032-阅读-编辑-源码视图切换.md) - M / 已完成
- [F-033 文本录入与删除](./F-033-文本录入与删除.md) - M / 已完成
- [F-034 复制/剪切/粘贴/撤销/重做](./F-034-复制-剪切-粘贴-撤销-重做.md) - M / 已完成
- [F-035 Markdown 结构化编辑](./F-035-Markdown结构化编辑.md) - A / 部分完成
- [F-036 Mermaid 插入与渲染](./F-036-Mermaid插入与渲染.md) - S / 已完成
- [F-037 思维导图插入与渲染](./F-037-思维导图插入与渲染.md) - S / 已完成
- [F-038 图片粘贴与拖拽导入](./F-038-图片粘贴与拖拽导入.md) - A / 已完成
- [F-111 表格工件浏览与快速编辑](./F-111-表格工件浏览与快速编辑.md) - A / 部分完成
- [F-112 图形/表格工件超链接与嵌入](./F-112-图形-表格工件超链接与嵌入.md) - A / 部分完成
- [F-039 手动保存、自动保存与脏状态提示](./F-039-手动保存、自动保存与脏状态提示.md) - M / 已完成
- [F-040 外部变更检测与冲突处理](./F-040-外部变更检测与冲突处理.md) - A / 已完成
- [F-041 查看笔记正向与反向引用](./F-041-查看笔记正向与反向引用.md) - A / 已完成
- [F-042 对比两篇笔记的引用关系](./F-042-对比两篇笔记的引用关系.md) - B / 已完成
- [INF-007 Markdown editor/renderer adapter](./INF-007-Markdowneditor-rendereradapter.md) - M / 部分完成
- [INF-049 Table artifact adapter](./INF-049-Tableartifactadapter.md) - A / 已完成
- [INF-008 Mermaid renderer](./INF-008-Mermaidrenderer.md) - S / 已完成
- [INF-009 Mindmap renderer](./INF-009-Mindmaprenderer.md) - S / 已完成
- [INF-050 Diagram/table embed-link resolver](./INF-050-Diagram-tableembed-linkresolver.md) - A / 部分完成
- [INF-010 Image asset importer](./INF-010-Imageassetimporter.md) - A / 已完成
- [INF-011 Reference graph indexer](./INF-011-Referencegraphindexer.md) - A / 已完成
- [INF-012 Reference comparison engine](./INF-012-Referencecomparisonengine.md) - B / 已完成
