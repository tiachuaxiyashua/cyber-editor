# INF-053 Role package loader

## 1. 基本信息
- 类型：内部功能
- 所属层级：连接层 / 角色包 / 加载
- MSABC 分类：S
- 当前状态：未完成
- 关联页面：内部能力，无独立页面
- 共享实现基线：[编排与流程资产](README.md)

## 2. 责任与完成定义
### 2.1 服务责任
1. 校验角色包目录结构。
2. 读取并解析角色包文件。
3. 合并默认设定、Flow 覆盖和节点覆盖。
4. 生成运行时角色实例快照。

### 2.2 完成定义
1. 能从角色目录中稳定读取 `role.json`、`IDENTITY.md`、`SOUL.md`、`AGENTS.md`、`USER.md`、`Skills/`、`MEMORY/`。
2. 能输出最终生效的：
   - 身份摘要
   - 行为原则
   - 默认技能
   - 模型策略
   - 权限边界
3. 缺失关键文件时输出结构化损坏错误。

## 3. 输入与输出
### 3.1 输入
```json
{
  "packagePath": ".roles/red-reviewer",
  "flowOverrides": {},
  "nodeOverrides": {}
}
```

### 3.2 输出
```json
{
  "roleInstance": {
    "roleId": "red-reviewer",
    "effectiveSkills": ["requirements-review"],
    "effectiveModelPolicy": "prefer-cloud-with-local-fallback",
    "effectiveRestrictions": ["deny-delete-project"]
  },
  "sourceMap": {
    "skills": "package+flow+node"
  }
}
```

## 4. 上游与下游
- 上游：
  - Flow 资产持久化
  - 节点绑定
- 下游：
  - RuntimeService
  - 节点执行器
  - 角色详情摘要面板

## 5. 核心接口
```ts
type LoadRolePackageInput = {
  packagePath: string;
  flowOverrides?: RoleOverrides;
  nodeOverrides?: RoleOverrides;
};

type LoadRolePackageResult = {
  roleInstance: RuntimeRoleInstance;
  sourceMap: Record<string, string>;
};
```

## 6. 实现要求
1. 加载顺序固定，不能让 Flow 覆盖和节点覆盖抢到前面。
2. 每个被读取文件都要记录来源，供 UI 展示“最终生效来源”。
3. `Skills/` 中缺失某个技能时，应产出结构化告警，不得静默忽略。
4. 不得在 Loader 中定义最终工件输出格式。

## 7. 异常模型
1. `ROLE_PACKAGE_NOT_FOUND`
2. `ROLE_PACKAGE_BROKEN`
3. `ROLE_SKILL_MISSING`
4. `ROLE_OVERRIDE_INVALID`

## 8. 自动测试
### 8.1 单元
1. 目录完整性校验
2. 加载顺序与覆盖顺序
3. 损坏角色包错误映射
4. `sourceMap` 生成

### 8.2 集成
1. 角色详情页读取 Loader 结果
2. RuntimeService 消费 Loader 结果

## 9. 不允许的错误实现
1. Loader 只返回一个 prompt 字符串。
2. 缺文件时静默降级而不是返回损坏态。
3. Flow/节点覆盖直接覆写角色包，导致来源不可追踪。

## 10. 当前审计结论
- 审计状态：未完成
- 审计说明：角色包加载器仍未形成稳定的目录校验、覆盖合并和来源追踪主链路。
