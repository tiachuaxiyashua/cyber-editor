# 08 编排页组件 Props 与 Hook 状态设计

## 1. 目标
1. 把编排页从“模块总览”压到“程序员可以直接拆文件实现”的粒度。
2. 固定组件边界、Props 契约、Hook 状态 shape、调用链、持久化时机和回滚策略。
3. 让另一套 AI 或初级程序员在不自由发挥的前提下实现同一套编排页。

## 2. 页面组件树与 Props 契约
### 2.1 `OrchestrationPage`
- 责任：装配整页布局，持有页面级路由状态，不直接修改 `flowDraft`。
- Props
```ts
type OrchestrationPageProps = {
  projectId?: string;
  activeFlowId?: string;
  mode: "project" | "draft";
};
```

### 2.2 `OrchestrationHeader`
- 责任：显示当前 Flow 名称、运行入口、保存入口、模式切换入口。
- Props
```ts
type OrchestrationHeaderProps = {
  flowTitle: string;
  dirty: boolean;
  mode: "design" | "run";
  canRun: boolean;
  onSave(): void;
  onRun(): void;
  onToggleMode(next: "design" | "run"): void;
};
```

### 2.3 `FlowConversationPanel`
- 责任：自然语言编排对话入口，不直接改写 `flowDraft`。
- Props
```ts
type FlowConversationPanelProps = {
  status: "idle" | "submitting" | "patch_ready" | "error";
  conversation: FlowConversationMessage[];
  pendingPatch?: FlowPatch;
  disabled: boolean;
  onSubmit(message: string): void;
  onApplyPatch(): void;
  onRejectPatch(): void;
};
```

### 2.4 `AssetSidebar`
- 责任：列出 Flow / Subflow / Role Package / Connector / Tool / Artifact Catalog。
- Props
```ts
type AssetSidebarProps = {
  width: number;
  activeTab: "flows" | "roles" | "connectors" | "tools" | "artifacts";
  selectedFlowId?: string;
  selectedRolePackageId?: string;
  onResize(width: number): void;
  onSwitchTab(tab: AssetSidebarProps["activeTab"]): void;
  onOpenFlow(flowId: string): void;
  onOpenRolePackage(rolePackageId: string): void;
};
```

### 2.5 `NodePalettePanel`
- 责任：提供可拖拽节点卡片。
- Props
```ts
type NodePalettePanelProps = {
  allowedNodeTypes: FlowNodeType[];
  onDragStart(nodeType: FlowNodeType): void;
};
```

### 2.6 `CanvasViewport`
- 责任：承载 React Flow、节点卡片、边、连线交互、缩放与平移。
- Props
```ts
type CanvasViewportProps = {
  flowDraft: FlowDraft;
  viewport: FlowViewportState;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  mode: "design" | "run";
  onViewportChange(next: FlowViewportState): void;
  onNodeSelect(nodeId?: string): void;
  onEdgeSelect(edgeId?: string): void;
  onAddNode(nodeType: FlowNodeType, point: XYPosition): void;
  onMoveNode(nodeId: string, point: XYPosition): void;
  onConnect(input: EdgeDraftInput): void;
  onOpenContextMenu(target: FlowContextTarget, point: XYPosition): void;
};
```

### 2.7 `NodeCard`
- 责任：显示节点摘要、状态、对象级高频操作。
- Props
```ts
type NodeCardProps = {
  node: FlowNode;
  selected: boolean;
  stale: boolean;
  runState?: RuntimeNodeState;
  onOpenSubflow(nodeId: string): void;
  onDuplicate(nodeId: string): void;
  onDelete(nodeId: string): void;
  onOpenInspector(nodeId: string): void;
};
```

### 2.8 `InspectorPanel`
- 责任：编辑节点、边、Flow、阶段契约、导出映射。
- Props
```ts
type InspectorPanelProps = {
  width: number;
  selection: FlowSelectionState;
  flowDraft: FlowDraft;
  validation: FlowValidationResult;
  onResize(width: number): void;
  onPatchNode(nodeId: string, patch: Partial<FlowNodeConfig>): void;
  onPatchEdge(edgeId: string, patch: Partial<FlowEdgeConfig>): void;
  onPatchFlow(patch: Partial<FlowMeta>): void;
};
```

### 2.9 `RuntimeDrawer`
- 责任：显示运行日志、节点状态、上下文变量、重跑入口。
- Props
```ts
type RuntimeDrawerProps = {
  open: boolean;
  run?: FlowRunSummary;
  events: RuntimeEvent[];
  onRerunFromNode(nodeId: string): void;
  onResume(runId: string): void;
  onClose(): void;
};
```

## 3. Hook / State 归属
### 3.1 `useFlowDraftState`
```ts
type UseFlowDraftState = {
  flowDraft?: FlowDraft;
  dirty: boolean;
  staleNodeIds: string[];
  validation?: FlowValidationResult;
  loadFlow(flowId: string): Promise<void>;
  patchFlow(mutator: FlowDraftMutator): void;
  saveFlow(): Promise<FlowSaveResult>;
};
```
- 唯一负责 `flowDraft` 内存真源。
- 所有节点、边、Flow 元数据修改都必须经此 hook。

