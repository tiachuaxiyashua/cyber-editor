# 工程与文件

负责工程生命周期、文件树、文档标签、搜索与目录级操作。

## 共享代码边界
- `src/renderer/App.tsx`
- `src/renderer/components/FileTree.tsx`
- `src/renderer/components/DocumentTabs.tsx`
- `src/renderer/components/FindReplaceBar.tsx`
- `src/main/ipc.ts`
- `src/main/services/project-service.ts`

## 共享数据结构
- ProjectSummary
- FileNode
- DocumentMeta
- OpenDocumentState

## 共享实现要求
### 前端/交互
- 文件树、标签栏、搜索结果、面包屑都要围绕当前工程工作，不允许在无工程状态提前显示。
- 对象级高频操作靠图标、右键和命令面板三条路径并存。

### 主进程/服务
- 主进程负责文件系统实际读写、监听、搜索索引、快照和冲突处理。
- Renderer 只维护当前选中、打开标签和交互态。

### 数据与持久化
- 工程目录是真实文件系统；标签与导航状态写入本地设置或工程态。
- 冲突处理必须保留 lastSaved 与外部 modifiedAt。

### 校验与异常
- 所有删除、重命名、移动操作都要做存在性校验和目标冲突校验。
- 搜索结果必须能反向定位到文件树和文档区。

### 自动化测试
- e2e：创建/重命名/删除文件、外部导入、搜索定位、最近文档恢复。
- unit：项目服务、文件树索引、搜索与冲突检测。

## 本分类原子功能
- [F-015 最近工程快速重开](./F-015-最近工程快速重开.md) - M / 已完成
- [F-016 关闭工程与切换工程](./F-016-关闭工程与切换工程.md) - M / 已完成
- [F-017 打开工程所在目录与导出工程](./F-017-打开工程所在目录与导出工程.md) - A / 已完成
- [F-018 文件树浏览与展开](./F-018-文件树浏览与展开.md) - M / 已完成
- [F-019 文件树搜索与过滤](./F-019-文件树搜索与过滤.md) - A / 已完成
- [F-020 创建文件夹](./F-020-创建文件夹.md) - M / 已完成
- [F-021 创建文件](./F-021-创建文件.md) - M / 已完成
- [F-022 重命名文件或文件夹](./F-022-重命名文件或文件夹.md) - M / 已完成
- [F-023 删除文件或文件夹](./F-023-删除文件或文件夹.md) - M / 已完成
- [F-024 移动文件或文件夹](./F-024-移动文件或文件夹.md) - A / 部分完成
- [F-025 导入外部 Markdown/文本文档](./F-025-导入外部Markdown-文本文档.md) - A / 已完成
- [F-026 导入外部图片资源](./F-026-导入外部图片资源.md) - A / 已完成
- [F-027 打开文档](./F-027-打开文档.md) - M / 已完成
- [F-028 文档标签切换与关闭](./F-028-文档标签切换与关闭.md) - A / 已完成
- [F-029 面包屑与最近打开文档定位](./F-029-面包屑与最近打开文档定位.md) - B / 已完成
- [F-030 全局内容搜索定位](./F-030-全局内容搜索定位.md) - A / 已完成
- [INF-003 Project manifest/scaffold](./INF-003-Projectmanifest-scaffold.md) - M / 已完成
- [INF-005 File tree index/watch](./INF-005-Filetreeindex-watch.md) - M / 已完成
- [INF-006 Document read/write service](./INF-006-Documentread-writeservice.md) - M / 已完成
- [INF-013 Search index and find/replace](./INF-013-Searchindexandfind-replace.md) - A / 已完成
- [INF-014 Tab/navigation state service](./INF-014-Tab-navigationstateservice.md) - A / 已完成
