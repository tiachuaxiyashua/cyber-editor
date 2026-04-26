# INF-056 Context packer and token-budget planner

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 知识底座 / 上下文
- MSABC 分类：S
- 当前状态：未完成

## 2. 责任
1. 将候选命中对象打包成可审查上下文包。
2. 控制 token 预算。
3. 区分主命中、扩展命中和被排除项。

## 3. 核心接口
```ts
buildContextPack(taskType, candidates, constraints): ContextPack
```

## 4. 输出结构
1. `primaryItems`
2. `expandedItems`
3. `excludedItems`
4. `budget`
5. `provenance`

## 5. 自动测试
1. 预算裁剪
2. 用户固定项优先
3. 排除项不回流

## 6. 当前审计结论
- 审计状态：未完成
- 审计说明：上下文包仍未形成统一、可审查、可复用的运行输入。
