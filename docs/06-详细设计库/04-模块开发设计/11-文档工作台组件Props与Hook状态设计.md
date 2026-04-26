# 11 文档工作台组件 Props 与 Hook 状态设计

## 1. 目标
把文件树、标签页、文档视图、多窗口/分屏的实现边界压实到组件和方法级。

## 2. 页面组件树
- `WorkbenchPage`
  - `WorkbenchHeader`
  - `WorkbenchSidebar`
    - `FileTreePane`
    - `SearchPane`
  - `DocumentWorkspace`
    - `DocumentTabs`
    - `DocumentViewport`
      - `MarkdownReadView`
      - `MarkdownEditView`
      - `SourceCodeView`
      - `TableQuickView`
      - `EmbeddedArtifactBlocks`
  - `SplitViewManager`
  - `BreadcrumbBar`
  - `FindReplaceDialog`

## 3. Props 契约
### `DocumentWorkspace`
- 输入
  - `openTabs: DocumentTabViewModel[]`
  - `activeTabId?: string`
  - `splitLayout: SplitLayoutState`
  - `documentViewMode: "read" | "edit" | "source" | "table"`
  - `pendingExternalConflict?: ConflictViewModel`
- 输出事件
  - `onOpenDocument(path)`
  - `onCloseTab(tabId)`
  - `onRestoreClosedTab()`
  - `onSplit(direction)`
  - `onChangeViewMode(mode)`
  - `onSaveDocument()`

### `FileTreePane`
- 输入
  - `tree: FileTreeNode[]`
  - `selectedPath?: string`
  - `expandedPaths: string[]`
  - `filterKeyword: string`
- 输出事件
  - `onToggleNode(path)`
  - `onSelectPath(path)`
  - `onCreateFile(parentPath)`
  - `onCreateFolder(parentPath)`
  - `onRename(path)`
  - `onDelete(path)`
  - `onMove(path, targetPath)`

## 4. Hook 与状态归属
- `useWorkbenchLayoutState`
  - 三栏宽度
  - 分屏布局
  - 当前焦点窗格
- `useDocumentTabsState`
  - `openTabs`
  - `closedTabsStack`
  - `activeTabId`
- `useDocumentSessionState`
  - `viewMode`
  - `dirtyState`
  - `findReplaceState`
  - `externalConflictState`

## 5. 方法级 I/O
### Renderer
- `openDocument(path: string): Promise<void>`
- `saveActiveDocument(): Promise<void>`
- `setViewMode(mode: DocumentViewMode): void`
- `splitActiveView(direction: SplitDirection): void`

### Main / Service
- `ProjectService.readDocument(path): Promise<DocumentReadResult>`
- `ProjectService.saveDocument(input): Promise<DocumentSaveResult>`
- `ProjectService.detectExternalChange(path): Promise<ConflictDetectionResult>`
- `ReferenceGraphService.refresh(path): Promise<ReferenceRefreshResult>`

## 6. 持久化
- `openTabs`、`activeTabId`、`splitLayout` 写到工作区 UI 状态
- 文档正文按显式保存写盘
- 外部冲突记录只写临时状态，不写正式工程

## 7. 开发顺序
1. 文档类型与 view model
2. 文件树服务与 IPC
3. 标签页服务与恢复
4. 文档视图切换
5. 分屏与多窗口
6. 引用关系刷新
7. 冲突处理
8. e2e 工作台主路径

