# 12. 关键 Schema 示例

## 1. 目标

- 为实现、测试、文档维护提供当前代码已有明确 owner 的结构化样例。
- 本文只收录 `src/shared/types.ts` 中已经存在、且仍被当前代码使用的核心类型。
- 样例以字段语义为准，新增字段时不得改变已有核心字段含义。

## 2. 权威来源

- 当前权威类型文件：`src/shared/types.ts`
- 本文仅覆盖以下现行 schema：
  - `BootstrapData`
  - `RuntimeEvent`
  - `StageGuardStatus`
  - `RolePackageManifest`
  - `ContextPack`

## 3. BootstrapData 示例

对应类型：`BootstrapData`、`AppSettings`、`SidebarLayout`、`RecentProjectEntry`

```json
{
  "settings": {
    "theme": "light",
    "sidebar": {
      "leftWidth": 268,
      "rightWidth": 344,
      "leftCollapsed": false,
      "rightCollapsed": false,
      "activityView": "project",
      "processPanelOpen": true,
      "processPanelTab": "stage",
      "documentSplitOpen": false,
      "documentSplitRatio": 0.5
    },
    "debug": {
      "liveLogConsoleEnabled": false
    },
    "provider": "openai-compatible",
    "baseUrl": "http://127.0.0.1:11434/v1",
    "model": "qwen3:8b",
    "apiKeyMasked": "",
    "hasApiKey": false,
    "activeProviderProfileId": "provider-local-default",
    "providerProfiles": [],
    "recentProjects": [
      {
        "rootPath": "E:/workspace/client-plan",
        "name": "客户端方案工程",
        "alias": "client-plan",
        "lastOpenedAt": "2026-04-27T10:10:10.000Z",
        "available": true
      }
    ],
    "recentTemplates": [
      "software-factory"
    ],
    "recentResources": [],
    "recentDrafts": []
  },
  "project": null,
  "templates": [],
  "platform": null,
  "runtimeTemplate": null,
  "flowHistories": {},
  "sessions": [],
  "agentMemory": null,
  "reviewRounds": [],
  "installedSkills": [],
  "installedRolePackages": [],
  "projectSkillIds": [],
  "sessionSkillIds": {},
  "snapshots": [],
  "consistencyReport": null,
  "auditEntries": [],
  "recentDocumentChanges": [],
  "artifactRevisions": [],
  "artifactInvalidations": [],
  "runtimeRuns": [],
  "runtimeEvents": [],
  "runtimeCapabilities": [],
  "contextPacks": [],
  "knowledgeIndexState": null,
  "runtimeGovernorStatus": null,
  "noteReferenceGraph": null,
  "rulesDistillation": {
    "scopes": [],
    "globalRules": [],
    "projectRules": [],
    "nodeRules": [],
    "accumulationEntries": [],
    "promotionDrafts": [],
    "knowledgeGraph": {
      "generatedAt": "2026-04-27T10:10:10.000Z",
      "nodes": [],
      "edges": []
    }
  }
}
```

关键语义：

- `settings` 是应用级设置入口，不再使用旧的 `appMode`、`layoutState`、`activeProjectSummary`。
- `recentProjects` 的元素类型是 `RecentProjectEntry`，核心字段为 `rootPath`、`name`、`lastOpenedAt`、`available`。
- `recentTemplates` 是模板 ID 数组，不是模板对象数组。

## 4. RuntimeEvent 示例

对应类型：`RuntimeEvent`

```json
{
  "id": "evt-004",
  "runId": "run-20260427-001",
  "createdAt": "2026-04-27T10:13:10.000Z",
  "type": "model.selected",
  "message": "已为当前运行选择模型。",
  "metadata": {
    "providerProfileId": "ollama-local",
    "resolvedModel": "qwen3:8b",
    "roleId": "sf-role-plan"
  }
}
```

关键语义：

- 时间字段统一为 `createdAt`。
- 事件类型使用点分命名，如 `model.selected`、`run.started`、`tool.completed`。
- 补充信息写入 `metadata`，不是旧结构中的 `payload`。

## 5. StageGuardStatus 示例

对应类型：`StageGuardStatus`

