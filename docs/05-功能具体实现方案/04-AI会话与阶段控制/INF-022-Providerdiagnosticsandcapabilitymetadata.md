# INF-022 Provider diagnostics and capability metadata

## 1. 基本信息
- 类型：内部能力
- 所属层级：智能层 / Provider 诊断 / 元数据
- MSABC 分类：A
- 当前状态：部分完成
- 对应功能：
  - [F-056 本地 Ollama 连接测试与真实生成](./F-056-本地Ollama连接测试与真实生成.md)
  - [F-058 角色实际命中模型可见](./F-058-角色实际命中模型可见.md)

## 2. 能力目标
- 维护 provider 的可用性、能力标签和最近测试结果。

## 3. 输入输出
- 输入：测试结果、provider 描述、模型路由结果
- 输出：
  - `supportsStructuredOutput`
  - `supportsToolCalls`
  - `supportsLongContext`
  - `lastCheckedAt`
  - `lastLatencyMs`

## 4. 实现要求
- 设置页和运行详情共用同一份能力元数据。

## 5. 校验与异常
- 测试失败时保留旧元数据，但标记状态过期。

## 6. 自动测试
- unit：能力标签合并与失效逻辑。

## 7. 审计结论
- 审计状态：实现级文档已补齐，能力本身仍部分完成。
