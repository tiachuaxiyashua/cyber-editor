# INF-049 Table artifact adapter

## 1. 基本信息
- 类型：内部功能
- 所属层级：壳层与文档底座 / 编辑器底座 / 表格
- MSABC 分类：A
- 当前状态：已完成

## 2. 责任

`TableArtifactService` 是表格工件的唯一解析和写回 owner，负责把 CSV、TSV、XLSX 转成统一 `TableArtifactModel`，并通过 `ArtifactOpenPayload` 供工作台消费。

## 3. 代码 owner

| 层 | 文件 | 职责 |
|---|---|---|
| Service | `src/main/services/table-artifact-service.ts` | 格式识别、解析、归一化、大小限制、写回 |
| Project boundary | `src/main/services/project-service.ts` | 路径解析、快照、审计、变更记录、保存入口 |
| Shared contract | `src/shared/types.ts` | `TableArtifactModel`、`TableArtifactSheet`、`ArtifactOpenPayload` |
| Renderer | `src/renderer/components/TableArtifactView.tsx` | 展示、筛选、编辑和行列操作 |

## 4. 输入输出

| 方法 | 输入 | 输出 | 约束 |
|---|---|---|---|
| `canHandle(filePath)` | 文件路径 | boolean | 只识别 `.csv/.tsv/.xlsx` |
| `open(filePath)` | 文件路径 | `TableArtifactModel` | 文件必须存在且不超过 5MB |
| `save(filePath, model)` | 文件路径、模型 | void | 按文件格式写回 |
| `serializeText(model, format)` | 表格模型、`csv/tsv` | 文本 | 负责分隔符与引号转义 |
| `openArtifact(filePath)` | 文件路径 | `ArtifactOpenPayload` | 统一 table/image/diagram/mindmap/text/unsupported |

## 5. 归一化规则

1. 所有单元格统一转为字符串。
2. 第一行作为 `columns`。
3. 正文行进入 `rows`。
4. 行列数不一致时补空字符串，并追加 warning。
5. CSV/TSV 只产生一个 sheet。
6. XLSX 每个 worksheet 产生一个 sheet。

## 6. 错误边界

1. 不支持格式返回 unsupported，不抛给 Renderer 当作崩溃。
2. 文件不存在返回 unsupported 并带 `errorMessage`。
3. 超大表格在调用 XLSX parser 前阻断。
4. CSV/TSV 写回必须处理引号、换行和分隔符。

## 7. 测试证据

1. `tests/unit/table-artifact-service.test.ts`
   - CSV 解析和 warning。
   - XLSX 写回和重开。
   - 超大 XLSX 阻断。
2. `tests/e2e/table-artifact-workbench.spec.ts`
   - 用户从文件树打开 CSV、修改单元格并保存。

## 8. 不允许的错误实现

1. 不允许让不同页面各自解析表格。
2. 不允许跳过 `ProjectService.saveArtifact()` 直接写盘。
3. 不允许用 JSON 中间文件替代表格源文件。
