# 16 GStack 工程分析与模板提取报告

## 1. 目标与范围
本报告基于本地源码和文档，对 `E:\chuan_project\gstack-main` 做实现级分析，回答四个问题：

1. 它的核心实现原理是什么。
2. 它的软件实现方案和错误处理机制有什么可借鉴之处。
3. 它的优势和缺陷是什么。
4. 它的工作流是否可以提取为 Cyber Editor 的默认模板。

本报告分析的是 GStack 当前本地源码，不讨论产品宣传层。

## 2. 实际阅读的关键文件
### 顶层与设计文档
- `ARCHITECTURE.md`
- `README.md`
- `docs/designs/SESSION_INTELLIGENCE.md`
- `docs/designs/CONDUCTOR_SESSION_API.md`
- `docs/skills.md`
- `docs/OPENCLAW.md`
- `SKILL.md`
- `conductor.json`

### 运行时代码
- `browse/src/cli.ts`
- `browse/src/server.ts`
- `browse/src/browser-manager.ts`
- `browse/src/snapshot.ts`
- `browse/src/tab-session.ts`
- `browse/src/token-registry.ts`
- `browse/src/content-security.ts`
- `browse/src/path-security.ts`
- `browse/src/cookie-import-browser.ts`
- `browse/src/cookie-picker-ui.ts`
- `browse/src/write-commands.ts`
- `browse/src/read-commands.ts`
- `browse/src/meta-commands.ts`

## 3. 核心实现原理
### 3.1 总体架构
GStack 并不是一个“每次命令都重新打开浏览器”的脚本工具，而是一个持续运行的浏览器守护进程系统：

```text
CLI
  -> 读取 .gstack/browse.json
  -> 健康检查
  -> 若无服务则后台启动 server
  -> 通过 localhost HTTP 发送命令

Persistent Server
  -> 持有 Playwright / Chromium
  -> 持有 tab/session/token registry
  -> 维护 console/network/dialog buffer
  -> 对外暴露 /command /health /batch /pair 等 HTTP API
```

### 3.2 关键设计判断
它把“浏览器进程”和“调用入口”拆开：

- CLI 是薄封装
- server 才是长驻运行时

这带来两个效果：

1. 首次启动慢一点，但后续命令非常快  
2. 标签页、cookie、会话、缓冲区都可以持续存在

### 3.3 状态文件机制
GStack 使用 `.gstack/browse.json` 存储：
- pid
- port
- token
- startedAt
- binaryVersion
- mode

CLI 每次先读这个文件，再决定：
- 复用现有 server
- 还是重启 server

这是一种“显式 server state + health-check-first”模式。

## 4. 软件实现方案细节
### 4.1 CLI 层
`browse/src/cli.ts` 负责：
- 启动 server
- 读取状态文件
- 做健康检查
- 处理版本不一致自动重启
- 处理 stale PID / stale lock
- 把用户命令封成 HTTP 请求发给 server

实现特点：
- 先检查 `/health`，而不是只看 PID
- Windows 和 Unix 走不同的后台启动策略
- 有锁文件避免并发启动竞争

### 4.2 Server 层
`browse/src/server.ts` 是真正核心。

它负责：
- 本地 HTTP server
- token 验证
- scoped token / root token
- 活动日志
- browser manager
- batch command
- inspector
- remote pairing
- tunnel/ngrok
- sidebar session

这说明 GStack 把“浏览器工具”当成了一个小型本地平台，而不是一个命令集合。

### 4.3 Browser manager
从 `browser-manager.ts` 和相关模块可以看出，它的浏览器层至少处理：
- 持续会话
- tab 管理
- 连接模式（headless / headed）
- URL 和页面对象生命周期
- 浏览器崩溃后的外层恢复逻辑

### 4.4 Snapshot / Ref 模型
`snapshot.ts` 提供带 `@eN / @cN` 的引用快照。

这不是普通截图，而是：
- 页面可交互元素抽取
- 文本包装
- 引用标签化
- 后续点击/填表等命令都基于这些 ref

这是它交互可靠性的关键之一。

### 4.5 Session intelligence
从 `SESSION_INTELLIGENCE.md` 和实际代码路径来看，GStack 不只保存聊天消息，而是保存：
- 计划
- 评审
- checkpoint
- timeline
- 运行历史

它的思路是“长期项目智能”，不是单会话聊天。

## 5. 错误处理机制细节
### 5.1 健康检查优先
CLI 不直接相信 PID，而是优先请求 `/health`。

这比“PID 存在就认为 server 可用”更可靠，因为：
- 进程可能活着但逻辑已经挂死
- 端口可能已失效
- token 可能已不匹配

### 5.2 stale state / stale lock 清理
CLI 会：
- 清理旧状态文件
- 清理 stale lock
- 检查持锁进程是否还活着

这直接减少了“上次异常退出导致完全不可用”的情况。

### 5.3 版本变更自动重启
状态文件带 `binaryVersion`。
CLI 检测到版本不一致时，自动重启 server。

