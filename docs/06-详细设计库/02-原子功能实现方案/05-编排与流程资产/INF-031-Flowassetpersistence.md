# INF-031 Flow asset persistence

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 流程资产 / 持久化
- MSABC 分类：S
- 当前状态：部分完成
- 关联页面：编排页、无工程编排模式
- 共享实现基线：[编排与流程资产](README.md)

## 2. 责任与完成定义
### 2.1 服务责任
1. 保存和读取 Flow、Subflow、角色引用、连接引用、工具引用。
2. 支持工程内 Flow 与无工程草稿两条路径。
3. 提供稳定的保存、另存、导入、导出语义。

### 2.2 完成定义
1. 任何 Flow 结构变更都能持久化。
2. 节点布局、边绑定、角色绑定、工件契约全部随 Flow 一起保存。
3. 无工程编排草稿有独立存储位置。

## 3. 核心接口
1. `loadFlow(flowId, context)`
2. `saveFlow(flowDraft, context)`
3. `saveFlowAs(flowDraft, targetPath)`
4. `exportFlow(flowId, exportPath)`

## 4. 数据结构
```ts
type PersistedFlowAsset = {
  flowId: string;
  mode: 'project' | 'standalone';
  nodes: PlatformFlowNode[];
  edges: PlatformFlowEdge[];
  roleRefs: RolePackageReference[];
  connectorRefs: string[];
  toolRefs: string[];
  artifactContracts: StageContract[];
};
```

## 5. 实现要求
1. 保存必须是原子写入，避免损坏半文件。
2. 工程内和无工程模式使用不同根目录，但结构一致。
3. 另存和导出必须保留可再导入性。

## 6. 校验与阻断
1. 保存前必须通过 Flow validation engine。
2. 写入失败时保留原文件。
3. 模式不匹配时拒绝写入错误目录。

## 7. 自动测试
### 7.1 单元
1. 工程内保存
2. 无工程保存
3. 原子写入失败回滚

### 7.2 集成
1. 保存后重开恢复完整 Flow
2. 导出后重新导入恢复完整 Flow

## 8. 不允许的错误实现
1. 只保存节点，不保存边和绑定。
2. 无工程草稿仍依赖工程目录。
3. 另存和导出保存的是不同结构。

## 9. 当前审计结论
- 审计状态：部分完成
- 审计说明：Flow 持久化已有骨架，但工程/无工程双路径和全量资产保存仍未完全收口。