```json
{
  "ok": false,
  "stage": "plan",
  "sessionId": "session-discover",
  "blockers": [
    "缺少 `01-requirements/03-功能树.md`，当前阶段不能确认。"
  ],
  "warnings": [
    "`01-requirements/02-需求澄清.md` 已存在，但需要重新校验质量分。"
  ],
  "artifacts": [
    {
      "path": "01-requirements/02-需求澄清.md",
      "title": "需求澄清",
      "purpose": "补全平台、限制、体验与边界条件。",
      "exists": true,
      "nonEmpty": true,
      "valid": true,
      "qualityTier": "strict",
      "qualityVerdict": "accepted",
      "qualityScore": 92,
      "qualityReasons": [
        "标题结构完整",
        "满足最小长度要求"
      ],
      "message": "可作为下游输入。"
    },
    {
      "path": "01-requirements/03-功能树.md",
      "title": "功能树",
      "purpose": "拆解用户视角与开发视角功能层级。",
      "exists": false,
      "nonEmpty": false,
      "valid": false,
      "message": "工件缺失。"
    }
  ],
  "lastSuccessfulRunId": "run-20260426-009"
}
```

关键语义：

- 顶层状态字段是 `ok`，不是 `ready`。
- 阻断和警告分别归入 `blockers`、`warnings`。
- 每个工件的检查结果写在 `artifacts` 中，不再使用旧的 `checkItems`、`targetRef` 结构。

## 6. RolePackageManifest 示例

对应类型：`RolePackageManifest`

```json
{
  "id": "role-planner",
  "name": "方案规划角色包",
  "version": "1.0.0",
  "description": "负责输出功能树、功能清单与技术方案的角色包。",
  "source": "project",
  "icon": "workflow",
  "domain": "software-factory",
  "tags": [
    "planning",
    "solution"
  ],
  "defaultSkillIds": [
    "product-requirements",
    "architecture-review"
  ],
  "allowedCapabilities": [
    "read_artifact",
    "write_artifact",
    "browse_web"
  ],
  "modelPolicy": {
    "mode": "prefer_list",
    "preferredProfileIds": [
      "ollama-local",
      "deepseek-cloud"
    ],
    "fallbackToActive": true
  },
  "dependencySpec": []
}
```

关键语义：

- manifest 当前只记录元数据和策略字段，不包含 `entryFiles`、`skillsDirectory` 之类目录布局信息。
- 能力字段名是 `allowedCapabilities`，不是 `allowedCapabilityIds`。
- 模型策略字段名是 `modelPolicy`，不是 `defaultModelPolicy`。

## 7. ContextPack 示例

对应类型：`ContextPack`、`ContextPackDocumentDigest`

```json
{
  "id": "ctx-20260427-001",
  "createdAt": "2026-04-27T10:20:10.000Z",
  "runId": "run-20260427-001",
  "sessionId": "session-discover",
  "stage": "plan",
  "roleId": "sf-role-plan",
  "systemPrompt": "你是方案规划角色，输出结构化 Markdown。",
  "userPrompt": "基于现有需求澄清，生成功能树与技术方案。",
  "compacted": true,
  "sourceMessageCount": 12,
  "retainedMessageCount": 5,
  "omittedMessageCount": 7,
  "anchorPaths": [
    "01-requirements/02-需求澄清.md",
    "02-solution/01-技术方案.md"
  ],
  "pinnedDocumentPaths": [
    "01-requirements/02-需求澄清.md"
  ],
  "excludedDocumentPaths": [],
  "changeRecordIds": [
    "change-20260427-001"
  ],
  "documentDigests": [
    {
      "path": "01-requirements/02-需求澄清.md",
      "excerpt": "本阶段需要明确输入输出合同、失败恢复与目录边界。",
      "modifiedAt": 1777279210000
    }
  ],
  "provenance": [
    "session:session-discover",
    "run:run-20260427-001"
  ],
  "rollingSummary": "已压缩早期对话，仅保留当前方案规划所需上下文。",
  "effectiveRuleIds": [
    "rule-output-contract"
  ],
  "knowledgeNodeIds": [
    "knowledge-export-boundary"
  ]
}
```

关键语义：

- `ContextPack` 是运行时上下文包，不是旧的“检索结果列表”。
- 文本入口字段是 `systemPrompt` 和 `userPrompt`。
- 压缩统计通过 `sourceMessageCount`、`retainedMessageCount`、`omittedMessageCount` 表达。
- 文档摘要写入 `documentDigests`，排除路径写入 `excludedDocumentPaths`。

## 8. 已删除的过时示例

以下旧示例不再保留，因为它们与当前 `src/shared/types.ts` 的现行 owner 不一致，或当前代码中没有同名权威类型：

- `document.save` 返回示例
- `runAccepted` 示例
- `FlowDraft` 示例

## 9. 维护要求

- 本文新增或修改 schema 时，必须先以 `src/shared/types.ts` 中的现行类型定义为准。
- 如果未来字段结构变化，先更新代码 owner，再更新本文样例。
- 不得把临时 IPC 包装、调试输出或历史对象重新写回本文作为“关键 schema”。
