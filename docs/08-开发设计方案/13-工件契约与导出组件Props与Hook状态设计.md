# 13 工件契约与导出组件 Props 与 Hook 状态设计

## 1. 目标
把工件目录、节点 IO、阶段契约、导出映射和导出执行压到对象编辑器级。

## 2. 页面组件树
- `ArtifactCatalogPanel`
  - `ArtifactTree`
  - `ArtifactDetailCard`
- `StageContractEditor`
  - `ContractArtifactList`
  - `ContractRuleEditor`
- `NodeIoBindingEditor`
  - `InputArtifactSelector`
  - `OutputArtifactSelector`
  - `MessageChannelSelector`
  - `SignalChannelSelector`
- `ExportMappingEditor`
  - `FormatSwitch`
  - `ExportRuleList`
  - `OutputDirectoryForm`

## 3. Props 契约
- `StageContractEditor`
  - 输入：`contract`, `artifactCatalog`, `guardPreview`
  - 输出：`onChangeContract(patch)`, `onValidateContract()`
- `NodeIoBindingEditor`
  - 输入：`node`, `artifactCatalog`, `channelCatalog`
  - 输出：`onPatchNodeIo(patch)`
- `ExportMappingEditor`
  - 输入：`mapping`, `artifactCatalog`
  - 输出：`onPatchMapping(patch)`, `onRunExport()`

## 4. Hook 与状态归属
- `useArtifactCatalogState`
- `useStageContractDraftState`
- `useExportMappingState`
- `useExportRunState`

## 5. 方法级 I/O
- `ArtifactService.listCatalog(projectId): Promise<ArtifactCatalog>`
- `ContractService.validateStageContract(input): Promise<ContractValidationResult>`
- `ExportService.preview(input): Promise<ExportPreviewResult>`
- `ExportService.run(input): Promise<ExportRunResult>`

## 6. 持久化
- `contracts/*.json` 与 `export-mapping.json` 只在显式保存 Flow 时写盘
- 导出结果写 `<project>/exports/<timestamp>/`
- 导出失败只写 `export-report.json`，不得覆盖上次成功导出

## 7. 开发顺序
1. artifact catalog schema
2. contract schema + validator
3. export mapping schema + validator
4. artifact/catalog IPC
5. contract/export renderer editors
6. export runtime
7. export e2e + packaged verification

