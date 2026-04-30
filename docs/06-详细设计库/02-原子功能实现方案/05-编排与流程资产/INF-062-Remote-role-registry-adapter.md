# INF-062 Remote role registry adapter

- MSABC 分类：A
- 当前状态：部分完成

## 1. 职责
对接远程角色目录，列出可安装角色包并下载、校验、登记。

## 1.1 代码反哺状态
- 已实现：`RolePackageRegistryService.loadCatalog()` 支持远程角色目录；`installFromUrl()`、`installFromPath()`、`inspectPackageFromUrl()` 覆盖远程和本地安装链路。
- 已实现：`src/main/ipc/register-resource-ipc.ts` 暴露 `roles:list-catalog`、`roles:install-url`、`roles:install-path`，并接入资源治理审批。
- 已有证据：`tests/unit/remote-resource-registry.test.ts`、`tests/unit/register-resource-ipc.test.ts` 覆盖远程角色目录、安装审批和 IPC。
- 仍未完成：编排页角色资产区的远程下载入口和完整 UI e2e 证据不足，因此状态保持 `部分完成`。

## 2. 输入
- 注册表 URL
- 角色包 URL

## 3. 输出
- 远程角色条目列表
- 角色包安装结果

## 4. 必需能力
- 下载
- 校验目录结构
- 校验兼容性与来源
- 写入本地角色注册表

## 5. 安全边界
- 禁止执行角色包中的任意脚本
- 只接受声明式角色包内容
