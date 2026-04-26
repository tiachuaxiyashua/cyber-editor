# 15 系统壳层与知识底座组件 Props 与 Hook 状态设计

## 1. 目标
把工作台壳层、三栏布局、窗口协同、通知、知识索引和 ContextPack 推荐压到系统组件级。

## 2. 页面组件树
- `AppShell`
  - `ActivityBar`
  - `PrimarySidebar`
  - `MainViewport`
  - `SecondarySidebar`
  - `BottomPanel`
  - `ToastHost`
- `KnowledgeCenterDrawer`
  - `IndexStatusCard`
  - `HybridSearchPanel`
  - `ContextPackRecommendationList`
  - `CitationEvidencePanel`

## 3. Props 契约
- `AppShell`
  - 输入：`layoutState`, `themeState`, `windowState`, `activePrimaryView`, `activeSecondaryView`
  - 输出：`onResizePane`, `onToggleView`, `onOpenSettings`, `onOpenKnowledgeCenter`
- `KnowledgeCenterDrawer`
  - 输入：`indexStatus`, `searchResults`, `contextPackSuggestions`, `citationEvidence`
  - 输出：`onRefreshIndex`, `onSearch`, `onPinContextPack`, `onExcludeContextPack`

## 4. Hook 与状态归属
- `useShellLayoutState`
- `useWindowCoordinationState`
- `useToastQueue`
- `useKnowledgeCenterState`

## 5. 方法级 I/O
- `WindowStateService.load(): Promise<WindowLayoutState>`
- `KnowledgeIndexerService.refresh(input): Promise<IndexRefreshResult>`
- `HybridRetrievalService.search(input): Promise<HybridSearchResult>`
- `ContextPackService.recommend(input): Promise<ContextPackRecommendationResult>`

## 6. 持久化
- 布局/主题/窗口状态写到应用级 UI 状态文件
- 知识索引写缓存目录
- ContextPack pin/exclude 写工程级上下文设置

## 7. 开发顺序
1. shell layout state
2. window state persistence
3. toast/help/error host
4. knowledge index service
5. retrieval/context pack service
6. knowledge center drawer
7. shell + multiwindow + index freshness regression

