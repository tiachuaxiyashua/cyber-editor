# 12 AI 会话与阶段控制组件 Props 与 Hook 状态设计

## 1. 目标
把会话栏、流程面板、阶段 guard、审查子流程和运行事件的实现边界压到组件/状态/方法级。

## 2. 页面组件树
- `ConversationSidebar`
  - `ConversationList`
  - `ConversationThread`
  - `ConversationComposer`
  - `ContextPackPanel`
- `ProcessPanel`
  - `StageTimeline`
  - `GuardStatusPanel`
  - `RunControls`
  - `ReviewSummaryPanel`
  - `RunHistoryPanel`

## 3. Props 契约
### `ConversationThread`
- 输入
  - `messages: ConversationMessageViewModel[]`
  - `runState: RuntimeRunStateViewModel`
  - `activeRoleIds: string[]`
  - `appliedSkills: string[]`
- 输出事件
  - `onSendMessage(input)`
  - `onRetry(runId)`
  - `onOpenCitation(entryId)`

### `ProcessPanel`
- 输入
  - `stageState: StageProgressViewModel`
  - `guardStatus: StageGuardStatusViewModel`
  - `runHistory: RuntimeEventViewModel[]`
  - `reviewSummary?: ReviewSummaryViewModel`
- 输出事件
  - `onGenerateDraft()`
  - `onConfirmStage()`
  - `onRunReview()`
  - `onOpenRunDetail(runId)`

## 4. Hook 与状态归属
- `useConversationState`
  - `activeConversationId`
  - `draftMessage`
  - `pendingRunId`
- `useProcessPanelState`
  - `expandedRunId`
  - `guardDetailsOpen`
  - `reviewSummaryOpen`
- `useRuntimeEventBuffer`
  - 仅负责事件顺序和去重，不负责持久化

## 5. 方法级 I/O
- Renderer
  - `sendConversationMessage(input): Promise<void>`
  - `generateStageDraft(): Promise<void>`
  - `confirmCurrentStage(): Promise<void>`
  - `runReviewSubflow(): Promise<void>`
- Main / Service
  - `RuntimeService.submitConversationMessage(input): Promise<RunAccepted>`
  - `RuntimeService.generateStageDraft(input): Promise<RunAccepted>`
  - `RuntimeService.confirmStage(input): Promise<StageConfirmResult>`
  - `RuntimeService.runReview(input): Promise<RunAccepted>`
  - `StageGuardEngine.evaluate(input): Promise<StageGuardStatus>`

## 6. 持久化
- 会话消息、运行事件、阶段确认记录写工程运行目录
- `guardStatus` 允许缓存，但最终以主进程重新计算结果为准

## 7. 开发顺序
1. 运行时类型与事件模型
2. guard engine
3. runtime service
4. conversation IPC
5. process panel IPC
6. sidebar renderer
7. process panel renderer
8. Ollama/云模型回归

