# 技能、连接与模型

负责技能中心、连接中心、Provider Profiles、模型诊断和命令面板。

## 共享代码边界
- `src/renderer/components/ProviderProfilesDialog.tsx`
- `src/main/services/skill-registry-service.ts`
- `src/main/services/capability-runtime.ts`
- `src/main/ipc.ts`
- `src/main/preload.ts`

## 共享数据结构
- InstalledSkill
- RemoteSkillCatalogItem
- ProviderProfile
- ProviderCapabilityMetadata
- RuntimeCapabilityDefinition

## 共享实现要求
### 前端/交互
- 安装/导入类动作默认放在图标入口或深层菜单，不在首屏常驻展开。
- 选中 Provider Profile 即激活；技能启用范围必须显式可见。

### 主进程/服务
- SkillRegistry 负责本地目录和远程目录的安装、删除、启用范围。
- CapabilityRuntime 负责把连接、脚本和内置能力统一成可调用能力。

### 数据与持久化
- Provider 配置与 API Key 分离存储。
- 技能安装记录要携带来源、版本、校验和启用范围。

### 校验与异常
- 目录安装、远程下载、模型测试都要有失败反馈和幂等策略。
- 真实 MCP 通用发现尚未完成前，必须在状态里明确标为未完成。

### 自动化测试
- e2e：Provider 新建保存、选择即激活、技能目录安装、会话级启用。
- unit：skill registry、profile store、capability registry。

## 本分类原子功能
- [F-095 技能中心查看已装与可装技能](./F-095-技能中心查看已装与可装技能.md) - A / 部分完成
- [F-096 从目录安装技能](./F-096-从目录安装技能.md) - A / 部分完成
- [F-097 从网络下载技能](./F-097-从网络下载技能.md) - A / 未完成
- [F-098 设置技能启用范围（全局/工程/会话）](./F-098-设置技能启用范围（全局-工程-会话）.md) - A / 部分完成
- [F-099 禁用、删除技能与状态反馈](./F-099-禁用、删除技能与状态反馈.md) - A / 部分完成
- [F-100 连接中心健康检查与授权状态](./F-100-连接中心健康检查与授权状态.md) - A / 部分完成
- [F-101 Provider Profiles 增删改查](./F-101-ProviderProfiles增删改查.md) - M / 已完成
- [F-102 模型能力标签与诊断显示](./F-102-模型能力标签与诊断显示.md) - A / 部分完成
- [F-103 命令面板与快捷动作](./F-103-命令面板与快捷动作.md) - A / 已完成
- [INF-025 Capability registry](./INF-025-Capabilityregistry.md) - S / 已完成
- [INF-026 Skill registry](./INF-026-Skillregistry.md) - A / 部分完成
- [INF-027 Connector registry and MCP-ready adapter](./INF-027-ConnectorregistryandMCP-readyadapter.md) - A / 部分完成
- [INF-028 Script tool adapter](./INF-028-Scripttooladapter.md) - A / 部分完成
