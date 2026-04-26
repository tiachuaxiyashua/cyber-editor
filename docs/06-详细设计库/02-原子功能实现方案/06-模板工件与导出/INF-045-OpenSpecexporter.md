# INF-045 OpenSpec exporter

## 1. 基本信息
- 类型：内部功能
- 所属层级：能力层 / 导出能力 / OpenSpec
- MSABC 分类：S
- 当前状态：已完成
- 关联页面：导出面板、流程面板
- 共享实现基线：[模板工件与导出](README.md)

## 2. 责任与完成定义
1. 根据软件工厂模板的导出映射生成标准 OpenSpec 目录。
2. 输出可被 `openspec validate` 校验。

## 3. 核心接口
1. `exportOpenSpec(flowId, outputPath, changeName)`

## 4. 自动测试
1. 生成标准目录树。
2. 调用 `openspec validate` 校验。

## 5. 不允许的错误实现
1. 只生成部分文件。
2. 输出目录结构不标准。

## 6. 当前审计结论
- 审计状态：已完成
- 审计说明：OpenSpec 导出器已可用，但仍依赖软件工厂模板的闭环完整性。