这是非常成熟的运行时策略，因为它避免了：
- 新 CLI 去连旧 server
- 协议版本漂移

### 5.4 错误重写
它不是简单把底层错误抛给用户，而是很多地方会改写成可操作错误：
- server 启动失败
- auth 失败
- tunnel 失败
- cookie 导入失败
- headless/headed 冲突

这类“可操作错误”是值得吸收的。

### 5.5 失败即退出，由上层重拉
server 自身倾向于：
- 写明错误
- 退出
- 交给 CLI 重新启动

这是一种典型的 supervisor 思路。

优点：
- server 内部复杂恢复逻辑更少
- 错误边界清楚

缺点：
- 若外层重启策略不完善，会出现抖动

### 5.6 安全边界错误
`content-security.ts` / `path-security.ts` 说明它不是只考虑 happy path，而是显式约束：
- 不信任页面内容
- 不信任任意文件路径
- 不直接暴露 cookie 明文

这类错误处理和安全边界是系统级的，而不是临时 if 判断。

## 6. 优势
### 6.1 它最强的不是浏览器，而是工程化运行时
真正优秀的点是：
- 守护进程 + CLI 分层
- 状态文件 + 健康检查
- token 和 scoped access
- 错误可恢复
- 运行痕迹持久化

### 6.2 方法论沉淀很强
`docs/skills.md` 和相关文档里，GStack 已经沉淀出强方法论：
- office-hours
- ceo review
- design review
- engineering review
- review
- qa
- ship
- retro

这不是随便几个 prompt，而是一个成体系的软件交付节奏。

### 6.3 评审门槛清晰
GStack 的多个环节本质上是 gate：
- 设计没过，不进工程
- 评审没过，不进 QA
- QA 没过，不进 ship

这和 Cyber Editor 的阶段 contract / guard 思路高度兼容。

### 6.4 session intelligence 的方向正确
它不是只保存聊天历史，而是保存：
- 阶段性产物
- 决策
- review
- timeline

这比“只存上下文”更强。

## 7. 缺陷
### 7.1 浏览器运行时过重
对 Cyber Editor 来说：
- 浏览器 daemon
- Playwright 长驻
- headed/headless/tunnel/pair-agent
这些都不是核心。

如果直接搬，会把产品拉偏。

### 7.2 方法论落在技能文本里过重
GStack 很多能力依赖：
- skill prose
- slash command
- 特定工作方式

这对方法论迁移有帮助，但对可视化编排不够直接。

### 7.3 浏览器域强，通用图文工作台域弱
GStack 的核心场景仍然偏：
- 浏览器自动化
- Web 读写
- 外部页面操作

Cyber Editor 的核心场景是：
- 文本/图文工件
- Flow 编排
- 文档、工件、模板、角色、导出

所以不能把它当底座搬。

## 8. 可吸收的工程设计优点
### 8.1 应吸收
1. `状态文件 + 健康检查优先`
2. `错误重写和可恢复策略`
3. `checkpoint / review / timeline 的持久化`
4. `方法论作为显式工作流资产`
5. `阶段门控`
6. `长任务持久化和重入`

### 8.2 不应吸收
1. 浏览器 daemon 本身
2. tunnel / remote browser pairing 这套机制
3. Claude / slash-command 偏置
4. 把方法论只写成技能说明文档，而不是 Flow 资产

## 9. 能否提取为编排模板
结论：**可以，而且应该。**

但提取的是：
- 软件交付方法论
- 审查门槛
- 角色分工
- 阶段节奏

不是：
- 浏览器运行时
- ngrok/tunnel
- cookie/import/browser inspection

## 10. 提取后的模板设计
### 10.1 模板 ID
`gstack-software-factory`

### 10.2 模板名称
`GStack 软件交付`

### 10.3 主流程建议
```text
开始
  -> office-hours
  -> ceo review
  -> design review
  -> engineering review
  -> implementation plan
  -> review
  -> qa
  -> ship
  -> retro
  -> 结束
```

### 10.4 角色建议
- 问题澄清主持人
- CEO 评审员
- 设计评审员
- 工程评审员
- 审查员
- QA 审查员
- 发布总结员
- 复盘员

### 10.5 工件建议
- `problem-brief.md`
- `ceo-review.md`
- `design-review.md`
- `engineering-review.md`
- `implementation-plan.md`
- `qa-report.md`
- `ship-summary.md`
- `retro.md`

## 11. 当前提取结论
当前已经可以把它作为内置默认模板之一加入 Cyber Editor。

当前限制：
- 只是提取了工作流方法论和模板资产
- 没有把 GStack 的浏览器自动化运行时接进 Cyber Editor
- 还没有针对该模板做用户级运行验证

## 12. 对 Cyber Editor 的直接建议
1. 把 `GStack 软件交付` 模板加入默认模板。
2. 把 GStack 的 review gate 思想写进阶段 guard。
3. 把 session intelligence 的持久化思路接到我们自己的知识底座里。
4. 不要把浏览器 daemon 作为核心能力迁入产品。
