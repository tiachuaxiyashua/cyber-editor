# 02 产品设计

本目录定义页面、交互和编排工作台方案。这里的设计必须能直接约束 UI 实现和用户行为测试。

## 设计边界

产品设计只描述用户看见的页面结构、入口层级、主次动作和交互裁决，不承载服务 owner、IPC、持久化字段或测试证据。实现细节必须继续落到 `03-架构实现/` 和 `06-详细设计库/`，验收口径落到 `04-测试验收/`。

当前代码中的主要页面入口为：

1. 欢迎页与模板中心：由 `src/renderer/App.tsx`、`TemplateCenterPage`、`ProjectTemplateDialog`、`SaveTemplateDialog` 承接。
2. 主工作台：由 `App.tsx`、`FileTree`、`DocumentTabs`、`MarkdownContent`、`TableArtifactView` 和右侧 `ContextPane` 承接。
3. 编排工作台：由 `OrchestrationWorkspace` 与 `src/shared/orchestration-contracts.ts`、`flow-validator.ts` 承接。
4. 资源、规则、设置和思路地图：分别由 `ResourceCenterPage`、`RulesWorkspacePage`、`SettingsWorkspacePage`、`ThinkingChainPage` 承接。

## 文件阅读顺序

1. `01-页面与交互PRD.md`
2. `02-编排工作台PRD.md`
3. `03-关键交互裁决.md`

## 维护规则

1. 页面主路径发生变化时，先更新本目录，再更新详细 UI 设计和测试矩阵。
2. 如果代码已经出现用户可见入口但本目录没有对应交互裁决，必须补设计文档，不能只依赖组件名。
3. 如果本目录与代码冲突，优先按 `docs/README.md` 要求提出文档修正，再同步实现或测试。
