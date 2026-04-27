# 系统安全与观测

负责设置、安全存储、权限、审计、通知、响应式布局、测试和打包。

## 共享代码边界
- `src/main/main.ts`
- `src/main/services/store.ts`
- `src/main/services/runtime-errors.ts`
- `tests/e2e`
- `tests/unit`

## 共享数据结构
- AppSettings
- SidebarLayout
- RuntimeError
- AuditEntry
- Usage Metrics

## 共享实现要求
### 前端/交互
- 全局通知、帮助、加载和错误态要统一，不允许每页各搞一套。
- 布局缩放与主题切换要在所有主要页面保持一致。
- 多窗口或分屏查看必须与主工作台保持一致的对象语义和保存链路。

### 主进程/服务
- SettingsStore 负责主题、布局和敏感配置分离存储。
- 审计、使用量、错误分类与测试基座属于系统级基础设施。

### 数据与持久化
- 敏感数据不进文档目录。
- 布局状态、最近记录和诊断信息分层持久化。

### 校验与异常
- 宣称已完成前，必须有真实程序执行、自动测试和用户视角复核。
- 打包后 smoke 必须覆盖安装包与可执行文件。

### 自动化测试
- e2e：主题/布局/紧凑宽度、打包 smoke、用户行为全旅程。
- unit：settings、runtime errors、usage/cost/audit。

## 本分类原子功能
- [F-104 全局通知、空状态、错误态与帮助](./F-104-全局通知、空状态、错误态与帮助.md) - B / 部分完成
- [F-105 工作台三栏拖拽与宽度记忆](./F-105-工作台三栏拖拽与宽度记忆.md) - M / 部分完成
- [F-106 顶部工具栏与对象级高频操作](./F-106-顶部工具栏与对象级高频操作.md) - A / 部分完成
- [F-107 导入/安装类功能统一为深层入口](./F-107-导入-安装类功能统一为深层入口.md) - A / 未完成
- [F-108 小白降噪与高手深层入口](./F-108-小白降噪与高手深层入口.md) - S / 未完成
- [F-109 深浅主题与响应式一致性](./F-109-深浅主题与响应式一致性.md) - A / 部分完成
- [F-110 打包后可启动与基础 smoke 可用](./F-110-打包后可启动与基础smoke可用.md) - M / 已完成
- [F-113 多窗口或分屏同时查看多个文件](./F-113-多窗口或分屏同时查看多个文件.md) - A / 未完成
- [INF-001 Window/launch shell](./INF-001-Window-launchshell.md) - M / 已完成
- [INF-002 Settings/layout persistence](./INF-002-Settings-layoutpersistence.md) - M / 已完成
- [INF-042 Permission / hook / audit governance](./INF-042-Permission-hook-auditgovernance.md) - A / 部分完成
- [INF-043 Usage / cost / error taxonomy](./INF-043-Usage-cost-errortaxonomy.md) - B / 部分完成
- [INF-046 UI responsive layout engine](./INF-046-UIresponsivelayoutengine.md) - A / 部分完成
- [INF-047 Command registry](./INF-047-Commandregistry.md) - A / 已完成
- [INF-048 Package/test harness](./INF-048-Package-testharness.md) - M / 已完成
- [INF-051 Multi-window workspace coordinator](./INF-051-Multi-windowworkspacecoordinator.md) - A / 未完成
