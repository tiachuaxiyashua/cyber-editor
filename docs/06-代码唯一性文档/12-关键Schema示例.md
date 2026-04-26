# 12 关键 Schema 示例

## 1. 目标
- 给另一套 AI 提供足够明确的结构化样例，减少字段解释偏差。

## 2. bootstrap 示例
```json
{
  "appMode": "workspace",
  "recentProjects": [
    {
      "projectId": "p-workbench-01",
      "projectName": "客户管理方案",
      "projectRootPath": "E:/workspace/client-plan",
      "templateId": "software-factory",
      "lastOpenedAt": "2026-04-09T10:10:10.000Z",
      "activeFlowId": "flow-main"
    }
  ],
  "recentTemplates": [
    {
      "id": "novel-studio",
      "name": "小说创作",
      "version": "1.2.0",
      "trustState": "trusted"
    }
  ],
  "activeProjectSummary": {
    "projectId": "p-workbench-01",
    "projectName": "客户管理方案",
    "projectRootPath": "E:/workspace/client-plan",
    "templateId": "software-factory",
    "lastOpenedAt": "2026-04-09T10:10:10.000Z",
    "activeFlowId": "flow-main"
  },
  "layoutState": {
    "theme": "light",
    "leftSidebarWidth": 268,
    "rightSidebarWidth": 344,
    "bottomPanelHeight": 220,
    "activeActivity": "project"
  }
}
```

## 3. document.save 返回示例
```json
{
  "saveResult": {
    "docPath": "01-requirements/01-需求.md",
    "version": 12,
    "savedAt": "2026-04-09T10:12:10.000Z",
    "dirty": false
  },
  "bootstrapDelta": {
    "referenceGraphChanged": true,
    "openDocuments": [
      {
        "path": "01-requirements/01-需求.md",
        "dirty": false,
        "version": 12
      }
    ]
  }
}
```

## 4. runAccepted 示例
```json
{
  "runAccepted": {
    "runId": "run-20260409-001",
    "sessionId": "session-discover",
    "trigger": "stage_draft",
    "status": "queued"
  }
}
```

## 5. RuntimeEvent 示例
```json
{
  "id": "evt-004",
  "runId": "run-20260409-001",
  "type": "model_selected",
  "timestamp": "2026-04-09T10:13:10.000Z",
  "payload": {
    "providerProfileId": "ollama-local",
    "resolvedModel": "qwen3:8bm",
    "roleBindingId": "role-planner"
  }
}
```

## 6. StageGuardStatus 示例
```json
{
  "stageId": "plan",
  "ready": false,
  "blockingReasons": [
    {
      "code": "missing_artifact",
      "message": "缺少功能树文档",
      "targetRef": "artifact:function-tree"
    }
  ],
  "checkItems": [
    {
      "id": "check-requirement-doc",
      "status": "pass",
      "message": "原始需求已存在",
      "targetRef": "artifact:requirement"
    },
    {
      "id": "check-function-tree",
      "status": "block",
      "message": "功能树尚未生成",
      "targetRef": "artifact:function-tree"
    }
  ]
}
```

## 7. FlowDraft 示例
```json
{
  "id": "flow-main",
  "name": "软件工厂主流程",
  "templateId": "software-factory",
  "inputDirectory": "01-input",
  "outputDirectory": "02-output",
  "nodes": [
    {
      "id": "node-start",
      "type": "start",
      "label": "开始",
      "position": { "x": 120, "y": 140 },
      "config": {},
      "roleBindingId": null,
      "connectorBindingId": null,
      "toolBindingId": null,
      "inputBindings": [],
      "outputBindings": []
    },
    {
      "id": "node-plan",
      "type": "agent",
      "label": "规划角色",
      "position": { "x": 380, "y": 140 },
      "config": {
        "rolePackageId": "role-planner",
        "stageId": "plan"
      },
      "roleBindingId": "role-planner",
      "connectorBindingId": null,
      "toolBindingId": null,
      "inputBindings": [
        {
          "kind": "artifact",
          "ref": "artifact:requirement"
        }
      ],
      "outputBindings": [
        {
          "kind": "artifact",
          "ref": "artifact:function-tree"
        }
      ]
    }
  ],
  "edges": [
    {
      "id": "edge-start-plan",
      "sourceNodeId": "node-start",
      "targetNodeId": "node-plan",
      "channelType": "control",
      "mapping": {}
    }
  ],
  "stageContracts": [],
  "exportMappings": [],
  "updatedAt": "2026-04-09T10:20:10.000Z",
  "version": 8
}
```

## 8. RolePackageManifest 示例
```json
{
  "id": "role-planner",
  "name": "规划角色",
  "version": "1.0.0",
  "entryFiles": {
    "identity": "IDENTITY.md",
    "soul": "SOUL.md",
    "agents": "AGENTS.md",
    "user": "USER.md",
    "memory": "MEMORY/MEMORY.md"
  },
  "skillsDirectory": "Skills",
  "defaultSkillIds": [
    "product-requirements",
    "market-strategy"
  ],
  "allowedCapabilityIds": [
    "document.read",
    "artifact.write",
    "knowledge.search"
  ],
  "defaultModelPolicy": {
    "mode": "prefer_list",
    "preferredProfiles": [
      "ollama-local",
      "deepseek-cloud"
    ]
  }
}
```

## 9. contextPack 示例
```json
{
  "contextPackId": "ctx-20260409-001",
  "query": "整理软件工厂的导出流程",
  "items": [
    {
      "kind": "document",
      "path": "01-需求.md",
      "reason": "关键词命中 + 引用扩展"
    },
    {
      "kind": "artifact",
      "ref": "artifact:export-mapping",
      "reason": "阶段必需工件"
    }
  ],
  "estimatedTokens": 5200,
  "excludedRefs": []
}
```

## 10. 唯一性要求
- 这些示例不是“参考写法”，而是结构基准。
- 允许新增扩展字段，但不得删改这里的核心字段语义。

