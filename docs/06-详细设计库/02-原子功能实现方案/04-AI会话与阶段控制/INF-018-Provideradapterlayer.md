# INF-018 Provider adapter layer

## 1. 基本信息
- 类型：内部能力
- 所属层级：智能层 / Provider 接入 / 适配
- MSABC 分类：M
- 当前状态：部分完成
- 对应功能：
  - [F-056 本地 Ollama 连接测试与真实生成](./F-056-本地Ollama连接测试与真实生成.md)
  - [F-057 DeepSeek/OpenAI-compatible 配置](./F-057-DeepSeek-OpenAI-compatible配置.md)

## 2. 能力目标
- 为 Ollama、DeepSeek、OpenAI-compatible provider 提供统一调用接口。

## 3. 输入输出
- 输入：结构化生成请求、provider profile
- 输出：文本、结构化响应、错误分类

## 4. 实现要求
- 统一接口：
  - `testConnectivity`
  - `generateText`
  - `generateStructured`
  - `cancelRun`
- 真实调用不能走 mock。

## 5. 校验与异常
- 连接失败、认证失败、超时、模型不存在必须分开报错。

## 6. 自动测试
- unit：错误分类映射。
- integration：不同 provider 适配调用。

## 7. 审计结论
- 审计状态：实现级文档已补齐，能力本身仍部分完成。
