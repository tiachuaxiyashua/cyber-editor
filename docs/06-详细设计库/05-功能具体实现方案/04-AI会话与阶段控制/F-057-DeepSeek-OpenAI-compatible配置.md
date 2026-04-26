# F-057 DeepSeek/OpenAI-compatible 配置

## 1. 基本信息
- 类型：用户可见功能
- 所属层级：AI会话与阶段控制 / 模型配置 / 云模型
- MSABC 分类：M
- 当前状态：已完成
- 关联页面：[设置与模型配置](../../04-UI设计/09-设置与模型配置.md)
- 共享实现基线：[AI会话与阶段控制](README.md)

## 2. 完成定义
- 用户可配置基于 OpenAI-compatible API 的 provider profile。
- 至少支持：
  - base URL
  - API key
  - model
  - provider type

## 3. 页面入口与层级
- 页面：`P4 设置与模型配置`

## 4. 用户操作与系统反馈
1. 用户新建 provider profile。
2. 填写配置信息。
3. 保存后 profile 出现在列表中并可直接激活。

## 5. 数据与状态
- `ProviderProfile`

## 6. 实现要求
### Renderer
- 表单按 provider 类型显示必要字段。

### Main / Service
- 配置持久化时敏感信息走安全存储。

## 7. 校验与异常
- 缺少 base URL 或 model 时不允许保存。
- API key 为空时提示不可执行真实调用。

## 8. 自动测试
- e2e：
  - 新建 profile。
  - 保存并重开后仍存在。

## 9. 用户模拟测试
1. 新建一个 DeepSeek profile。
2. 保存。
3. 关闭设置再重开，确认字段仍在。

## 10. 审计结论
- 审计状态：实现级文档已补齐。
