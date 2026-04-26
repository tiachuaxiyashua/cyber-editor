# INF-059 Template metadata / trust resolver

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 模板体系 / 元数据
- MSABC 分类：A
- 当前状态：未完成
- 关联页面：内部能力，无独立页面
- 共享实现基线：[平台入口与模板](README.md)

## 2. 责任与完成定义
### 2.1 服务责任
1. 解析模板 manifest。
2. 计算来源、版本、兼容性、信任状态、健康状态。
3. 将这些结果统一返回给欢迎页和模板中心。

### 2.2 完成定义
1. 同一模板在所有页面显示同一份元数据。
2. 兼容性和信任状态规则只定义一处。
3. 结果可直接驱动 UI 的禁用、警告和修复动作。

## 3. 输入与输出
### 3.1 输入
```json
{
  "templateManifest": {
    "id": "software-factory",
    "version": "1.4.0",
    "minAppVersion": "0.2.0",
    "source": "builtin"
  },
  "appVersion": "0.1.0"
}
```

### 3.2 输出
```json
{
  "metadata": {
    "source": "builtin",
    "version": "1.4.0",
    "trustLevel": "trusted",
    "health": "healthy",
    "compatibility": "blocked"
  }
}
```

## 4. 上游与下游
- 上游：
  - Template registry
  - Template scaffold and save service
- 下游：
  - 欢迎页最近模板
  - 模板中心列表
  - 模板详情区

## 5. 核心规则
1. 来源枚举固定：
   - `builtin`
   - `local-imported`
   - `remote-downloaded`
2. 信任状态枚举固定：
   - `trusted`
   - `unverified`
   - `blocked`
3. 健康状态枚举固定：
   - `healthy`
   - `broken`
   - `incompatible`
4. 不兼容模板必须被视为阻断态。

## 6. 实现要求
1. 所有比较逻辑必须在服务层完成，Renderer 不得自行重算。
2. 对 manifest 缺字段情况必须给出降级规则。
3. 输出结构必须包含 UI 所需的完整枚举，不让页面自行拼推理。

## 7. 自动测试
### 7.1 单元
1. 版本比较
2. 信任状态计算
3. 健康状态计算
4. 缺字段降级

### 7.2 集成
1. 欢迎页与模板中心读到同一模板时，元数据一致。

## 8. 不允许的错误实现
1. 欢迎页和模板中心各自维护一套来源/信任判断。
2. 缺字段模板默认显示为正常。
3. 状态枚举不固定，导致不同页面用不同文案。

## 9. 当前审计结论
- 审计状态：未完成
- 审计说明：模板元数据解析仍未收敛为单一服务来源，欢迎页和模板中心的一致性仍有风险。
