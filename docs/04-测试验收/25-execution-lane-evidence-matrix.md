# 25 Execution Lane Evidence Matrix

本矩阵定义不同验证通道能证明什么。功能状态不得只凭单一通道升级；用户可见能力至少需要代码 owner、真实入口、自动化测试和交付路径共同支撑。

| ID | Lane | Command / Source | Evidence | Proves | Does Not Prove |
|---|---|---|---|---|---|
| LANE-UNIT | Unit test | `npm run test:unit` 或目标 `vitest` 文件 | `artifacts/test-runs/latest-unit.*`、断言输出 | 服务、纯函数、数据契约、错误分支 | Electron UI、打包态 |
| LANE-E2E | Electron e2e | `npm run test:e2e` 或目标 `playwright test` | Playwright trace、locator 断言、隔离 userData | 用户真实入口、IPC、主进程持久化 | 安装包可用性 |
| LANE-UI-REVIEW | UI contract | `npm run test:ui:contracts` / `test:ui:pages` | 截图、几何断言、响应式断言 | 页面布局、可见状态、交互 affordance | 服务深层语义 |
| LANE-CATALOG | Catalog integrity | `npm run test:catalog-integrity` | 测试编目覆盖报告 | 需求、oracle、测试目录映射不缺项 | 单个功能真的跑通 |
| LANE-PACKAGED-SMOKE | Packaged smoke | `npm run test:packaged-smoke` | 打包应用启动、基础窗口、手动工程指针 | 打包态最低可运行 | 复杂用户旅程 |
| LANE-PACKAGED-PROJECT | Packaged project validation | `npm run test:packaged-project-validation` | `out/manual-projects/` 可复开工程和 `out/package/` 指针 | 打包态交付工程可被人类复核 | 所有功能成熟 |
| LANE-DELIVERY | Delivery quality gate | `npm run test:delivery-gate` | 交付门禁报告 | 输出路径、证据、可追溯性交付 | UI 视觉完整性 |

## 状态升级规则

1. 内部能力可以由 `LANE-UNIT` 加代码 owner 证明“已完成”。
2. 用户可见能力至少需要 `LANE-E2E`；涉及布局、嵌入或响应式时还需要 `LANE-UI-REVIEW`。
3. 需要交付给用户复开的能力必须补 `LANE-PACKAGED-SMOKE` 或 `LANE-PACKAGED-PROJECT`。
4. 文档修复只能写明“当前证据”，不能把未执行的通道写成已证明。
