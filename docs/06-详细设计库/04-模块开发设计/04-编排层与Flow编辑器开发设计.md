# 04 编排层与 Flow 编辑器开发设计

## 0. 必读补充
- [08-编排页组件Props与Hook状态设计](./08-编排页组件Props与Hook状态设计.md)
- [09-模块文件级实现顺序与持久化时机](./09-模块文件级实现顺序与持久化时机.md)

## 1. 模块目标
把编排页实现为专业 Flow 编辑器，而不是静态节点展示页。

## 2. 页面与组件树
- `OrchestrationPage`
  - `OrchestrationHeader`
  - `ContextPane`
    - 编排 Flow 目标会话
  - `flowConversationPreview` 模态框
    - Flow 草稿预览
    - Flow patch 预览
  - `AssetSidebar`
    - `FlowAssetList`
    - `RoleAssetList`
    - `ConnectorAssetList`
    - `ToolAssetList`
    - `ArtifactCatalogPanel`
  - `NodePalettePanel`
    - `NodeTypeCard`
  - `CanvasViewport`
    - `ReactFlowCanvas`
    - `NodeCard`
    - `EdgeLayer`
    - `MiniMap`
  - `InspectorPanel`
    - `NodeInspector`
    - `EdgeInspector`
    - `FlowInspector`
  - `RuntimeDrawer`

## 3. Renderer 状态
- `activeFlowId`
- `flowDraft`
- `selectedNodeId`
- `selectedEdgeId`
- `canvasViewport`
- `assetSidebarWidth`
- `inspectorWidth`
- `runtimeDrawerState`
- `flowConversationState`
- `flowConversationPreview: FlowConversationPreviewState | null`

## 3.1 Renderer hook / state 归属
- `useFlowDraftState()`
- `useCanvasViewportState()`
- `useSelectionState()`
- `useInspectorState()`
- `useRuntimeDrawerState()`
- `useFlowConversationState()`

## 4. Main / Service 职责
### 4.1 `RuntimeAssetService`
- 打开/保存/导入/导出 flow
- 快照/恢复

### 4.2 `CapabilityRuntime`
- 工具节点运行
- 子流程与运行计划

### 4.3 `FlowValidationEngine`
- 结构校验
- 契约校验
- 目录校验

### 4.4 `RolePackageLoader`
- 角色包加载与实例化

### 4.5 `ConversationFlowService`
- 把自然语言请求转换为 `FlowPlan`、初始 `PlatformFlowAsset` 草稿或 `FlowPatch`。
- 模型不可用或返回无效 JSON 时降级到 `src/shared/conversation-flow.ts` 的启发式计划/patch。
- patch 应用由 `ConversationFlowService.applyPatch()` 调用共享 `applyFlowPatch()` 生成预览；Renderer 在用户确认后负责保存。

## 4.5 建议文件落点
- `src/renderer/components/OrchestrationWorkspace.tsx`
- `src/shared/flow-validator.ts`
- `src/main/services/runtime-asset-service.ts`
- `src/main/services/capability-runtime.ts`
- `src/main/services/runtime-errors.ts`
- `src/main/services/conversation-flow-service.ts`
- `src/shared/conversation-flow.ts`
- `src/shared/types.ts`

## 5. 关键数据对象
- `FlowDraft`
- `FlowNode`
- `FlowEdge`
- `NodeBinding`
- `RuntimePlan`
- `SnapshotMeta`
- `FlowPlan`
- `FlowConversationPreviewState`
- `FlowPatch`

## 5.1 关键方法签名
### Renderer
- `addNodeFromPalette(nodeType: FlowNodeType, canvasPoint: XYPosition): void`
- `patchSelectedNode(patch: Partial<FlowNodeConfig>): void`
- `saveFlowDraft(): Promise<void>`
- `runFlow(flowId: string): Promise<void>`
- `rerunFromNode(nodeId: string): Promise<void>`
- `sendMessage(): Promise<void>`
- `applyFlowConversationPreview(): Promise<void>`
- `dismissFlowConversationPreview(): void`

### Main / Service
- `RuntimeAssetService.openFlow(flowId: string): Promise<FlowDraft>`
- `RuntimeAssetService.saveFlow(input: FlowSaveInput): Promise<FlowSaveResult>`
- `RuntimeAssetService.restoreSnapshot(snapshotId: string): Promise<FlowDraft>`
- `CapabilityRuntime.runFlow(input: FlowRunInput): Promise<RunAccepted>`
- `FlowValidationEngine.validate(input: FlowDraft): Promise<FlowValidationResult>`
- `RolePackageLoader.load(rolePackageId: string): Promise<RolePackageInstance>`
- `ConversationFlowService.planFromPrompt(input): Promise<FlowPlan>`
- `ConversationFlowService.draftFromPlan(plan, kind): PlatformFlowAsset`
- `ConversationFlowService.patchFromPrompt(input): Promise<FlowPatch>`
- `ConversationFlowService.applyPatch(flow, patch): PlatformFlowAsset`

