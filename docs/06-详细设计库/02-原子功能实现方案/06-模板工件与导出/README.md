# 模板工件与导出

负责模板工件目录、阶段输出契约、节点 IO 契约、导出映射和交付包。

## 共享代码边界
- `src/main/services/runtime-asset-service.ts`
- `src/main/services/delivery-export-service.ts`
- `src/main/services/runtime-service.ts`
- `src/shared/artifact-validators.ts`

## 共享数据结构
- RuntimeTemplateAsset
- ArtifactDefinition
- Stage Output Contract
- Node IO Contract
- RuntimeTemplateExportMapping

## 共享实现要求
### 前端/交互
- 编排页左侧资产区必须可见工件目录；Inspector 必须能编辑阶段输出契约、节点 IO 和导出映射。
- 编排页还必须允许编辑 Flow 输入目录和 Flow 输出目录。
- 流程面板和导出入口要显示工件完成状态与导出前校验结果。

### 主进程/服务
- RuntimeAssetService 负责模板资产读写和导出映射持久化。
- DeliveryExportService 负责 md/txt/pdf/openspec 交付。

### 数据与持久化
- 中间输出与正式工件必须分开存储。
- 导出物读取的是已通过校验的工件，不直接读聊天文本。
- Flow 输入目录和输出目录是 Flow 级元数据，不是某个角色的属性。

### 校验与异常
- 阶段 guard 必须与工件完成状态联动。
- 导出前必须做缺失项、格式、阻塞 issue 三类校验。

### 自动化测试
- e2e：工件目录查看、导出映射、完整导出。
- unit：工件 validator、导出包生成。

## 本分类原子功能
- [F-087 模板工件目录查看](./F-087-模板工件目录查看.md) - S / 部分完成
- [F-114 Flow 输入文档目录配置](./F-114-Flow输入文档目录配置.md) - S / 未完成
- [F-115 Flow 输出文档目录配置](./F-115-Flow输出文档目录配置.md) - S / 未完成
- [F-088 阶段输出契约配置](./F-088-阶段输出契约配置.md) - S / 未完成
- [F-089 节点输入输出工件绑定](./F-089-节点输入输出工件绑定.md) - S / 未完成
- [F-090 导出映射配置](./F-090-导出映射配置.md) - A / 未完成
- [F-091 运行输出落到工件并显示完成状态](./F-091-运行输出落到工件并显示完成状态.md) - S / 部分完成
- [F-092 导出 md/txt/pdf](./F-092-导出md-txt-pdf.md) - S / 已完成
- [F-093 导出 openspec 文件夹](./F-093-导出openspec文件夹.md) - S / 已完成
- [F-094 软件工厂默认模板闭环](./F-094-软件工厂默认模板闭环.md) - S / 部分完成
- [INF-034 Artifact catalog service](./INF-034-Artifactcatalogservice.md) - S / 部分完成
- [INF-052 Flow IO directory service](./INF-052-FlowIOdirectoryservice.md) - S / 未完成
- [INF-035 Node IO contract service](./INF-035-NodeIOcontractservice.md) - S / 未完成
- [INF-036 Export mapping service](./INF-036-Exportmappingservice.md) - A / 未完成
- [INF-044 Delivery export service](./INF-044-Deliveryexportservice.md) - S / 已完成
- [INF-045 OpenSpec exporter](./INF-045-OpenSpecexporter.md) - S / 已完成