### 3.2 `useSelectionState`
```ts
type UseSelectionState = {
  selectedNodeId?: string;
  selectedEdgeId?: string;
  selectNode(nodeId?: string): void;
  selectEdge(edgeId?: string): void;
  clearSelection(): void;
};
```

### 3.3 `useCanvasViewportState`
```ts
type UseCanvasViewportState = {
  viewport: FlowViewportState;
  setViewport(next: FlowViewportState): void;
  fitToFlow(): void;
};
```

### 3.4 `usePanelLayoutState`
```ts
type UsePanelLayoutState = {
  assetSidebarWidth: number;
  inspectorWidth: number;
  runtimeDrawerHeight: number;
  setAssetSidebarWidth(width: number): void;
  setInspectorWidth(width: number): void;
  setRuntimeDrawerHeight(height: number): void;
};
```

### 3.5 `useFlowConversationState`
```ts
type UseFlowConversationState = {
  status: "idle" | "submitting" | "patch_ready" | "error";
  conversation: FlowConversationMessage[];
  pendingPatch?: FlowPatch;
  submit(message: string): Promise<void>;
  applyPatch(): Promise<void>;
  rejectPatch(): void;
};
```

## 4. 组件到 Service 的逐方法调用关系
| Renderer 组件/Hook | 调用入口 | IPC | Main/Service | 返回 |
|---|---|---|---|---|
| `useFlowDraftState.loadFlow` | 打开 Flow | `runtimeAsset.openFlow` | `RuntimeAssetService.openFlow` | `FlowDraft` |
| `useFlowDraftState.saveFlow` | 保存 | `runtimeAsset.saveFlow` | `RuntimeAssetService.saveFlow` + `FlowValidationEngine.validate` | `FlowSaveResult` |
| `CanvasViewport.onConnect` | 创建边 | 无直接 IPC，先改 draft | 本地 patch | 新边进入 `flowDraft` |
| `InspectorPanel.onPatchNode` | Inspector 改节点 | 无直接 IPC，先改 draft | 本地 patch | 节点被 patch，必要时标 stale |
| `FlowConversationPanel.onSubmit` | 自然语言生成/修改 | `conversationToFlow.plan` | `ConversationToFlowPlanner.planFlowFromConversation` | `FlowPatch` |
| `FlowConversationPanel.onApplyPatch` | 应用 AI 补丁 | `flowPatch.apply` | `FlowPatchApplicationEngine.applyFlowPatch` | 新 `FlowDraft` |
| `RuntimeDrawer.onRerunFromNode` | 局部重跑 | `runtime.runFromNode` | `CapabilityRuntime.rerunFromNode` | `RunAccepted` |

## 5. Inspector 到 Draft 的 Patch 规则
1. Inspector 不允许直接修改原始节点对象引用，必须生成 `patch`。
2. `patch` 只允许作用在被选中对象：
   - 节点 Inspector -> 当前 `selectedNodeId`
   - 边 Inspector -> 当前 `selectedEdgeId`
   - Flow Inspector -> 当前 `activeFlowId`
3. `patch` 应用顺序固定：
   - 字段级本地校验
   - patch 合并
   - 结构校验
   - stale 传播
   - UI 回显
4. patch 不允许跨节点写入其它对象字段。
5. 影响 IO 契约或导出映射的 patch，必须同步刷新 `validation`。

## 6. 持久化时机与回滚时机
### 6.1 写入时机
- 节点拖拽、连线、Inspector 编辑：只改内存 draft，不立即写盘。
- 显式保存：写入 `flow.json`、`ui.json`、`contracts/*.json`。
- 运行前快照：写入 `snapshots/<snapshotId>/`。

### 6.2 回滚时机
- 校验失败：撤销本次 patch，不回滚整份 draft。
- 保存失败：保留内存 draft，标记 `dirty=true` 与 `saveError`。
- 应用 AI patch 失败：保留原 draft，不污染节点位置和选择态。

## 7. 文件级 / 类级开发顺序
1. `src/shared/types.ts`
   - 先补 `FlowPatch`、`FlowConversationRequest`、`RuntimeNodeState`
2. `src/shared/flow-validator.ts`
   - 先落 `FlowValidationEngine`
3. `src/main/services/runtime-asset-service.ts`
   - 打开/保存/快照
4. `src/main/services/conversation-to-flow-planner.ts`
   - 自然语言转 `FlowPatch`
5. `src/main/services/flow-patch-application-engine.ts`
   - 补丁应用
6. `src/main/ipc.ts`
   - 新增 `conversationToFlow.plan` / `flowPatch.apply`
7. `src/renderer/components/OrchestrationWorkspace.tsx`
   - 只做装配
8. `src/renderer/components/FlowConversationPanel.tsx`
9. `src/renderer/components/FlowInspector.tsx`
10. `src/renderer/components/FlowNodeCard.tsx`
11. `src/renderer/hooks/useFlowDraftState.ts`
12. `tests/unit/*`
13. `tests/e2e/*`

## 8. 验收标准
1. 程序员只读本页和对应唯一性文档，能确定组件拆分、状态归属、IPC 边界和开发顺序。
2. 任一复杂交互都能定位到唯一的 hook、IPC 和 service。
3. 不存在两个组件同时持有 `flowDraft` 真源的情况。
4. 自然语言编排链路必须经过 `FlowPatchReviewPanel`，不能直接改 draft。
