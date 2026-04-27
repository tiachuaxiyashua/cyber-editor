# 14 技能连接与模型中心组件 Props 与 Hook 状态设计

## 1. 目标
把技能中心、角色下载、连接健康、provider profiles 和模型能力诊断压到面板/表单级实现。

## 2. 页面组件树
- `SkillCenterPage`
  - `InstalledSkillList`
  - `AvailableSkillList`
  - `RemoteRegistrySearchBar`
  - `SkillScopeEditor`
- `RoleCenterPage`
  - `InstalledRoleList`
  - `RemoteRoleRegistryList`
  - `RolePackageDetail`
- `ProviderProfilesDialog`
  - `ProviderProfileList`
  - `ProviderProfileForm`
  - `ConnectionDiagnosticsPanel`

## 3. Props 契约
- `ProviderProfileForm`
  - 输入：`profile`, `validation`, `diagnostics`, `submitting`
  - 输出：`onPatchProfile(patch)`, `onTestConnection()`, `onSaveProfile()`
- `AvailableSkillList`
  - 输入：`items`, `installingId`, `searchKeyword`
  - 输出：`onInstallSkill(id)`, `onInstallFromDirectory()`, `onInstallFromRemote(url)`
- `RemoteRoleRegistryList`
  - 输入：`roles`, `loading`, `error`
  - 输出：`onInstallRole(roleId)`

## 4. Hook 与状态归属
- `useSkillCenterState`
- `useProviderProfilesState`
- `useRemoteRegistrySearchState`
- `useRoleRegistryState`

## 5. 方法级 I/O
- `SkillRegistryService.listInstalled(): Promise<SkillPackageManifest[]>`
- `SkillRegistryService.installFromDirectory(input): Promise<InstallResult>`
- `SkillRegistryService.loadCatalog(catalogUrl?: string): Promise<RemoteSkillCatalogItem[]>`
- `SkillRegistryService.installFromUrl(input): Promise<InstallResult>`
- `RolePackageRegistryService.loadCatalog(catalogUrl?: string): Promise<RemoteRoleCatalogItem[]>`
- `RolePackageRegistryService.installFromUrl(input): Promise<InstallResult>`
- `ModelRouter.diagnose(input): Promise<ModelDiagnosticsResult>`

## 6. 持久化
- provider profiles 写到安全设置存储
- skills 和 role packages 成功安装后写各自目录
- 远程搜索结果不持久化，只缓存会话态

## 7. 开发顺序
1. manifest/schema
2. registry services
3. diagnostics
4. IPC
5. center/dialog renderer
6. install/download test flows
