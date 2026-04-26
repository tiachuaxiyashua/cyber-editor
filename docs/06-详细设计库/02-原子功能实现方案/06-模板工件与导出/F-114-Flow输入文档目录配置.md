# F-114 Flow 输入文档目录配置

## 1. 基本信息
- 类型：用户可见功能
- 所属层级：模板工件与导出 / 工件目录 / Flow 输入目录
- MSABC 分类：S
- 当前状态：未完成
- 关联页面：[编排页](../../01-UI详细设计/07-编排页.md)、[无工程编排模式](../../01-UI详细设计/10-无工程编排模式.md)
- 上游需求：`D-C1`、`D-C2`

## 2. 用户价值与完成定义
1. Flow 必须明确知道默认从哪里读文档和工件。
2. 没有输入目录定义，节点读取范围就会失控。

完成定义：
1. 用户可为 Flow 配置 `PlatformFlowAsset.pathConfig`。
2. 输入目录由 `FlowPathConfig.inputRoot` 表示，并与 `outputRoot`、`inheritProjectRoot` 一起保存。
3. 运行时所有工件读取先过 `pathConfig` 解析，再落到节点级读写绑定。

## 3. 数据模型
```json
{
  "pathConfig": {
    "inputRoot": "input",
    "outputRoot": "output",
    "inheritProjectRoot": true
  }
}
```

当前代码口径：
- 输入目录配置不再是 `inputDirectories[]`。
- 字段类型为 `FlowPathConfig`，挂载位置为 `PlatformFlowAsset.pathConfig`。
- 运行时可补充 `resolvedInputRoot`、`resolvedOutputRoot` 作为解析结果，但它们不是用户手填主字段。

## 4. 具体实现方案
### Renderer
1. `FlowInputDirectoryEditor`
2. `DirectoryRuleTable`

### Main / Service
1. `flow-io-directory-service`

## 5. 校验与阻断
1. `inputRoot` 必须是相对目录名或相对目录路径。
2. 不允许指向工程外部绝对路径。
3. `pathConfig` 缺失时由运行时补默认值，不允许写入半截对象。
4. 解析后若输入目录越界，必须在运行时阻断。

## 6. 自动测试
1. 目录保存与恢复
2. 非法路径阻断
3. 节点读取越界阻断

## 7. 用户模拟测试
1. 配置 `pathConfig.inputRoot = input`。
2. 让节点读取解析后不在 `inputRoot` 范围内的文件。
3. 系统必须阻止并提示越界。

## 8. 不允许的错误实现
1. 输入目录只是显示字段，不参与运行时解析。
2. 节点可无视目录直接任意读文件。
3. 继续使用 `inputDirectories[].label/readOnly/allowNodeOverride` 这套旧字段模型。

## 9. 当前审计结论
- 审计状态：未完成
- 审计说明：Flow 输入目录仍未成为运行时硬边界。

