# INF-052 Flow IO directory service

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 工件模型 / Flow 目录
- MSABC 分类：S
- 当前状态：未完成

## 2. 责任
1. 解析 Flow 输入目录和输出目录。
2. 处理节点覆盖优先级。
3. 提供合法读写路径判定。

## 3. 核心接口
```ts
resolveInputPath(flowConfig, nodeOverride, relativePath): ResolveResult
resolveOutputPath(flowConfig, nodeOverride, artifactName): ResolveResult
```

## 4. 必做逻辑
1. 目录只允许相对路径。
2. 节点覆盖不得突破 Flow 目录边界，除非显式允许。
3. 命名规则冲突时返回校验错误。

## 5. 自动测试
1. 输入越界
2. 输出命名规则
3. 节点覆盖优先级

## 6. 当前审计结论
- 审计状态：未完成
- 审计说明：Flow 目录规则仍未成为读写路径的统一判断层。
