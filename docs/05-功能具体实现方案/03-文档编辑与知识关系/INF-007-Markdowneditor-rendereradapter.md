# INF-007 Markdown editor/renderer adapter

## 1. 基本信息
- 类型：内部能力
- 所属层级：壳层与文档底座 / 编辑器底座 / 适配
- MSABC 分类：M
- 当前状态：部分完成
- 对应功能：
  - [F-032 阅读/编辑/源码视图切换](./F-032-阅读-编辑-源码视图切换.md)
  - [F-033 文本录入与删除](./F-033-文本录入与删除.md)
  - [F-035 Markdown 结构化编辑](./F-035-Markdown结构化编辑.md)

## 2. 能力目标
- 为 Markdown 文档提供统一适配层，屏蔽阅读态、编辑态、源码态三个渲染器差异。
- 对外暴露统一接口：
  - `loadSource`
  - `setDraft`
  - `getDraft`
  - `switchMode`
  - `find`
  - `replace`
  - `getSelection`
  - `insertBlock`

## 3. 数据模型
- `DocumentEditorSession`
  - `docPath`
  - `source`
  - `draft`
  - `mode`
  - `selection`
  - `isDirty`
  - `lastRenderedAt`

## 4. 实现要求
### Renderer
- 该适配层必须是文档区唯一入口。
- 页面组件不允许分别直接操作阅读组件、编辑组件、源码组件的私有状态。

### Main / Service
- 不处理视图切换，但负责保存和冲突返回。

## 5. 边界与异常
- 任何块级渲染失败都不能污染 `draft`。
- 切换模式时必须保持草稿一致，不允许阅读态和编辑态分叉。

## 6. 自动测试
- unit：
  - 模式切换不丢草稿。
  - 查找替换接口在三态下行为一致。
- integration：
  - 页面通过统一适配层完成切换和保存。

## 7. 审计结论
- 审计状态：实现级文档已补齐，能力本身仍部分完成。
- 审计备注：另一套 AI 不能绕开该适配层直接把三种编辑器黏在页面里，否则主工作台行为会发散。
