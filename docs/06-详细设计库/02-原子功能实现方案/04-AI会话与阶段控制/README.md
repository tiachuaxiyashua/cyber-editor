# AI会话与阶段控制

负责会话、上下文、阶段推进、阶段 guard、审查流程和运行记录。

## 共享代码边界
- `src/renderer/App.tsx`
- `src/main/services/runtime-service.ts`
- `src/main/services/ai-service.ts`
- `src/main/services/model-router.ts`
- `src/main/services/structured-generation-service.ts`

## 共享数据结构
- AiSession
- WorkflowState
- StageGuardStatus
- RuntimeRun
- RuntimeEvent

## 共享实现要求
### 前端/交互
- 右栏聚焦当前会话；流程面板聚焦阶段状态、审查结果和运行记录。
- 阶段确认按钮必须受 guard 与运行状态双重约束，不能裸放。

### 主进程/服务
- RuntimeService 统一处理消息发送、阶段草稿、审查、运行记录、失败恢复。
- ModelRouter 按角色/节点策略选择 Provider，不允许只靠全局当前模型。

### 数据与持久化
- 会话、阶段状态、项目记忆与运行记录要分开持久化。
- 阶段输出统一落到模板工件目录。

### 校验与异常
- 结构化输出必须先校验再写工件。
- 阶段确认前必须校验输入存在、guard 通过、阻塞 issue 关闭。

### 自动化测试
- e2e：真实 Ollama 会话、阶段草稿、guard 阻断、审查回合、运行日志。
- unit：ModelRouter、StructuredGeneration、guard 规则。

## 本分类原子功能
- [F-043 会话列表与当前会话切换](./F-043-会话列表与当前会话切换.md) - M / 已完成
- [F-044 新建、重命名、归档和删除会话](./F-044-新建、重命名、归档和删除会话.md) - M / 已完成
- [F-045 发送消息、停止生成与重试](./F-045-发送消息、停止生成与重试.md) - M / 部分完成
- [F-046 选择引用文档与图片上下文](./F-046-选择引用文档与图片上下文.md) - A / 已完成
- [F-047 当前阶段显示与下一步建议](./F-047-当前阶段显示与下一步建议.md) - M / 已完成
- [F-048 阶段 guard 检查结果展示](./F-048-阶段guard检查结果展示.md) - S / 部分完成
- [F-049 只有满足 guard 才允许阶段确认](./F-049-只有满足guard才允许阶段确认.md) - S / 未完成
- [F-050 生成阶段草稿并写入工件](./F-050-生成阶段草稿并写入工件.md) - S / 部分完成
- [F-051 AI 内部过程显性化展示](./F-051-AI内部过程显性化展示.md) - S / 部分完成
- [F-052 红蓝裁判审查子流程](./F-052-红蓝裁判审查子流程.md) - S / 部分完成
- [F-053 审查问题采纳/忽略/待处理](./F-053-审查问题采纳-忽略-待处理.md) - A / 部分完成
- [F-054 运行记录、错误与重试](./F-054-运行记录、错误与重试.md) - A / 部分完成
- [F-055 Provider 选择即激活](./F-055-Provider选择即激活.md) - M / 已完成
- [F-056 本地 Ollama 连接测试与真实生成](./F-056-本地Ollama连接测试与真实生成.md) - S / 部分完成
- [F-057 DeepSeek/OpenAI-compatible 配置](./F-057-DeepSeek-OpenAI-compatible配置.md) - M / 已完成
- [F-058 角色实际命中模型可见](./F-058-角色实际命中模型可见.md) - A / 部分完成
- [INF-015 Session persistence](./INF-015-Sessionpersistence.md) - M / 已完成
- [INF-016 Agent memory and review round store](./INF-016-Agentmemoryandreviewroundstore.md) - A / 已完成
- [INF-017 Runtime run/event store](./INF-017-Runtimerun-eventstore.md) - A / 已完成
- [INF-018 Provider adapter layer](./INF-018-Provideradapterlayer.md) - M / 部分完成
- [INF-019 ModelRouter](./INF-019-ModelRouter.md) - S / 部分完成
- [INF-020 StructuredGenerationService](./INF-020-StructuredGenerationService.md) - S / 部分完成
- [INF-021 Repair/Fallback pipeline](./INF-021-Repair-Fallbackpipeline.md) - S / 部分完成
- [INF-022 Provider diagnostics and capability metadata](./INF-022-Providerdiagnosticsandcapabilitymetadata.md) - A / 部分完成
- [INF-023 Stage guard engine](./INF-023-Stageguardengine.md) - S / 部分完成
- [INF-024 Review engine](./INF-024-Reviewengine.md) - S / 部分完成
