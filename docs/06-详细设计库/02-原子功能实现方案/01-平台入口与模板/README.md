# 平台入口与模板

负责应用启动、欢迎页、新建工程、模板中心、模板导入导出与最近模板路径。

## 共享代码边界
- `src/renderer/App.tsx`
- `src/renderer/components/ShellPrimitives.tsx`
- `src/renderer/components/TemplateCenterPage.tsx`
- `src/main/services/project-service.ts`
- `src/main/services/template-registry-service.ts`
- `src/main/services/store.ts`

## 共享数据结构
- AppSettings.recentProjects / recentTemplates
- ProjectManifest.templateId
- ProjectTemplateDefinition
- ProjectTemplatePackage

## 共享实现要求
### 前端/交互
- 欢迎页与新建工程页都由 renderer 路由状态驱动，不允许把模板入口写死为固定四张卡片。
- 所有模板展示都来自模板注册表查询结果；默认内置模板只是初始数据，不是 UI 常量。
- 无工程状态必须允许直接进入编排页。

### 主进程/服务
- 主进程负责目录选择、工程创建、模板安装、模板保存与最近项目/最近模板持久化。
- 模板注册表统一维护内置模板、本地模板和远程模板元数据。

### 数据与持久化
- 最近工程与最近模板写入设置存储。
- 模板包保存为可枚举资产，项目 manifest 只引用 templateId。

### 校验与异常
- 创建工程时校验路径、名称、冲突和空目录策略。
- 模板安装时校验 manifest、来源、版本和覆盖策略。

### 自动化测试
- e2e：首启欢迎页、模板搜索、新建工程、新建文件夹、最近模板回填。
- unit：模板注册表、路径校验、工程脚手架。

## 本分类原子功能
- [F-001 启动后进入欢迎页或恢复工作台](./F-001-启动后进入欢迎页或恢复工作台.md) - M / 已完成
- [F-002 欢迎页最近工程列表](./F-002-欢迎页最近工程列表.md) - M / 已完成
- [F-003 欢迎页最近工程管理](./F-003-欢迎页最近工程管理.md) - A / 已完成
- [F-004 欢迎页最近模板与继续使用](./F-004-欢迎页最近模板与继续使用.md) - A / 部分完成
- [F-005 欢迎页无工程直接进入编排页](./F-005-欢迎页无工程直接进入编排页.md) - S / 未完成
- [F-006 新建工程时创建新文件夹](./F-006-新建工程时创建新文件夹.md) - M / 未完成
- [F-007 新建工程时使用已有文件夹](./F-007-新建工程时使用已有文件夹.md) - M / 已完成
- [F-008 新建工程的命名与路径校验](./F-008-新建工程的命名与路径校验.md) - M / 部分完成
- [F-009 从模板创建工程](./F-009-从模板创建工程.md) - M / 已完成
- [F-010 打开已有工程](./F-010-打开已有工程.md) - M / 已完成
- [F-011 模板中心入口与返回路径](./F-011-模板中心入口与返回路径.md) - A / 部分完成
- [F-012 模板中心搜索筛选](./F-012-模板中心搜索筛选.md) - A / 部分完成
- [F-013 安装/导入模板](./F-013-安装-导入模板.md) - S / 未完成
- [F-014 保存当前工程为模板](./F-014-保存当前工程为模板.md) - S / 部分完成
- [F-122 模板来源、版本、信任与兼容性展示](./F-122-模板来源-版本-信任与兼容性展示.md) - A / 未完成
- [F-123 模板更新、损坏阻断与状态修复](./F-123-模板更新-损坏阻断与状态修复.md) - A / 未完成
- [F-124 从模板直接开始编排](./F-124-从模板直接开始编排.md) - S / 未完成
- [F-129 GStack 软件交付工作流模板](./F-129-GStack软件交付工作流模板.md) - A / 部分完成
- [INF-004 Recent project/template store](./INF-004-Recentproject-templatestore.md) - A / 已完成
- [INF-029 Template registry](./INF-029-Templateregistry.md) - S / 部分完成
- [INF-030 Template scaffold and save service](./INF-030-Templatescaffoldandsaveservice.md) - S / 部分完成
