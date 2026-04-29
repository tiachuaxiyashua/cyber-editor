# 03 架构实现

本目录定义当前代码如何分层、owner 如何拆分、AI 编排运行时如何闭环、数据和安全如何约束，以及哪些文件已经成为真实热点。

## 当前代码分层快照

1. Electron 壳层：`src/main/main.ts` 创建主窗口、文档子窗口、菜单和窗口上下文；`window-security.ts` 负责外链与窗口安全。
2. IPC 边界：`src/main/preload.ts` 暴露 `window.api`，`src/main/ipc/*.ts` 按项目文档、设置会话 AI、资源、运行时平台和最近工程拆分注册。
3. 主进程服务：`src/main/services/` 保存工程、模板、平台资产、运行时、知识索引、资源治理、导出、证据和日志等 owner。
4. 共享契约：`src/shared/` 保存类型、Flow 校验、运行时模板、工件校验、Provider、技能、角色包和资源路径守卫。
5. Renderer 页面：`src/renderer/App.tsx` 是聚合壳，复杂页面拆到 `components/`，领域状态拆到 `hooks/useAppDomainStates.ts`。
6. 测试证据：`tests/unit/` 覆盖服务与契约，`tests/e2e/` 覆盖 Electron 用户路径，`tests/contracts/` 固定 UI 与交付契约。

## 文件

1. `01-系统架构与分层Owner.md`
2. `02-AI编排运行时.md`
3. `03-数据契约状态机与安全.md`
4. `04-代码重构执行计划.md`
5. `05-代码目录与Owner映射.md`

## 使用方式

1. 先读 `01` 到 `03`，确认系统边界、运行时和契约。
2. 再读 `05`，把文档口径和当前 `src/` 目录逐项对齐。
3. 最后读 `04`，确认哪些位置仍然需要收口或拆分。

## 补全文档时的代码依据

1. 用户入口以 `preload.ts` 暴露的方法和 `App.tsx` 实际调用为准。
2. 数据契约以 `src/shared/types.ts`、`orchestration-contracts.ts`、`runtime-template.ts` 和 `template-package.ts` 为准。
3. 文件落盘以 `ProjectService`、`PlatformService`、`RuntimeAssetService`、`SettingsStore` 和 `EvidenceStoreService` 为准。
4. 运行态语义以 `RuntimeService`、`KnowledgeIndexService`、`HybridRetrievalService`、`ProvenanceService` 和 `RuntimeBudgetGovernor` 为准。
5. 任何“已完成”判断必须能指向代码 owner、用户路径和测试证据；打包态证据缺失时只能写“部分完成”。
