# 10 模板中心组件 Props 与 Hook 状态设计

## 1. 目标
把模板中心与双主入口的 Renderer 设计压到组件、Props、Hook 和 IPC 调用级，避免实现时自由发挥。

## 2. 页面组件树
- `WelcomePage`
  - `HeroPrimaryActions`
  - `RecentProjectsPanel`
  - `RecentTemplatesPanel`
  - `QuickOrchestrationPanel`
- `TemplateCenterPage`
  - `TemplateToolbar`
  - `TemplateFilterBar`
  - `TemplateListPane`
    - `TemplateListItem`
  - `TemplateDetailPane`
    - `TemplateMetaSection`
    - `TemplateArtifactPreview`
    - `TemplateFlowPreview`
    - `TemplateActions`
- `ProjectTemplateDialog`
  - `CreateModeTabs`
  - `NewFolderForm`
  - `ExistingFolderPicker`
  - `TemplateSelectionSummary`

## 3. Props 契约
### 3.1 `TemplateCenterPage`
- 输入
  - `templates: TemplateListItemViewModel[]`
  - `recentTemplates: RecentTemplateViewModel[]`
  - `selectedTemplateId?: string`
  - `mode: "project" | "orchestration"`
  - `loading: boolean`
  - `error?: UiErrorViewModel`
- 输出事件
  - `onSelectTemplate(templateId)`
  - `onSearchChange(keyword)`
  - `onInstallFromDirectory()`
  - `onInstallFromRemote()`
  - `onCreateProject(payload)`
  - `onStartOrchestrationFromTemplate(templateId)`

### 3.2 `ProjectTemplateDialog`
- 输入
  - `selectedTemplate?: TemplateManifest`
  - `projectName: string`
  - `createMode: "new-folder" | "existing-folder"`
  - `parentDirectory?: string`
  - `existingDirectory?: string`
  - `validation: ProjectCreationValidation`
  - `submitting: boolean`
- 输出事件
  - `onProjectNameChange(value)`
  - `onCreateModeChange(mode)`
  - `onPickParentDirectory()`
  - `onPickExistingDirectory()`
  - `onSubmit()`
  - `onCancel()`

## 4. Hook 与状态归属
### 4.1 `useTemplateCenterState`
- 管理
  - `selectedTemplateId`
  - `searchKeyword`
  - `sourceFilter`
  - `compatibilityFilter`
  - `trustFilter`
  - `installDialogState`
- 不管理
  - 模板真实数据持久化
  - 目录选择结果写盘

### 4.2 `useProjectCreationForm`
- 管理
  - `projectName`
  - `createMode`
  - `parentDirectory`
  - `existingDirectory`
  - `validation`
  - `submitState`
- 提交后只保留最近一次结果，不缓存历史工程。

## 5. Renderer 到主进程调用链
1. `welcome bootstrap` -> `platform.bootstrap`
2. `template list refresh` -> `template.list`
3. `template install from dir` -> `template.installFromDirectory`
4. `template install from remote` -> `template.installFromRemote`
5. `create project from template` -> `project.createFromTemplate`
6. `start orchestration from template` -> `flow.createDraftFromTemplate`

## 6. 关键方法签名
### Renderer
- `selectTemplate(templateId: string): void`
- `submitCreateProject(): Promise<void>`
- `installTemplateFromDirectory(): Promise<void>`
- `installTemplateFromRemote(url: string): Promise<void>`
- `startFromTemplate(templateId: string): Promise<void>`

### Main / Service
- `TemplateRegistryService.list(): Promise<TemplateManifest[]>`
- `TemplateRegistryService.installFromDirectory(input: DirectoryInstallInput): Promise<TemplateInstallResult>`
- `TemplateRegistryService.installFromRemote(input: RemoteInstallInput): Promise<TemplateInstallResult>`
- `ProjectService.createFromTemplate(input: CreateProjectFromTemplateInput): Promise<ProjectBootstrapResult>`
- `RuntimeAssetService.createDraftFromTemplate(input: CreateDraftFromTemplateInput): Promise<FlowDraftBootstrapResult>`

## 7. 文件与持久化时机
- 模板安装成功后才写 `templates/<id>/`
- 创建工程成功后按顺序写：
  - `project.json`
  - `artifacts/`
  - `flows/`
  - `exports/`
  - 模板预置资产
- 从模板直接开始编排时只写草稿区，不得写正式工程目录

## 8. 开发顺序
1. `shared/template types`
2. `main/template registry`
3. `main/project creation`
4. `main/runtime draft-from-template`
5. `ipc template/project/flow bootstrap`
6. `renderer TemplateCenterPage`
7. `renderer ProjectTemplateDialog`
8. `e2e template center / project creation / start orchestration`

## 9. 不允许的实现
1. 直接在 Renderer 复制模板目录
2. 先写部分模板文件，失败后不回滚
3. 新建工程和从模板开始编排共用一套含混表单状态

