# F-093 导出 OpenSpec 文件夹

## 1. 基本信息
- 类型：用户可见功能
- 所属层级：模板工件与导出 / 导出 / 规范文档
- MSABC 分类：S
- 当前状态：已完成
- 关联页面：[主工作台](../../01-UI详细设计/03-主工作台.md)、[流程面板](../../01-UI详细设计/06-流程面板.md)
- 上游需求：`D-A3`

## 2. 用户价值与完成定义
1. 软件工厂模板需要把结果导出为标准 OpenSpec 目录。
2. 导出的目录必须可被 `openspec validate` 验证。

## 3. 具体实现方案
### 3.1 Renderer
1. 导出面板提供 OpenSpec 选项。

### 3.2 Main / Service
1. `openspec-exporter`
2. `delivery-export-service`

## 4. 导出规则
1. 输出目录固定包含：
   - `changes/<change>/proposal.md`
   - `changes/<change>/design.md`
   - `changes/<change>/tasks.md`
   - `specs/`
2. 输出内容由 Flow 当前导出映射和模板闭环定义决定。

## 5. 自动测试
1. 导出 OpenSpec 文件夹。
2. 运行 `openspec validate`。

## 6. 用户模拟测试
1. 完成软件工厂模板最小闭环。
2. 导出 OpenSpec。
3. 验证目录结构完整。

## 7. 不允许的错误实现
1. 只导出零散 Markdown，不形成标准目录。
2. 导出目录无法通过 OpenSpec 校验。

## 8. 当前审计结论
- 审计状态：已完成
- 审计说明：OpenSpec 导出主链路已在代码中可用，但仍受软件工厂模板闭环完整度约束。

