# 编排与流程资产

负责编排页、节点库、画布交互、流程语义、角色、连接、工具、角色包实例化和运行调试。

## 共享代码边界
- `src/renderer/components/OrchestrationWorkspace.tsx`
- `src/main/services/platform-service.ts`
- `src/main/services/runtime-service.ts`
- `src/shared/flow-validator.ts`

## 共享数据结构
- PlatformFlowAsset
- PlatformFlowNode
- PlatformRole
- RolePackageReference
- PlatformConnector
- ControlledScriptTool
- FlowHistoryEntry

## 共享实现要求
### 前端/交互
- 编排页以画布为核心，左侧是资产与节点库，右侧是 Inspector，底部是运行与调试；所有面板都必须可缩放且在紧凑宽度稳定。
- 节点高频动作贴在卡片上，低频动作进入右键。节点库要用可拖拽小卡片，不是静态列表。
- 角色编辑只负责角色包与能力边界；输出格式和工件目录不进入角色编辑面板。

### 主进程/服务
- PlatformService 负责 Flow/Subflow/Role/Connector/Tool 资产持久化与版本历史。
- RuntimeService 负责运行、调试、局部重跑和流程事件。
- RolePackageLoader 负责角色包目录读取、实例化和覆盖合并。

### 数据与持久化
- 节点位置属于 draft 本身的一部分，不能作为临时 UI 状态。
- 并行、循环、子流程必须有明确语义模型和配置结构。

### 校验与异常
- 每次保存 Flow 都要过结构校验、节点 IO 校验和关键语义校验。
- 无工程编排模式要有独立的草稿存储，不能依赖工程目录。

### 自动化测试
- e2e：拖拽节点、连线、右键、子流程、缩放、窄宽度、位置持久化、流程恢复。
- unit：flow validator、布局持久化、并行/循环配置解析。

## 本分类原子功能
- [编排层操作与工作方式](./00-编排层操作与工作方式.md)
- [F-059 编排页入口](./F-059-编排页入口.md) - S / 已完成
- [F-060 无工程状态进入编排页](./F-060-无工程状态进入编排页.md) - S / 未完成
- [F-061 设计态与运行态切换](./F-061-设计态与运行态切换.md) - S / 未完成
- [F-062 资产区切换流程/工件/角色/连接/工具](./F-062-资产区切换流程-工件-角色-连接-工具.md) - S / 部分完成
- [F-063 节点库小卡片展示](./F-063-节点库小卡片展示.md) - A / 部分完成
- [F-064 拖拽节点进入画布](./F-064-拖拽节点进入画布.md) - S / 未完成
- [F-065 节点拖动与位置持久化](./F-065-节点拖动与位置持久化.md) - S / 部分完成
- [F-066 连线创建、删除与流向可读](./F-066-连线创建、删除与流向可读.md) - S / 部分完成
- [F-067 条件节点配置](./F-067-条件节点配置.md) - S / 部分完成
- [F-068 循环节点配置](./F-068-循环节点配置.md) - S / 部分完成
- [F-069 并行分叉与并行汇合配置](./F-069-并行分叉与并行汇合配置.md) - S / 未完成
- [F-070 并行分支通信策略配置](./F-070-并行分支通信策略配置.md) - S / 未完成
- [F-071 子流程卡片直接进入编辑](./F-071-子流程卡片直接进入编辑.md) - S / 部分完成
- [F-072 节点卡片常用操作](./F-072-节点卡片常用操作.md) - A / 部分完成
- [F-073 节点右键菜单](./F-073-节点右键菜单.md) - A / 部分完成
- [F-074 画布右键菜单](./F-074-画布右键菜单.md) - A / 部分完成
- [F-075 左侧面板缩放、折叠与记忆](./F-075-左侧面板缩放、折叠与记忆.md) - A / 未完成
- [F-076 右侧 Inspector 缩放、折叠与记忆](./F-076-右侧Inspector缩放、折叠与记忆.md) - A / 未完成
- [F-077 紧凑宽度布局稳定](./F-077-紧凑宽度布局稳定.md) - A / 未完成
- [F-078 多角色定义与切换](./F-078-多角色定义与切换.md) - S / 部分完成
- [F-079 角色目标/设定/角色包配置编辑](./F-079-角色目标-设定-角色包配置编辑.md) - S / 部分完成
- [F-080 角色技能绑定、权限边界与实例化](./F-080-角色技能绑定-权限边界与实例化.md) - S / 未完成
- [F-116 角色包目录与实例化](./F-116-角色包目录与实例化.md) - S / 未完成
- [F-125 编排页自然语言编排对话入口](./F-125-编排页自然语言编排对话入口.md) - S / 部分完成
- [F-126 根据自然语言生成初始 Flow 草稿](./F-126-根据自然语言生成初始Flow草稿.md) - S / 部分完成
- [F-127 通过对话增量修改现有 Flow](./F-127-通过对话增量修改现有Flow.md) - S / 部分完成
- [F-128 从网络下载角色包](./F-128-从网络下载角色包.md) - A / 部分完成
- [F-081 连接资产管理](./F-081-连接资产管理.md) - A / 部分完成
- [F-082 工具资产管理](./F-082-工具资产管理.md) - A / 部分完成
- [F-083 节点绑定角色、连接和工具](./F-083-节点绑定角色、连接和工具.md) - S / 部分完成
- [F-084 节点级调试与从此继续](./F-084-节点级调试与从此继续.md) - S / 未完成
- [F-085 Flow 保存、另存、导入、导出](./F-085-Flow保存、另存、导入、导出.md) - A / 部分完成
- [F-086 Flow 历史、快照与恢复](./F-086-Flow历史、快照与恢复.md) - A / 未完成
- [INF-031 Flow asset persistence](./INF-031-Flowassetpersistence.md) - S / 部分完成
- [INF-060 Conversation-to-flow planner](./INF-060-Conversation-to-flow-planner.md) - S / 部分完成
- [INF-061 Flow patch application engine](./INF-061-Flow-patch-application-engine.md) - S / 部分完成
- [INF-032 Canvas layout state store](./INF-032-Canvaslayoutstatestore.md) - S / 部分完成
- [INF-033 Flow validation engine](./INF-033-Flowvalidationengine.md) - S / 部分完成
- [INF-037 Loop runtime](./INF-037-Loopruntime.md) - S / 部分完成
- [INF-038 Parallel runtime](./INF-038-Parallelruntime.md) - S / 未完成
- [INF-039 Subflow runtime](./INF-039-Subflowruntime.md) - S / 部分完成
- [INF-040 Node debug / partial rerun engine](./INF-040-Nodedebug-partialrerunengine.md) - S / 未完成
- [INF-041 Flow history/snapshot/restore](./INF-041-Flowhistory-snapshot-restore.md) - A / 未完成
- [INF-053 Role package loader](./INF-053-Rolepackageloader.md) - S / 未完成
- [INF-062 Remote role registry adapter](./INF-062-Remote-role-registry-adapter.md) - A / 部分完成
