# F-127 通过对话增量修改现有 Flow

## 1. 功能定义
用户在已有 Flow 的前提下，可通过自然语言要求 AI 添加、删除、替换节点和边，或调整工件、角色和目录绑定。

- MSABC 分类：S
- 当前状态：部分完成

## 1.1 代码反哺状态
- 已实现：`ConversationFlowService.patchFromPrompt()` 可调用模型生成 patch，失败或 mock provider 时降级到 `buildFlowPatchFromPrompt()`。
- 已实现：`src/shared/conversation-flow.ts` 支持 `rename_flow`、`add_node`、`update_node`、`delete_node`，并由 `applyFlowPatch()` 生成预览 Flow。
- 已实现：`App.tsx` 先调用 `conversation-flow:patch` 和 `conversation-flow:apply-patch` 得到预览，只有用户点击“应用修改”才写入 `saveFlow()` 或 `saveDraftFlow()`。
- 已有证据：`tests/unit/conversation-flow-service.test.ts` 验证 patch 生成和应用；`tests/e2e/real-user-deepseek-solo-company.spec.ts` 验证真实编排聊天生成“GitHub 证据刷新”节点、预览并应用。
- 仍未完成：当前 UI 展示 patch operations，但不支持逐项勾选；当前 operation 命名为 `add_node/update_node/delete_node/rename_flow`，不是旧文档中的 `addNode/addEdge/patchNode`；运行态结构补丁阻断还缺专门证据。

## 2. 典型指令
- “在设计评审后增加红蓝审查子流程”
- “把 QA 前的导出节点改成并行分支”
- “给需求澄清节点绑定 clarifier 角色包”

## 3. 期望效果
- AI 返回结构化补丁，而不是直接改写 `flowDraft`
- 用户能看到补丁清单：
  - 新增节点
  - 删除节点
  - 新增边
  - 修改节点字段
  - 修改目录/契约

## 4. 方法级 IO
### Shared
`FlowPatch`
```json
{
  "operations": [
    { "op": "add_node", "afterNodeId": "design-review", "node": {} },
    { "op": "update_node", "nodeId": "qa", "patch": {} },
    { "op": "delete_node", "nodeId": "obsolete-step" }
  ]
}
```

### Main
- `ConversationFlowService.patchFromPrompt(input): Promise<FlowPatch>`
- `ConversationFlowService.applyPatch(flow, patch): PlatformFlowAsset`

## 5. 动作时序
1. 用户输入修改要求。
2. `ConversationFlowService` 根据当前 `flowDraft` 生成 `FlowPatch`。
3. Renderer 展示补丁清单。
4. 用户可取消整次修改，逐项勾选仍是目标能力。
5. 点击 `应用` 后，Renderer 保存 `conversation-flow:apply-patch` 预览结果。
6. Main 负责生成和应用 patch，Renderer 负责保存新 Flow。

## 6. 校验与阻断
- 不能删掉唯一的开始/结束节点。
- 不能产生悬空边。
- 不能在运行态应用结构补丁。

## 7. 错误处理
- 补丁和当前 `flowDraft` 冲突：提示重新生成。
- 用户选择部分应用后若校验失败：整体拒绝并回到补丁预览。

## 8. 自动化测试
- 现有 Flow 上发送增量修改请求。
- 返回补丁预览。
- 取消后 `flowDraft` 不变。
- 应用后节点/边数量变化符合补丁。

## 显式测试 Oracle
### 最小输入样例
1. 当前已有 Flow。
2. 用户输入：`在设计评审后增加红蓝审查子流程`。

### 主动作
1. `ConversationFlowService` 根据当前 `flowDraft` 生成 `FlowPatch`。
2. Renderer 展示补丁清单。
3. 用户可取消整次修改；逐项勾选仍是目标能力。
4. 点击 `应用` 后保存 `conversation-flow:apply-patch` 预览结果。

### 成功判定
1. AI 返回结构化补丁，而不是直接改写 `flowDraft`。
2. 补丁清单展示新增、删除、修改节点或重命名流程等结构化操作。
3. 取消后 `flowDraft` 不变。
4. 应用后节点和边变化符合补丁。

### 文件与状态判定
1. Renderer 写入 `flowConversationPreview.mode = "patch"`；`FlowPatch` 本身不包含 `mode` 字段。
2. `FlowPatch.operations` 当前至少支持 `rename_flow`、`add_node`、`update_node`、`delete_node`。
3. Main 提供 `ConversationFlowService.patchFromPrompt(input): Promise<FlowPatch>` 与 `ConversationFlowService.applyPatch(flow, patch): PlatformFlowAsset`。
4. Renderer 先显示预览，只有用户点击“应用修改”才保存新 Flow。
5. 若要求完整完成，还必须补齐逐项勾选和运行态结构补丁阻断证据。

### 错误与边界判定
- 不能删掉唯一的开始/结束节点。
- 不能产生悬空边。
- 不能在运行态应用结构补丁。

## Code Uniqueness Links
- [20-编排层运行语义表](../../03-代码契约与唯一性/20-编排层运行语义表.md)
- [31-并行分支通信冲突规则](../../03-代码契约与唯一性/31-并行分支通信冲突规则.md)
- [36-编排层详细时序图](../../03-代码契约与唯一性/36-编排层详细时序图.md)

