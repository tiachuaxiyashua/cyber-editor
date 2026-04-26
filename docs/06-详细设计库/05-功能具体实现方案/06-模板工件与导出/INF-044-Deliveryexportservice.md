# INF-044 Delivery export service

## 1. 基本信息
- 类型：内部功能
- 所属层级：能力层 / 导出能力 / 通用导出
- MSABC 分类：S
- 当前状态：已完成
- 关联页面：导出面板、流程面板
- 共享实现基线：[模板工件与导出](README.md)

## 2. 责任与完成定义
1. 统一执行 `md/txt/pdf` 等通用文档导出。
2. 读取 Export Mapping 和工件目录。
3. 生成导出清单和目标目录结构。

## 3. 核心接口
1. `exportDeliveryPackage(flowId, mapping, outputPath)`

## 4. 自动测试
1. 导出文档包。
2. 校验清单与文件存在。

## 5. 不允许的错误实现
1. 导出服务自己猜测目录结构。
2. 不读 Export Mapping 直接扫文件。

## 6. 当前审计结论
- 审计状态：已完成
- 审计说明：通用导出器主链路已存在，但其唯一性仍依赖 Export Mapping 和工件目录的完整定义。
