# 10 IPC 完整接口表

## 1. 目标
把主进程对 Renderer 暴露的接口固定成唯一集合，防止不同页面定义不同语义的同类 IPC。

## 2. 通用规则
1. IPC 名称使用 `domain.action`。
2. 成功返回值必须是对象。
3. 失败必须返回统一错误对象。
4. 会影响主工作台状态的 IPC，必须返回足够同步 UI 的结构化结果。

## 3. bootstrap / app mode
| IPC | 输入 | 成功输出 | 副作用 | 失败码 |
|---|---|---|---|---|
| `bootstrap.load` | 无 | `bootstrap` | 无 | `bootstrap_load_failed` |
| `app.setTheme` | `theme` | `themeState` | 持久化主题 | `invalid_theme` |
| `layout.save` | `layoutState` | `layoutState` | 持久化布局 | `layout_save_failed` |

## 4. project
| IPC | 输入 | 成功输出 | 副作用 | 失败码 |
|---|---|---|---|---|
| `project.create` | `projectName,parentDirectory,createNewFolder,templateId?` | `projectSummary,bootstrap` | 创建目录、脚手架、最近工程 | `invalid_project_name`,`invalid_parent_directory`,`project_root_exists`,`template_not_found`,`template_invalid` |
| `project.open` | `projectRootPath` | `bootstrap` | 载入工程、最近工程 | `project_not_found`,`project_manifest_invalid` |
| `project.close` | 无 | `bootstrap` | 清空活动工程 | `project_close_failed` |
| `project.revealInSystem` | `projectRootPath` | `revealed:true` | 打开系统目录 | `path_not_found` |
| `project.exportPackage` | `projectRootPath,targetPath` | `exportResult` | 导出工程包 | `export_failed` |

## 5. document / artifact
| IPC | 输入 | 成功输出 | 副作用 | 失败码 |
|---|---|---|---|---|
| `document.open` | `docPath` | `documentPayload` | 打开标签 | `document_not_found`,`document_unsupported` |
| `document.save` | `docPath,draft,expectedVersion?` | `saveResult,bootstrapDelta` | 写文件、刷新索引/引用 | `document_conflict`,`document_save_failed`,`version_mismatch` |
| `document.rename` | `path,newName` | `projectSummary,bootstrapDelta` | 改名 | `path_not_found`,`name_invalid`,`name_conflict` |
| `document.delete` | `path` | `projectSummary,bootstrapDelta` | 删除文件/目录 | `path_not_found`,`delete_denied` |
| `document.import` | `sourcePath,targetDirectory` | `projectSummary,openedDocument?,bootstrapDelta` | 复制导入 | `import_failed`,`unsupported_format` |
| `artifact.open` | `artifactRef` | `artifactPayload` | 打开工件视图 | `artifact_not_found`,`artifact_invalid` |
| `artifact.export` | `mappingId|exportRequest` | `exportResult` | 生成导出 | `mapping_not_found`,`export_failed` |

## 6. session / runtime / stage
| IPC | 输入 | 成功输出 | 副作用 | 失败码 |
|---|---|---|---|---|
| `session.list` | `projectId?` | `sessions[]` | 无 | `session_list_failed` |
| `session.create` | `name?,stageId?` | `sessionSummary` | 新建会话 | `session_create_failed` |
| `session.update` | `sessionId,patch` | `sessionSummary` | 重命名/归档/置顶 | `session_not_found` |
| `session.delete` | `sessionId` | `deleted:true` | 删除会话 | `session_not_found`,`session_delete_denied` |
| `session.sendMessage` | `sessionId,message,attachedDocuments[],attachedImages[]` | `runAccepted` | 创建 run | `session_not_found`,`provider_unavailable`,`message_empty` |
| `runtime.stop` | `runId` | `runStatus` | 停止运行 | `run_not_found`,`run_not_stoppable` |
| `runtime.retry` | `runId` | `runAccepted` | 新建 run | `run_not_found`,`retry_not_allowed` |
| `stage.guard` | `stageId` | `StageGuardStatus` | 校验阶段 | `stage_not_found`,`guard_failed` |
| `stage.generateDraft` | `stageId,sessionId?` | `runAccepted` | 创建阶段草稿 run | `stage_not_found`,`guard_blocked`,`provider_unavailable` |
| `stage.confirm` | `stageId` | `confirmed,blockingReasons[]` | 变更阶段状态 | `stage_not_found`,`guard_blocked`,`confirm_failed` |

