# 24 Test Fixture Matrix

本矩阵定义自动化测试可以复用的夹具来源。夹具不是第二套需求真相，只用于说明测试从哪里获得稳定数据、如何隔离用户环境，以及覆盖哪些代码 owner。

| ID | Fixture | Owner | Purpose | Used By |
|---|---|---|---|---|
| FIX-01 | Base project fixture | `tests/e2e/helpers/project-fixtures.ts` | 创建最小工程并 hydrate renderer bootstrap，覆盖 manifest、默认文档、Flow、runtime 和 artifact 路径 | `workbench-basics.spec.ts`, `table-artifact-workbench.spec.ts`, `knowledge-index-refresh.spec.ts` |
| FIX-02 | Software factory template project | `src/shared/template-packages/software-factory.json` | 使用内置软件工厂模板创建带阶段文档、角色、Flow 和导出映射的工程 | `knowledge-index-refresh.spec.ts`, `architecture-governance.spec.ts`, `orchestration-runtime-ai.spec.ts` |
| FIX-03 | Isolated Electron user data | `CYBER_EDITOR_USER_DATA`, `APPDATA`, `LOCALAPPDATA`, `HOME` | 避免测试污染真实用户设置、最近工程、Provider 配置和窗口状态 | 所有 Electron e2e |
| FIX-04 | Table artifact files | `tests/e2e/table-artifact-workbench.spec.ts`, `tests/unit/table-artifact-service.test.ts` | 生成 CSV/TSV/XLSX 样例，验证表格工件解析、编辑、保存和 Markdown 链接跳转 | F-111, F-112, INF-049, INF-050 |
| FIX-05 | Knowledge index project | `tests/e2e/knowledge-index-refresh.spec.ts` | 生成可变更文档并触发知识索引 ready/stale/refresh 状态转换 | F-117, F-121, INF-057 |
| FIX-06 | Runtime context pack fixtures | `tests/unit/runtime-context-recovery.test.ts`, `runtime-context-explanation.test.ts` | 构造 pinned/excluded 文档、检索命中、provenance records 和预算计划 | F-118, F-119, F-120, INF-058 |

## 使用约束

1. 夹具必须通过公开 IPC 或服务 API 创建，不得直接伪造 renderer 状态。
2. Electron e2e 必须隔离用户数据目录。
3. 文档工件夹具写入后必须重新 hydrate 或 refresh bootstrap，验证主进程持久化确实可读。
4. 大文件、损坏文件和越界路径夹具必须在测试结束后清理。
