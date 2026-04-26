# INF-036 Export mapping service

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 导出规则 / 映射
- MSABC 分类：A
- 当前状态：未完成

## 2. 责任
1. 存储并解析导出映射。
2. 将工件集合转换成导出计划。
3. 校验导出前置条件。

## 3. 核心接口
```ts
validateExportMapping(mapping, artifactCatalog): ValidationResult
buildExportPlan(target, mapping, runtimeState): ExportPlan
```

## 4. 必做逻辑
1. 区分正式交付工件与中间工件。
2. 生成目标目录与目标文件名。
3. OpenSpec 导出必须校验必需工件集合。

## 5. 自动测试
1. 空映射
2. 缺工件
3. OpenSpec 必需集合

## 6. 当前审计结论
- 审计状态：未完成
- 审计说明：导出映射仍未统一接入所有导出器。
