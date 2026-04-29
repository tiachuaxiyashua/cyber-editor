# INF-050 Diagram/table embed-link resolver

## 1. 基本信息
- 类型：内部功能
- 所属层级：壳层与文档底座 / 图形渲染 / 嵌入与链接
- MSABC 分类：A
- 当前状态：部分完成

## 2. 责任

该能力负责把 Markdown 中的本地工件引用解析为统一打开或嵌入模型。当前实现分布在 `ArtifactReferenceDialog`、`MarkdownContent`、`ProjectService.resolveArtifactPath()` 和 `TableArtifactService.openArtifact()`，尚未抽成单独 resolver 服务。

## 3. 当前实现链路

1. 插入入口：
   - `ArtifactReferenceDialog` 选择工程内文件。
   - 链接模式写入 wiki link 或本地链接。
   - 嵌入模式写入本地图片/嵌入语法。
2. 阅读态解析：
   - `MarkdownContent` 将本地链接渲染为 `inline-artifact-link`。
   - `MarkdownContent` 将本地图片目标交给 `EmbeddedArtifact`。
3. 主进程解析：
   - `ProjectService.resolveArtifactPath(targetPath, sourcePath)` 以源文档目录为相对路径基准。
   - `ProjectService.openArtifact()` 返回统一 payload。
4. 类型分流：
   - `TableArtifactService.openArtifact()` 按扩展名分流 table/image/diagram/mindmap/text/unsupported。

## 4. Payload 规则

| `kind` | 来源扩展名 | Renderer 展示 |
|---|---|---|
| `table` | `.csv/.tsv/.xlsx` | 表格预览或 `TableArtifactView` |
| `image` | `.png/.jpg/.jpeg/.gif/.webp/.svg/.bmp` | 图片工件卡片 |
| `diagram` | `.mmd/.mermaid` | `MermaidBlock` |
| `mindmap` | `.mindmap/.markmap` | `MindMapBlock` |
| `text` | `.md/.markdown/.txt` | 文本摘要 |
| `unsupported` | 其他或缺失 | 错误/不支持状态 |

## 5. 当前差距

1. resolver 逻辑还分散在 Markdown 组件和服务层，尚未形成独立 `ArtifactReferenceResolver`。
2. 循环嵌入检测尚未实现。
3. 嵌入错误状态已有基础展示，但缺少统一错误码。

## 6. 测试证据

1. `tests/e2e/table-artifact-workbench.spec.ts` 验证表格链接和嵌入。
2. `tests/unit/markdown-content.test.ts` 验证本地链接渲染。
3. `tests/unit/table-artifact-service.test.ts` 验证 artifact payload 分流。

## 7. 不允许的错误实现

1. 不允许把链接与嵌入混成一种普通文本语法。
2. 不允许绕过 `ProjectService.resolveArtifactPath()`。
3. 不允许对缺失工件静默空白。
