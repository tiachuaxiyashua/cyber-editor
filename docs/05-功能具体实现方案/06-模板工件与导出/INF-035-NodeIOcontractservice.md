# INF-035 Node IO contract service

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 工件模型 / 契约
- MSABC 分类：S
- 当前状态：未完成
- 关联页面：内部能力，无独立页面
- 共享实现基线：[模板工件与导出](README.md)

## 2. 责任与完成定义
### 2.1 服务责任
1. 定义节点输入输出契约的统一模型。
2. 管理三类通道：
   - 工件
   - 消息
   - 控制信号
3. 供 Flow 校验、运行时执行器、导出映射共享使用。

### 2.2 完成定义
1. 所有可运行节点都能声明统一 Node IO 契约。
2. 运行前能校验契约完整性。
3. 运行时能根据契约生成真实的读写通道。
4. 契约变更能反馈到画布和 Inspector。

## 3. 核心数据结构
```ts
type NodeIOContract = {
  inputArtifacts: ArtifactRef[];
  outputArtifacts: ArtifactRef[];
  inputMessages: MessageRef[];
  outputMessages: MessageRef[];
  outputSignals: SignalRef[];
};
```

## 4. 上游与下游
- 上游：
  - Node Inspector
  - Artifact catalog service
- 下游：
  - Loop runtime
  - Parallel runtime
  - Export mapping service
  - RuntimeService

## 5. 核心接口
1. `parseNodeIOContract(nodeDraft)`
2. `validateNodeIOContract(contract, artifactCatalog, schemaCatalog)`
3. `resolveEdgeBindings(flow, fromNodeId, toNodeId)`
4. `materializeRuntimeChannels(runId, nodeId)`

## 6. 实现要求
1. 工件、消息、信号必须统一建模，不能分散在多个 ad-hoc 字段中。
2. 节点未声明输出工件时，运行时不得私自落盘。
3. 未声明信号不得被发送。
4. 角色包不得替代 Node IO 契约。

## 7. 校验与阻断
1. 缺失输入工件时返回阻断错误。
2. schema 不匹配时返回校验错误。
3. 未声明通道时拒绝执行对应读写。

## 8. 自动测试
### 8.1 单元
1. 契约解析
2. schema 校验
3. 边绑定解析
4. 运行态通道物化

### 8.2 集成
1. 红蓝裁判 Flow
2. 并行分支汇合 Flow
3. 条件/循环控制信号 Flow

## 9. 不允许的错误实现
1. 只支持工件，不支持消息和信号。
2. 运行时无视 Node IO 契约。
3. 契约只在 UI 里存在，不进入运行时。

## 10. 当前审计结论
- 审计状态：未完成
- 审计说明：当前仍缺把工件、消息与信号统一纳入主链路的 Node IO 契约层。
