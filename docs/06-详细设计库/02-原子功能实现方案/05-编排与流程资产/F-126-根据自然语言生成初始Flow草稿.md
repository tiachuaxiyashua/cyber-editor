# F-126 根据自然语言生成初始 Flow 草稿

## 1. 功能定义
当当前没有活跃 Flow 时，AI 根据自然语言生成一份新的 `FlowDraft` 草稿，并在用户确认后进入画布。

- MSABC 分类：S
- 当前状态：部分完成

## 1.1 代码反哺状态
- 已实现：`src/shared/conversation-flow.ts` 的 `buildFlowPlanFromPrompt()` 会把自然语言拆成步骤，`buildFlowDraftFromPlan()` 会生成包含 `start`、中间节点、`end` 和顺序边的 `PlatformFlowAsset`。
- 已实现：`ConversationFlowService.planFromPrompt()` 在没有可用模型或模型返回无效 JSON 时降级到启发式计划；有可用模型时要求返回结构化 JSON。
- 已实现：`register-settings-session-ai-ipc.ts` 暴露 `conversation-flow:plan` 与 `conversation-flow:draft`；`App.tsx` 在 bootstrap 最小 Flow 上先生成草稿预览，用户应用后才保存。
- 仍未完成：当前草稿对象尚未输出“建议角色列表、建议工件目录与输入/输出目录”的完整合同，也缺少专门覆盖“无工程空画布自然语言生成新 Flow”的 e2e 证据。

## 2. 前置条件
- 当前无活跃 Flow，或用户显式选择“新建 Flow”。
- 已打开 AI 编排对话入口。

## 3. 输入
- 用户自然语言描述
- 当前模板上下文（可选）
- 当前项目/无工程模式上下文

## 4. 输出
- `flowConversationPreview.mode = "draft"`
- `FlowPlan`
- `PlatformFlowAsset`
- 节点列表
- 边列表
- 建议角色列表（目标合同，当前代码未完整输出）
- 建议工件目录与输入/输出目录（目标合同，当前代码未完整输出）

## 5. 方法级 IO
### Main
- `ConversationFlowService.planFromPrompt(input): Promise<FlowPlan>`
- `ConversationFlowService.draftFromPlan(plan, kind): PlatformFlowAsset`

输入示例：
```json
{
  "message": "做一个视频脚本流程，先拆主题，再写口播稿，再做镜头清单",
  "templateId": "video-script-lab"
}
```

输出示例：
```json
{
  "mode": "draft",
  "draft": {
    "name": "视频脚本主流程",
    "nodes": [],
    "edges": []
  }
}
```

## 6. 动作时序
1. Renderer 发送自然语言请求。
2. `ConversationFlowService` 生成 `FlowPlan` 与 `PlatformFlowAsset` 草稿。
3. Renderer 展示流程摘要和缩略节点图。
4. 用户点击 `应用为新 Flow`。
5. Renderer 把草稿写入 `flowDraft` 状态并切到设计态。

## 7. 校验
- 生成结果必须至少包含：
  - 1 个 `start`
  - 1 个 `end`
  - 至少 1 个中间节点
- 节点坐标不能为空。
- 所有边都必须指向存在的节点。

## 8. 错误处理
- 若 AI 没有生成可用节点：提示“未生成可用 Flow 草稿”，允许重试。
- 若校验失败：显示失败原因，不应用。

## 9. 测试 Oracle
- 输入给定文案后，返回的草稿不是空对象。
- 点击确认后，画布出现对应节点和边。
- 不确认时，画布保持原状态。

## 显式测试 Oracle
### 最小输入样例
- 当前无活跃 Flow，或用户显式选择“新建 Flow”。
- 已打开 AI 编排对话入口。
- 用户输入：`做一个视频脚本流程，先拆主题，再写口播稿，再做镜头清单`。

### 主动作
1. Renderer 发送自然语言请求。
2. `ConversationFlowService` 生成 `FlowPlan` 与 `PlatformFlowAsset` 草稿。
3. Renderer 展示流程摘要和缩略节点图。
4. 用户点击 `应用为新 Flow`。

### 成功判定
1. 返回的草稿不是空对象。
2. 草稿至少包含 1 个 `start`、1 个 `end` 和 1 个中间节点。
3. 点击确认后，画布出现对应节点和边。
4. 不确认时，画布保持原状态。

### 文件与状态判定
1. Main 提供 `ConversationFlowService.planFromPrompt(input): Promise<FlowPlan>` 和 `ConversationFlowService.draftFromPlan(plan, kind): PlatformFlowAsset`。
2. Renderer 写入 `flowConversationPreview.mode = "draft"`，并显示 `plan` 与 `draft`。
3. `draft` 必须包含节点、边、坐标和 `start/end` 边界节点。
4. 用户确认后，Renderer 通过 `saveFlow()` 或 `saveDraftFlow()` 写入当前 Flow；不确认时原 Flow 不变。
5. 若要求完整完成，本条还必须补齐建议角色、工件目录和输入/输出目录合同。

### 错误与边界判定
- 若 AI 没有生成可用节点：提示“未生成可用 Flow 草稿”，允许重试。
- 若校验失败：显示失败原因，不应用。

## Code Uniqueness Links
- [12-关键Schema示例](../../03-代码契约与唯一性/12-关键Schema示例.md)
- [28-FlowDraft状态机](../../03-代码契约与唯一性/28-FlowDraft状态机.md)
- [36-编排层详细时序图](../../03-代码契约与唯一性/36-编排层详细时序图.md)