## 7. flow / orchestration
| IPC | 输入 | 成功输出 | 副作用 | 失败码 |
|---|---|---|---|---|
| `flow.list` | `scope?` | `flowSummaries[]` | 无 | `flow_list_failed` |
| `flow.open` | `flowId` | `flowDraft` | 载入草稿 | `flow_not_found`,`flow_invalid` |
| `flow.create` | `name,templateId?,scope` | `flowDraft` | 新建草稿 | `flow_name_invalid`,`flow_create_failed` |
| `flow.save` | `flowDraft` | `flowDraft,saveMeta` | 持久化草稿 | `flow_invalid`,`flow_save_failed` |
| `flow.duplicate` | `flowId` | `flowDraft` | 复制 Flow | `flow_not_found` |
| `flow.import` | `filePath` | `flowDraft,importMeta` | 导入 Flow 包 | `flow_import_failed`,`flow_invalid` |
| `flow.export` | `flowId,targetPath?` | `exportMeta` | 导出 Flow 包 | `flow_not_found`,`flow_export_failed` |
| `flow.snapshot.create` | `flowId` | `snapshotMeta` | 写快照 | `flow_not_found`,`snapshot_failed` |
| `flow.snapshot.restore` | `flowId,snapshotId` | `flowDraft` | 恢复快照 | `snapshot_not_found`,`snapshot_restore_failed` |
| `flow.run` | `flowId,runMode,entryNodeId?` | `runAccepted` | 创建 Flow run | `flow_not_found`,`flow_invalid`,`run_blocked` |
| `node.debug` | `flowId,nodeId,debugPayload` | `runAccepted` | 节点调试 | `node_not_found`,`debug_not_allowed` |

## 8. template
| IPC | 输入 | 成功输出 | 副作用 | 失败码 |
|---|---|---|---|---|
| `template.list` | `query?,filters?` | `templates[]` | 无 | `template_list_failed` |
| `template.details` | `templateId` | `templateDetails` | 无 | `template_not_found` |
| `template.installFromDirectory` | `directoryPath` | `templateMeta` | 安装模板 | `template_invalid`,`template_install_failed` |
| `template.installFromRemote` | `sourceId,templateId` | `templateMeta` | 下载并安装 | `remote_unreachable`,`template_invalid`,`trust_denied` |
| `template.saveCurrentProject` | `projectId,name,version` | `templateMeta` | 保存模板 | `project_not_found`,`template_save_failed` |
| `template.startFlow` | `templateId` | `bootstrap` | 进入无工程编排或工作台 | `template_not_found`,`template_invalid`,`default_flow_missing` |
| `template.update` | `templateId` | `templateMeta` | 更新模板 | `template_not_found`,`update_failed` |
| `template.remove` | `templateId` | `removed:true` | 删除模板 | `template_not_found`,`template_in_use` |

## 9. skill / connector / provider
| IPC | 输入 | 成功输出 | 副作用 | 失败码 |
|---|---|---|---|---|
| `skill.listInstalled` | 无 | `skills[]` | 无 | `skill_list_failed` |
| `skill.listAvailable` | `source?` | `skills[]` | 无 | `skill_list_failed` |
| `skill.installFromDirectory` | `directoryPath` | `skillMeta` | 安装技能 | `skill_invalid`,`skill_install_failed` |
| `skill.installFromRemote` | `itemId,sourceId?` | `skillMeta` | 下载并安装 | `remote_unreachable`,`skill_invalid`,`trust_denied` |
| `skill.setScope` | `skillId,scope` | `scopeState` | 修改作用域 | `skill_not_found`,`scope_invalid` |
| `skill.remove` | `skillId` | `removed:true` | 删除技能 | `skill_not_found`,`skill_in_use` |
| `connector.list` | 无 | `connectors[]` | 无 | `connector_list_failed` |
| `connector.healthCheck` | `connectorId` | `healthState` | 更新诊断结果 | `connector_not_found`,`health_check_failed` |
| `provider.listProfiles` | 无 | `profiles[]` | 无 | `provider_list_failed` |
| `provider.saveProfile` | `profileDraft` | `profile` | 保存配置 | `provider_invalid`,`provider_save_failed` |
| `provider.deleteProfile` | `profileId` | `removed:true` | 删除 profile | `profile_not_found`,`profile_in_use` |
| `provider.activateProfile` | `profileId` | `activeProfile` | 激活 profile | `profile_not_found`,`provider_activate_failed` |
| `provider.test` | `profileId` | `diagnosticResult` | 写入诊断结果 | `profile_not_found`,`provider_unreachable` |

## 10. knowledge index
| IPC | 输入 | 成功输出 | 副作用 | 失败码 |
|---|---|---|---|---|
| `knowledge.status` | `projectId?` | `indexStatus` | 无 | `index_status_failed` |
| `knowledge.refresh` | `scope` | `refreshAccepted` | 启动索引刷新 | `refresh_failed` |
| `knowledge.search` | `query,scope,options` | `results[]` | 无 | `search_failed` |
| `knowledge.contextPack` | `taskId|query,include[],exclude[]` | `contextPack` | 无 | `context_pack_failed` |
| `knowledge.citationDetails` | `citationId` | `citationDetail` | 无 | `citation_not_found` |

## 11. 唯一性要求
1. 本表定义的是“接口集合和语义”，不是建议。
2. 可以增加内部 helper，但不能绕过这里定义的 IPC 语义。
3. 同一动作不得出现两套成功结构。