## 5.2 文件级实现分解
- `src/renderer/components/OrchestrationWorkspace.tsx`
  - 编排页总装配、面板切换、画布布局。
- `src/renderer/components/FlowNodeCard.tsx`
  - 节点卡片、对象级快捷按钮、状态提示。
- `src/renderer/components/FlowInspector.tsx`
  - 节点、边、Flow 级 Inspector。
- `src/renderer/components/RuntimeDrawer.tsx`
  - 设计态/运行态切换后的运行抽屉。
- `src/renderer/App.tsx`
  - 绑定 `orchestration-flow` 会话目标、生成 `flowConversationPreview`、应用/取消预览。
- `src/main/ipc/register-settings-session-ai-ipc.ts`
  - `conversation-flow:*`、`workflow:*`、`ai:*` 通道。
- `src/main/ipc/register-runtime-platform-ipc.ts`
  - `runtime:*`、`platform:*` 通道。
- `src/main/services/runtime-asset-service.ts`
  - Flow 草稿、快照、恢复、子流程切换。
- `src/main/services/capability-runtime.ts`
  - 节点执行计划、并行/循环/子流程运行。
- `src/main/services/role-package-loader.ts`
  - 角色包目录读取和实例化。

## 6. 核心交互实现
### 6.1 拖拽节点
1. 从 `NodeTypeCard` 拖出
2. 计算画布坐标
3. 追加到 `flowDraft.nodes`
4. 设为选中
5. `dirty=true`

### 6.2 Inspector 回写
1. 目标节点 patch
2. 局部校验
3. 更新节点状态
4. 若影响下游则标 stale

### 6.3 子流程打开
1. 保存父视口
2. 切换到子流程 draft
3. 返回时恢复

## 7. 运行态与设计态隔离
- 设计态：
  - 编辑节点、边、目录、契约
- 运行态：
  - 显示 run 状态、节点状态、日志、变量
- 运行态不得改写未保存 draft 结构

## 8. 持久化
- `flowDraft`：项目目录或草稿目录
- 节点位置：属于 `flowDraft.nodes.position`
- 面板宽度和视口：用户偏好或 flow ui metadata
- 快照：`snapshots/`

## 8.1 Flow 保存流程
1. Renderer 只维护内存中的 `flowDraft`。
2. 保存时先做结构、契约、目录校验。
3. 通过后统一写入：
   - `flows/<flowId>/flow.json`
   - `flows/<flowId>/ui.json`
   - `flows/<flowId>/contracts/`
4. 保存失败时，不重置用户当前布局和节点位置，只更新错误状态。

## 8.2 自然语言编排流程
1. Renderer 收集用户输入与当前 `flowDraft` 摘要。
2. 若当前 Flow 是 bootstrap minimal flow，调用 `conversation-flow:draft` 生成 `FlowPlan` 和草稿。
3. 若当前已有实质 Flow，调用 `conversation-flow:patch` 生成 `FlowPatch`，再调用 `conversation-flow:apply-patch` 生成预览 Flow。
4. Renderer 打开 `flowConversationPreview` 模态框。
5. 用户确认后，Renderer 调用 `saveFlow()` 或 `saveDraftFlow()` 保存预览结果。
6. 用户取消时只清空预览，不改写当前 Flow。

## 9. 错误处理
- 结构无效：阻止保存/运行
- 目录缺失：阻止运行
- 子流程引用丢失：阻止进入或运行
- 并行冲突：运行前阻断

## 10. 开发顺序
1. FlowDraft + 持久化
2. 节点拖拽/连线
3. Inspector 回写
4. 子流程进入/返回
5. 角色包绑定
6. 并行/循环
7. 局部重跑/快照
8. 自然语言编排与补丁审查

## 11. 测试点
- 自动化：
  - 拖拽节点
  - 连线
  - Inspector 配置
  - 紧凑宽度不崩
- 用户模拟：
  - 位置不重置
  - 子流程可直接进入
  - 右键与对象级操作都可用

## 12. 必读约束
- [23-编排层细化状态机](../03-代码契约与唯一性/23-编排层细化状态机.md)
- [28-FlowDraft状态机](../03-代码契约与唯一性/28-FlowDraft状态机.md)
- [29-节点运行状态机](../03-代码契约与唯一性/29-节点运行状态机.md)
- [31-并行分支通信冲突规则](../03-代码契约与唯一性/31-并行分支通信冲突规则.md)
- [32-局部重跑规则](../03-代码契约与唯一性/32-局部重跑规则.md)
- [33-快照恢复冲突规则](../03-代码契约与唯一性/33-快照恢复冲突规则.md)
- [36-编排层详细时序图](../03-代码契约与唯一性/36-编排层详细时序图.md)

