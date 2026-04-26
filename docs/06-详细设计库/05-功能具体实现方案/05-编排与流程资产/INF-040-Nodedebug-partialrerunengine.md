# INF-040 Node debug / partial rerun engine

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 运行与调试 / 局部运行
- MSABC 分类：S
- 当前状态：未完成

## 2. 责任
1. 执行单节点调试。
2. 计算“从此继续”影响范围。
3. 处理局部重跑与结果失效。

## 3. 核心接口
```ts
runNode(nodeId, runContext): Promise<NodeRunResult>
resumeFrom(nodeId, runId): Promise<ResumePlan>
partialRerun(nodeIds, runId): Promise<RerunResult>
```

## 4. 必做逻辑
1. 单节点运行前校验其输入是否满足。
2. 从此继续前计算：
   - 可复用上游结果
   - 需要清空的结果
   - 将受影响的下游节点
3. 局部重跑后把受影响节点标记为重新计算。

## 5. 自动测试
1. 单节点运行
2. resume plan 计算
3. 下游失效传播

## 6. 当前审计结论
- 审计状态：未完成
- 审计说明：节点调试和局部重跑仍缺统一运行引擎。
