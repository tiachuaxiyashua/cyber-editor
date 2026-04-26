# F-115 Flow 输出文档目录配置

## 1. 基本信息
- 类型：用户可见功能
- 所属层级：模板工件与导出 / 工件目录 / Flow 输出目录
- MSABC 分类：S
- 当前状态：未完成
- 关联页面：[编排页](../../01-UI详细设计/07-编排页.md)、[无工程编排模式](../../01-UI详细设计/10-无工程编排模式.md)

## 2. 用户价值与完成定义
1. Flow 必须明确知道默认把工件写到哪里。
2. 输出目录是阶段契约和导出映射的共同基础。

完成定义：
1. 用户可为 Flow 配置 `PlatformFlowAsset.pathConfig`。
2. 输出目录由 `FlowPathConfig.outputRoot` 表示，并与 `inputRoot`、`inheritProjectRoot` 一起保存。
3. 运行后工件写入解析后的 `outputRoot`，而不是产品硬编码目录。

## 3. 数据模型
```json
{
  "pathConfig": {
    "inputRoot": "input",
    "outputRoot": "02-solution",
    "inheritProjectRoot": true
  }
}
```

当前代码口径：
- 输出目录配置不再是 `outputDirectories[]`。
- 字段类型为 `FlowPathConfig`，挂载在 `PlatformFlowAsset.pathConfig`。
- 导出命名规则属于 `RuntimeTemplateExportMapping.fileNamePattern`，不属于 Flow 输出目录字段。

## 4. 具体实现方案
### Renderer
1. `FlowOutputDirectoryEditor`
2. `NamingRuleEditor`

### Main / Service
1. `flow-io-directory-service`
2. `artifact-catalog-service`

## 5. 校验与阻断
1. `outputRoot` 必须为相对目录名或相对目录路径。
2. 不允许写入工程外绝对路径。
3. `pathConfig` 缺失时由运行时补默认值，不允许写入半截对象。
4. 与导出目标目录重叠时给出显式警告，但导出命名规则在 `exportMapping` 中单独处理。

## 6. 自动测试
1. 输出目录保存与恢复
2. 命名规则校验
3. 运行后写盘路径校验

## 7. 用户模拟测试
1. 配置 `pathConfig.outputRoot = story`。
2. 运行一个写作节点。
3. 检查工件是否进入解析后的 `story/` 而不是默认目录。

## 8. 不允许的错误实现
1. Flow 输出目录不参与真实写盘。
2. 所有工件仍写到产品硬编码目录。
3. 继续使用 `outputDirectories[].label/allowNodeOverride/namingRule` 这套旧字段模型。

## 9. 当前审计结论
- 审计状态：未完成
- 审计说明：Flow 输出目录仍未成为工件写盘与导出的统一基础。

