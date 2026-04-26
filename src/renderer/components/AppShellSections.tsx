import {
  Archive,
  CheckCheck,
  ChevronDown,
  Download,
  FileText,
  FilePlus2,
  FileSearch,
  FileUp,
  FolderOpen,
  FolderPlus,
  History,
  MessageSquare,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Share2,
  Settings2,
  Trash2,
  Workflow,
  X,
  type LucideIcon
} from 'lucide-react';
import { memo, useMemo } from 'react';
import type { FileNode } from '../../shared/types';
import {
  CollapseButton,
  EmptyBlock,
  IconButton,
  ProcessTabButton,
  SidebarHeader
} from './ShellPrimitives';
import { StageBadge } from './StageBadge';

function formatMessageTime(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripStageSuffix(title: string | undefined, stageLabel: string) {
  const trimmedTitle = title?.trim() ?? '';
  if (!trimmedTitle) {
    return '';
  }
  return trimmedTitle.replace(new RegExp(`\\s*[·-]\\s*${escapeRegExp(stageLabel)}$`), '').trim();
}

type TopbarMenuSectionItem = {
  id: string;
  label: string;
  description: string;
  disabled?: boolean;
  run: () => void;
};

export function TopbarMenuButton({
  title,
  icon: Icon,
  open,
  sections,
  onToggle,
  onRun
}: {
  title: string;
  icon: LucideIcon;
  open: boolean;
  sections: TopbarMenuSectionItem[][];
  onToggle: () => void;
  onRun: (action: () => void) => void;
}) {
  return (
    <div className="topbar-menu-group">
      <button
        type="button"
        className={`topbar-menu-trigger ${open ? 'active' : ''}`}
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={onToggle}
      >
        <Icon size={16} strokeWidth={1.8} />
        <span className="topbar-menu-label">{title}</span>
        <ChevronDown size={12} strokeWidth={1.8} />
      </button>
      {open ? (
        <div className="topbar-dropdown" role="menu" aria-label={title}>
          {sections.map((section, index) => (
            <div key={`${title}-${index}`} className="topbar-dropdown-section">
              {section.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="topbar-dropdown-item"
                  disabled={item.disabled}
                  onClick={() => onRun(item.run)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type WorkbenchTreeEntry = {
  path: string;
  name: string;
};

type WorkbenchTreeGroup = {
  id: string;
  label: string;
  entries: WorkbenchTreeEntry[];
};

function collectWorkbenchEntries(nodes: FileNode[] | undefined, entries: WorkbenchTreeEntry[]) {
  for (const node of nodes ?? []) {
    if (node.type === 'file') {
      entries.push({ path: node.path, name: node.name });
      continue;
    }
    collectWorkbenchEntries(node.children, entries);
  }
}

function buildWorkbenchTreeGroups(nodes: FileNode[] | undefined): WorkbenchTreeGroup[] {
  const groups: WorkbenchTreeGroup[] = [];

  for (const node of nodes ?? []) {
    if (node.type === 'directory') {
      const entries: WorkbenchTreeEntry[] = [];
      collectWorkbenchEntries(node.children, entries);
      groups.push({
        id: node.path,
        label: node.name,
        entries
      });
      continue;
    }

    groups.push({
      id: node.path,
      label: 'workspace',
      entries: [{ path: node.path, name: node.name }]
    });
  }

  return groups.filter((group) => group.entries.length);
}

function resolveWorkbenchPaneQuery(groups: WorkbenchTreeGroup[], activeDocumentPath?: string) {
  const activeGroup = groups.find((group) => group.entries.some((entry) => entry.path === activeDocumentPath));
  const fallbackGroup = groups[0];
  const label = (activeGroup ?? fallbackGroup)?.label ?? 'docs';
  return `${label.toLowerCase()}/`;
}

function WorkbenchTreeList({
  groups,
  activePath,
  onOpen,
  onRename,
  onMove,
  onDelete
}: {
  groups: WorkbenchTreeGroup[];
  activePath?: string;
  onOpen: (filePath: string) => void;
  onRename: (filePath: string) => void;
  onMove: (filePath: string) => void;
  onDelete: (filePath: string) => void;
}) {
  if (!groups.length) {
    return <EmptyBlock title="还没有可展示的文件" description="先导入文档或创建工程文件，左栏列表就会出现在这里。" />;
  }

  return (
    <div className="tree-panel workbench-tree-panel">
      {groups.map((group) => (
        <section key={group.id} className="workbench-tree-group">
          <div className="tree-section-title">{group.label} / {group.entries.length}</div>
          {group.entries.map((entry) => (
            <div
              key={entry.path}
              className={`workbench-pane-row ${activePath === entry.path ? 'active' : ''}`}
            >
              <button
                type="button"
                className={`tree-item workbench-pane-item ${activePath === entry.path ? 'active' : ''}`}
                onClick={() => onOpen(entry.path)}
                title={entry.name}
                data-testid="workbench-tree-file"
                data-file-name={entry.name}
              >
                <span>{entry.name}</span>
              </button>
              <div className="tree-node-actions workbench-pane-actions">
                <button type="button" title="重命名" aria-label={`重命名 ${entry.name}`} onClick={() => onRename(entry.path)}>
                  <Pencil size={12} strokeWidth={1.8} />
                </button>
                <button type="button" title="移动" aria-label={`移动 ${entry.name}`} onClick={() => onMove(entry.path)}>
                  <FolderOpen size={12} strokeWidth={1.8} />
                </button>
                <button type="button" title="删除" aria-label={`删除 ${entry.name}`} onClick={() => onDelete(entry.path)}>
                  <Trash2 size={12} strokeWidth={1.8} />
                </button>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function SidebarViewComponent(props: any) {
  const {
    layout,
    project,
    activeDocumentPath,
    activeSession,
    visibleSessions,
    archivedSessions,
    filteredTree,
    installedSkills,
    projectSkillIds,
    activeSessionSkillIds,
    skillCatalog,
    settings,
    treeFilter,
    searchQuery,
    catalogUrl,
    resourcePackageUrl,
    setTreeFilter,
    setSearchQuery,
    openCommandPalette,
    createFile,
    createDirectory,
    createFileAt,
    createDirectoryAt,
    renameEntryAt,
    moveEntryAt,
    deleteEntryAt,
    renameActiveEntry,
    deleteActiveEntry,
    importDocumentsIntoProject,
    createSession,
    renameSession,
    toggleSessionFlag,
    deleteSession,
    openDocument,
    openDocumentInWindow,
    openSearchResult,
    chooseSkillCatalogSource,
    loadSkillCatalog,
    installSkill,
    importLocalSkill,
    deleteSkill,
    toggleProjectSkill,
    toggleSessionSkill,
    testAiConnection,
    setSettingsOpen,
    patchSidebar,
    projectSearchResults,
    projectSearching,
    setActiveSessionId,
    setResourceInstallDialogOpen,
    stageLabels,
    fileName,
    providerLabel
  } = props;
  const workbenchTreeGroups = useMemo(
    () => buildWorkbenchTreeGroups(filteredTree),
    [filteredTree]
  );
  const workbenchPaneQuery = useMemo(
    () => resolveWorkbenchPaneQuery(workbenchTreeGroups, activeDocumentPath),
    [workbenchTreeGroups, activeDocumentPath]
  );

  if (layout.activityView === 'sessions') {
    return (
      <>
        <SidebarHeader title="会话" description={`${visibleSessions.length} 个活跃会话`} actions={<><IconButton title="新建会话" onClick={() => createSession()} icon={Plus} /><IconButton title="收起侧栏" onClick={() => patchSidebar({ leftCollapsed: true })} icon={X} /></>} />
        <div className="sidebar-content session-sidebar-content">
          <section className="project-sidebar-overview session-sidebar-overview">
            <div className="project-sidebar-metric">
              <span>活跃会话</span>
              <strong>{visibleSessions.length}</strong>
            </div>
            <div className="project-sidebar-metric">
              <span>当前阶段</span>
              <strong>{activeSession ? stageLabels[activeSession.stage] : '未选择'}</strong>
            </div>
            <div className="project-sidebar-metric">
              <span>已归档</span>
              <strong>{archivedSessions.length}</strong>
            </div>
          </section>
          <section className="sidebar-section">
            <div className="workspace-subhead">
              <div>
                <div className="section-kicker">会话列表</div>
                <strong>切换 AI 协作的上下文，而不是切走工作台</strong>
              </div>
            </div>
            {visibleSessions.length ? visibleSessions.map((session: any) => (
              <div key={session.id} className={`list-card session-card ${session.id === activeSession?.id ? 'active' : ''}`}>
                <button type="button" className="session-main" onClick={() => setActiveSessionId?.(session.id)}>
                  <div className="session-main-copy">
                    <strong>{session.title}</strong>
                    <div className="muted-line">{session.summary || '暂无摘要'}</div>
                  </div>
                  <StageBadge stage={session.stage} />
                </button>
                <div className="card-actions">
                  <IconButton title={session.pinned ? '取消固定' : '固定会话'} onClick={() => toggleSessionFlag(session.id, 'pinned')} icon={Pin} active={session.pinned} />
                  <IconButton title="重命名会话" onClick={() => renameSession(session.id, session.title)} icon={Pencil} />
                  <IconButton title="归档会话" onClick={() => toggleSessionFlag(session.id, 'archived')} icon={Archive} />
                  <IconButton title="删除会话" onClick={() => deleteSession(session.id)} icon={Trash2} variant="danger" />
                </div>
              </div>
            )) : <EmptyBlock title="还没有会话" description="先从右侧 AI 输入框发起一次协作，这里就会开始沉淀你的会话轨迹。" />}
          </section>
          {archivedSessions.length ? <section className="sidebar-section"><div className="section-kicker">已归档</div>{archivedSessions.map((session: any) => <div key={session.id} className="list-card compact-row"><div><strong>{session.title}</strong><div className="muted-line">{session.summary}</div></div><button type="button" className="button-secondary" onClick={() => toggleSessionFlag(session.id, 'archived')}>恢复</button></div>)}</section> : null}
        </div>
      </>
    );
  }

  if (layout.activityView === 'resources') {
    return (
      <>
        <SidebarHeader title="资源" description="浏览已安装技能，安装和导入都通过头部图标进入" actions={<><IconButton title="选择技能目录" onClick={() => void chooseSkillCatalogSource()} icon={FolderOpen} /><IconButton title="刷新技能目录" onClick={() => loadSkillCatalog()} icon={RefreshCw} /><IconButton title="导入本地技能" onClick={() => void importLocalSkill()} icon={Download} /><IconButton title="安装远程资源包" onClick={() => setResourceInstallDialogOpen(true)} icon={Plus} /><IconButton title="收起侧栏" onClick={() => patchSidebar({ leftCollapsed: true })} icon={X} /></>} />
        <div className="sidebar-content skills-sidebar">
          <section className="sidebar-section skill-source-panel slim">
            <div className="skill-page-callout">
              <strong>能力目录</strong>
              <p>安装和导入只通过头部图标触发。侧栏本身只保留结果和状态，避免把操作噪音堆在第一页。</p>
              <div className="muted-inline">{catalogUrl ? `当前目录：${catalogUrl}` : '当前目录：使用默认目录或你刚选择的本地目录'}</div>
              <div className="muted-inline">{resourcePackageUrl ? `待安装地址：${resourcePackageUrl}` : '远程安装会通过单独对话框处理'}</div>
            </div>
          </section>
          <section className="sidebar-section">
            <div className="section-kicker">已安装技能</div>
            {installedSkills.length ? (
              <div className="list-stack">
                {installedSkills.map((skill: any) => (
                  <div key={skill.id} className="list-card skill-card">
                    <div className="skill-card-head">
                      <div className="skill-card-copy">
                        <strong>{skill.name}</strong>
                        <div className="muted-line">{skill.description}</div>
                      </div>
                      <span className="small-tag">{skill.version}</span>
                    </div>
                    <div className="tag-cloud">
                      <label className="toggle-chip"><input type="checkbox" checked={projectSkillIds.includes(skill.id)} onChange={() => void toggleProjectSkill(skill.id)} />工程默认</label>
                      <label className="toggle-chip"><input type="checkbox" checked={activeSessionSkillIds.includes(skill.id)} onChange={() => void toggleSessionSkill(skill.id)} disabled={!activeSession} />当前会话</label>
                    </div>
                    <div className="skill-card-footer">
                      <span className="muted-inline">来源：本地技能目录</span>
                      <div className="icon-actions">
                        <IconButton title="删除技能" onClick={() => void deleteSkill(skill.id)} icon={Trash2} variant="danger" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyBlock title="还没有已安装的技能" description="先加载目录索引，或直接导入一个本地技能包。" />
            )}
          </section>
          <section className="sidebar-section">
            <div className="section-kicker">目录中的技能</div>
            {skillCatalog.length ? (
              <div className="list-stack">
                {skillCatalog.map((item: any) => (
                  <div key={item.id} className="list-card skill-card">
                    <div className="skill-card-head">
                      <div className="skill-card-copy">
                        <strong>{item.name}</strong>
                        <div className="muted-line">{item.description}</div>
                      </div>
                      <span className="small-tag">{item.source}</span>
                    </div>
                    <div className="tag-cloud">
                      {item.applicableStages.map((stage: string) => <span key={stage} className="small-tag">{stageLabels[stage]}</span>)}
                    </div>
                    <div className="skill-card-footer">
                      <span className="muted-inline">{item.packageUrl ? '可直接安装' : '当前目录仅提供说明'}</span>
                      <button type="button" className="button-secondary" onClick={() => void installSkill(item.packageUrl)} disabled={!item.packageUrl}>安装</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyBlock title="尚未加载技能目录" description="点击顶部的“加载目录”后，这里会出现可安装的能力包。" />
            )}
          </section>
        </div>
      </>
    );
  }

  if (layout.activityView === 'search') {
    return (
      <>
        <SidebarHeader title="搜索" description="在工程内查找文档正文" actions={<IconButton title="收起侧栏" onClick={() => patchSidebar({ leftCollapsed: true })} icon={X} />} />
        <div className="sidebar-content">
          <section className="sidebar-section">
            <label className="sidebar-search-field">
              <Search size={14} strokeWidth={1.8} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索文档正文或标题…" />
            </label>
          </section>
          <section className="sidebar-section">
            <div className="section-kicker">结果 {projectSearching ? '（搜索中）' : ''}</div>
            {projectSearchResults.length ? projectSearchResults.map((result: any) => <button key={`${result.path}:${result.line}:${result.column}`} type="button" className="list-row-button search-result-card" onClick={() => void openSearchResult(result)}><span>{result.name}</span><span className="muted-inline">{`第 ${result.line} 行，第 ${result.column} 列 · 共 ${result.matchCount} 处命中`}</span><span className="muted-line">{result.preview}</span></button>) : <EmptyBlock title="没有匹配结果" description="输入关键词后将在当前工程中搜索 Markdown 和 txt 正文。" />}
          </section>
        </div>
      </>
    );
  }

  if (layout.activityView === 'settings') {
    return (
      <>
        <SidebarHeader title="设置" description="快速调整主题和模型" actions={<><IconButton title="打开完整设置" onClick={() => setSettingsOpen(true)} icon={Settings2} /><IconButton title="收起侧栏" onClick={() => patchSidebar({ leftCollapsed: true })} icon={X} /></>} />
        <div className="sidebar-content">
          <section className="sidebar-section"><div className="section-kicker">当前服务</div><div className="meta-list"><div><span>服务商</span><strong>{providerLabel(settings?.provider)}</strong></div><div><span>模型</span><strong>{settings?.model ?? '-'}</strong></div></div><button type="button" className="button-secondary" onClick={() => void testAiConnection()}>测试连接</button></section>
        </div>
      </>
    );
  }

  return (
    <>
      <SidebarHeader
        title="工程"
        description={project ? project.manifest.name : '尚未打开工程'}
        actions={
          <div className="explorer-toolbar workbench-explorer-toolbar" data-testid="workbench-explorer-toolbar">
            <div className="workbench-tool-grid" aria-label="文件树工具">
              <IconButton title="文件" onClick={() => patchSidebar({ activityView: 'project', leftCollapsed: false })} icon={FileText} active disabled={!project} />
              <IconButton title="新建文件" onClick={() => void createFile()} icon={FilePlus2} disabled={!project} />
              <IconButton title="新建目录" onClick={() => void createDirectory()} icon={FolderPlus} disabled={!project} />
              <IconButton title="导入" onClick={() => void importDocumentsIntoProject()} icon={FileUp} disabled={!project} />
              <IconButton title="导出" onClick={() => void window.api.openProjectFolder()} icon={Download} disabled={!project} />
              <IconButton title="打开命令面板" onClick={openCommandPalette} icon={MoreHorizontal} disabled={!project} />
            </div>
          </div>
        }
      />
      <div className="sidebar-content project-sidebar-content workbench-explorer">
        <label className="search-row explorer-search-row">
          <input
            value={project ? workbenchPaneQuery : 'docs/'}
            onChange={(event) => setTreeFilter(event.target.value)}
            placeholder="docs/"
            readOnly={Boolean(project)}
          />
        </label>
        <section className="sidebar-section tree-section project-tree-panel">
          {project ? (
            <WorkbenchTreeList
              groups={workbenchTreeGroups}
              activePath={activeDocumentPath}
              onOpen={(filePath) => void openDocument(filePath, { immediateFeedback: true })}
              onRename={(filePath) => void renameEntryAt(filePath)}
              onMove={(filePath) => void moveEntryAt(filePath)}
              onDelete={(filePath) => void deleteEntryAt(filePath)}
            />
          ) : (
            <EmptyBlock title="还没有工程" description="先创建或打开一个工程，文件结构才会出现在这里。" />
          )}
        </section>
      </div>
    </>
  );
}

function areSidebarViewPropsEqual(previous: any, next: any) {
  return previous.layout === next.layout
    && previous.project === next.project
    && previous.activeDocumentPath === next.activeDocumentPath
    && previous.activeSession === next.activeSession
    && previous.visibleSessions === next.visibleSessions
    && previous.archivedSessions === next.archivedSessions
    && previous.filteredTree === next.filteredTree
    && previous.installedSkills === next.installedSkills
    && previous.projectSkillIds === next.projectSkillIds
    && previous.activeSessionSkillIds === next.activeSessionSkillIds
    && previous.skillCatalog === next.skillCatalog
    && previous.catalogUrl === next.catalogUrl
    && previous.resourcePackageUrl === next.resourcePackageUrl
    && previous.settings === next.settings
    && previous.settingsDraft === next.settingsDraft
    && previous.treeFilter === next.treeFilter
    && previous.searchQuery === next.searchQuery
    && previous.projectSearchResults === next.projectSearchResults
    && previous.projectSearching === next.projectSearching
    && previous.stageLabels === next.stageLabels;
}

export const SidebarView = memo(SidebarViewComponent, areSidebarViewPropsEqual);

function ContextPaneComponent(props: any) {
  const {
    activityView,
    activeSession,
    visibleSessions,
    archivedSessions,
    activeDocumentName,
    activeDocumentPath,
    activeSessionSkillIds,
    projectSkillIds,
    installedSkills,
    chatInput,
    sending,
    setChatInput,
    sendMessage,
    patchSidebar,
    activeNoteDocument,
    noteComparisonCandidates,
    noteComparePath,
    setNoteComparePath,
    activeNoteComparison,
    openDocument,
    setActiveSessionId,
    createSession,
    recentDocumentChanges,
    conversationTarget,
    targetLabel,
    sameConversationTarget,
    fileName,
    stageLabels,
    contextPacks,
    knowledgeIndexState,
    runtimeGovernorStatus,
    refreshKnowledgeIndex,
    onOpenThinkingChain,
    toggleSessionPinnedDocument,
    toggleSessionExcludedDocument
  } = props;

  const effectiveSkillIds = Array.from(new Set([...projectSkillIds, ...activeSessionSkillIds]));
  const targetType = conversationTarget?.targetType ?? (activeDocumentPath ? 'project-doc' : 'project-doc');
  const showNoteReferences = targetType === 'project-doc' && activeDocumentPath && activeNoteDocument;
  const railSessions = conversationTarget
    ? visibleSessions.filter((session: any) => sameConversationTarget(session.target, conversationTarget))
    : visibleSessions;
  const latestContextPack = (activeSession
    ? contextPacks.find((item: any) => item.sessionId === activeSession.id)
    : null) ?? contextPacks[0] ?? null;
  const pinnedDocumentPaths = Array.from(new Set([
    ...(activeSession?.contextControls?.pinnedDocumentPaths ?? []),
    ...(latestContextPack?.pinnedDocumentPaths ?? [])
  ]));
  const excludedDocumentPaths = Array.from(new Set([
    ...(activeSession?.contextControls?.excludedDocumentPaths ?? []),
    ...(latestContextPack?.excludedDocumentPaths ?? [])
  ]));
  const latestRetrievalHits = latestContextPack?.retrievalHits ?? [];
  const latestProvenanceRecords = latestContextPack?.provenanceRecords ?? [];
  const latestBudgetPlan = latestContextPack?.budgetPlan;
  const activeDocumentPinned = Boolean(activeDocumentPath && pinnedDocumentPaths.includes(activeDocumentPath));
  const activeDocumentExcluded = Boolean(activeDocumentPath && excludedDocumentPaths.includes(activeDocumentPath));
  const messageThreads = useMemo(
    () => (activeSession?.messages ?? []).map((message: any) => ({
      ...message,
      formattedTime: formatMessageTime(message.createdAt)
    })),
    [activeSession?.messages]
  );
  const latestAssistantMessage = useMemo(
    () => [...messageThreads].reverse().find((message: any) => message.role === 'assistant') ?? null,
    [messageThreads]
  );
  const latestAssistantTime = latestAssistantMessage?.formattedTime ?? '';

  if (targetType === 'orchestration-flow') {
    const railIcons = [Workflow, CheckCheck, Archive];
    const railTitles = ['主流程会话', '审查流程会话', '输出流程会话'];
    return (
      <div className="context-pane-shell orchestration-context-shell">
        <div className="context-pane-main orchestration-context-main">
          <div className="orchestration-context-summary">
            {latestAssistantMessage ? (
              <article className="message-thread assistant orchestration-summary-card">
                <div className="message-heading">
                  <span>AI</span>
                  <time>{latestAssistantTime}</time>
                </div>
                <div className="message-body">{latestAssistantMessage.content}</div>
              </article>
            ) : (
              <EmptyBlock title="当前还没有编排建议" description="从底部输入框描述你希望 AI 如何补齐当前流程。" />
            )}
          </div>

          <div className="conversation-scroll orchestration-conversation-scroll">
            {messageThreads.length ? messageThreads.map((message: any) => (
              <article key={message.id} className={`message-thread ${message.role}`}>
                <div className="message-heading">
                  <span>{message.role === 'user' ? '你' : message.role === 'assistant' ? 'AI' : '系统'}</span>
                  <time>{message.formattedTime}</time>
                </div>
                <div className="message-body">{message.content}</div>
              </article>
            )) : null}
          </div>

          <section className="composer orchestration-composer">
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="例如：把需求分析员节点输出改成 PRD 草稿 + 风险清单，并要求 Markdown 表格格式。"
            />
            <div className="composer-actions">
              <button type="button" className="button-secondary">节点规则</button>
              <span className="composer-hint">已附带：{targetLabel}</span>
              <button type="button" className="button-primary" data-testid="ai-composer-send" onClick={() => void sendMessage()} disabled={sending || !chatInput.trim()}>发送</button>
            </div>
          </section>
        </div>

        <aside className="context-session-rail orchestration-session-rail" aria-label="编排会话轨道">
          {railIcons.map((Icon, index) => {
            const session = railSessions[index] ?? null;
            return (
              <button
                key={railTitles[index]}
                type="button"
                className={`session-rail-button orchestration-rail-button ${session?.id === activeSession?.id ? 'active' : ''}`}
                title={railTitles[index]}
                aria-label={railTitles[index]}
                onClick={() => {
                  if (session) {
                    setActiveSessionId?.(session.id);
                    return;
                  }
                  if (conversationTarget) {
                    createSession(conversationTarget);
                  }
                }}
                disabled={!session && !conversationTarget}
              >
                <Icon size={15} strokeWidth={1.8} />
              </button>
            );
          })}
        </aside>
      </div>
    );
  }

  if (targetType === 'project-doc') {
    const sessionGroup = railSessions.slice(0, 2);
    const trailingSessions = visibleSessions
      .filter((session: any) => !sessionGroup.some((item: any) => item.id === session.id))
      .slice(0, 2);
    const paneLabel = activityView === 'search'
      ? '搜索'
      : activityView === 'sessions'
        ? '会话'
        : '文件树';
    const composerContextLabel = activeDocumentName || targetLabel;
    const railIcons: LucideIcon[] = [FileSearch, FileSearch, CheckCheck, Workflow];
    const hasMessages = messageThreads.length > 0;
    const stageLabel = activeSession ? stageLabels[activeSession.stage] : 'AI';
    const contextTitle = activeDocumentName
      || stripStageSuffix(activeSession?.title, stageLabel)
      || targetLabel
      || '当前上下文';
    const emptyStateTitle = '暂无对话';
    const emptyStateDescription = activeDocumentName
      ? `${activeDocumentName} 已作为默认上下文。`
      : '当前工作区已作为默认上下文。';
    return (
      <div className="context-pane-shell workbench-context-shell">
        <div className={`context-pane-main workbench-context-main ${hasMessages ? '' : 'is-idle'}`.trim()}>
          <div className="context-pane-hero panel-head panel-head-compact workbench-ai-head">
            <div className="context-pane-hero-copy">
              <div className="section-kicker">{stageLabel}</div>
              <strong title={contextTitle}>{contextTitle}</strong>
              <p>
                {activeDocumentName
                  ? '文档、工作面和最近变更会合并为本轮上下文。'
                  : '工作区和最近变更会合并为本轮上下文。'}
              </p>
            </div>
            <div className="panel-head-actions workbench-ai-actions">
              <IconButton
                title="新建会话"
                onClick={() => createSession(conversationTarget)}
                icon={Plus}
                disabled={!conversationTarget}
              />
              <IconButton
                title="打开思路地图"
                onClick={() => onOpenThinkingChain?.()}
                icon={Share2}
                disabled={!onOpenThinkingChain}
              />
              <button
                type="button"
                className="icon-button"
                title="刷新索引"
                aria-label="刷新索引"
                data-testid="knowledge-index-refresh"
                onClick={() => void refreshKnowledgeIndex?.()}
                disabled={!refreshKnowledgeIndex}
              >
                <RefreshCw size={16} strokeWidth={1.8} />
              </button>
            </div>
          </div>

          <div className="ai-summary-strip">
            <div className="ai-summary-item">
              <span>文档</span>
              <strong title={activeDocumentName || '-'}>{activeDocumentName || '-'}</strong>
            </div>
            <div className="ai-summary-item">
              <span>工作面</span>
              <strong>{paneLabel}</strong>
            </div>
          </div>

          <div
            className={`conversation-scroll workbench-conversation ${hasMessages ? '' : 'is-empty'}`.trim()}
            data-testid="workbench-conversation"
          >
            {hasMessages ? messageThreads.map((message: any) => (
              <article key={message.id} className={`message-thread ${message.role}`}>
                <div className="message-heading">
                  <span>{message.role === 'user' ? '你' : message.role === 'assistant' ? 'AI' : '系统'}</span>
                  <time>{message.formattedTime}</time>
                </div>
                <div className="message-body">{message.content}</div>
              </article>
            )) : (
              <div className="empty-block conversation-empty-block" data-testid="workbench-conversation-empty">
                <strong>{emptyStateTitle}</strong>
                <p>{emptyStateDescription}</p>
              </div>
            )}
          </div>

          <section className="composer workbench-composer" data-testid="workbench-composer">
            <div className="composer-context-row">
              <span>引用上下文</span>
              <strong>{composerContextLabel}</strong>
            </div>
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="描述你希望 AI 继续推进的内容，例如“把需求边界压成 5 条验收标准”"
            />
            <div className="composer-row">
              <button type="button" className="ghost-action">沉淀为条目</button>
              <button type="button" className="ghost-action" onClick={() => patchSidebar({ activityView: 'rules', leftCollapsed: false, rightCollapsed: true })}>
                工程规则
              </button>
              <button type="button" className="button-primary small" data-testid="ai-composer-send" onClick={() => void sendMessage()} disabled={sending || !chatInput.trim()}>
                发送
              </button>
            </div>
          </section>
        </div>

        <aside className="context-session-rail session-rail workbench-session-rail" data-session-layout="collapsed" aria-label="会话轨道">
          <button type="button" className="session-rail-toggle" title="展开会话轨" aria-label="展开会话轨">
            <ChevronDown size={15} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={`session-group-button ${sessionGroup.length ? 'active' : ''}`}
            title="工程会话组"
            aria-label="工程会话组"
            onClick={() => {
              if (sessionGroup[0]) {
                setActiveSessionId?.(sessionGroup[0].id);
                return;
              }
              if (conversationTarget) {
                createSession(conversationTarget);
              }
            }}
          >
            <MessagesSquare size={15} strokeWidth={1.8} />
            <span className="session-group-count">{sessionGroup.length || 1}</span>
          </button>
          <div className="session-group-stack">
            {sessionGroup.map((session: any, index: number) => {
              const Icon = railIcons[index] ?? FileSearch;
              return (
                <button
                  key={session.id}
                  type="button"
                  className={`session-button ${session.id === activeSession?.id ? 'active' : ''}`}
                  title={session.title}
                  aria-label={session.title}
                  onClick={() => setActiveSessionId?.(session.id)}
                >
                  <Icon size={15} strokeWidth={1.8} />
                </button>
              );
            })}
          </div>
          {trailingSessions.map((session: any, index: number) => {
            const Icon = railIcons[index + sessionGroup.length] ?? Workflow;
            return (
              <button
                key={session.id}
                type="button"
                className={`session-button ${session.id === activeSession?.id ? 'active' : ''}`}
                title={session.title}
                aria-label={session.title}
                onClick={() => setActiveSessionId?.(session.id)}
              >
                <Icon size={15} strokeWidth={1.8} />
              </button>
            );
          })}
          {archivedSessions.length ? <div className="session-rail-count" title={`已归档 ${archivedSessions.length} 个会话`}>{archivedSessions.length}</div> : null}
        </aside>
      </div>
    );
  }

  const compactProjectContextActions = targetType === 'project-doc';

  return (
    <div className="context-pane-shell">
      <div className="context-pane-main">
        <div className="context-pane-hero">
          <div className="context-pane-hero-copy">
            <div className="section-kicker">AI 协作</div>
            <strong>{activeSession?.title ?? '当前会话'}</strong>
            <p>
              {targetType === 'orchestration-flow'
                ? `围绕流程 ${targetLabel} 生成或修改卡片、角色和连接。`
                : targetType === 'settings'
                  ? '围绕当前配置解释模型、连接与工作台偏好。'
                  : activeDocumentPath
                    ? `围绕 ${activeDocumentName} 自动切换上下文`
                    : '当前没有打开文档，你也可以先从会话描述目标。'}
            </p>
          </div>
          <div className={`context-pane-hero-actions ${compactProjectContextActions ? 'compact' : ''}`}>
            {compactProjectContextActions ? (
              <>
                <IconButton title="管理会话" onClick={() => patchSidebar({ activityView: 'sessions', leftCollapsed: false })} icon={MessagesSquare} />
                <IconButton title="思路地图" onClick={() => onOpenThinkingChain?.()} icon={History} />
                <IconButton title="收起 AI 侧栏" onClick={() => patchSidebar({ rightCollapsed: true })} icon={X} />
              </>
            ) : (
              <>
                <button type="button" className="button-secondary icon-text" onClick={() => patchSidebar({ activityView: 'sessions', leftCollapsed: false })}>
                  <MessagesSquare size={14} strokeWidth={1.8} />
                  <span>管理会话</span>
                </button>
                <button type="button" className="button-secondary icon-text" onClick={() => onOpenThinkingChain?.()}>
                  <History size={14} strokeWidth={1.8} />
                  <span>思路地图</span>
                </button>
                <IconButton title="收起 AI 侧栏" onClick={() => patchSidebar({ rightCollapsed: true })} icon={X} />
              </>
            )}
          </div>
        </div>

        <div className="context-summary-grid">
          <div className="summary-card">
            <span>当前阶段</span>
            {activeSession ? <StageBadge stage={activeSession.stage} /> : <span className="small-tag">未选择</span>}
          </div>
          <div className="summary-card">
            <span>当前上下文</span>
            <strong>{targetLabel}</strong>
          </div>
          <div className="summary-card">
            <span>生效技能</span>
            <div className="tag-cloud compact">{effectiveSkillIds.length ? effectiveSkillIds.map((skillId) => <span key={skillId} className="small-tag">{installedSkills.find((item: any) => item.id === skillId)?.name ?? skillId}</span>) : <span className="small-tag">无</span>}</div>
          </div>
        </div>

        <section className="context-panel-card">
          <div className="workspace-subhead">
            <div>
              <div className="section-kicker">AI Harness</div>
              <strong>索引、检索、压缩与预算治理</strong>
            </div>
            <div className="context-inline-actions">
              {activeDocumentPath && activeSession ? (
                <>
                  <button
                    type="button"
                    className={`button-secondary icon-text ${activeDocumentPinned ? 'active' : ''}`}
                    onClick={() => void toggleSessionPinnedDocument?.(activeSession.id, activeDocumentPath)}
                  >
                    <Pin size={14} strokeWidth={1.8} />
                    <span>{activeDocumentPinned ? '取消固定当前文档' : '固定当前文档'}</span>
                  </button>
                  <button
                    type="button"
                    className={`button-secondary icon-text ${activeDocumentExcluded ? 'active' : ''}`}
                    onClick={() => void toggleSessionExcludedDocument?.(activeSession.id, activeDocumentPath)}
                  >
                    <X size={14} strokeWidth={1.8} />
                    <span>{activeDocumentExcluded ? '取消排除当前文档' : '排除当前文档'}</span>
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="button-secondary icon-text"
                data-testid="knowledge-index-refresh"
                onClick={() => void refreshKnowledgeIndex?.()}
              >
                <RefreshCw size={14} strokeWidth={1.8} />
                <span>刷新索引</span>
              </button>
            </div>
          </div>
          <div className="context-summary-grid">
            <div className="summary-card">
              <span>知识索引</span>
              <strong>{knowledgeIndexState?.status ?? '未初始化'}</strong>
              <div className="muted-line">{knowledgeIndexState ? `${knowledgeIndexState.documentCount} 个文档` : '等待工程载入'}</div>
            </div>
            <div className="summary-card">
              <span>并发预算</span>
              <strong>{runtimeGovernorStatus ? `${runtimeGovernorStatus.activeRunCount}/${runtimeGovernorStatus.maxConcurrentRuns}` : '未初始化'}</strong>
              <div className="muted-line">{runtimeGovernorStatus?.lastDecision ?? '暂无调度记录'}</div>
            </div>
            <div className="summary-card">
              <span>最近上下文包</span>
              <strong>{latestContextPack ? `${latestRetrievalHits.length} 命中` : '暂无'}</strong>
              <div className="muted-line">{latestContextPack ? `${latestProvenanceRecords.length} 条来源 · ${latestContextPack.compacted ? '已压缩' : '未压缩'}` : '运行后会在此显示'}</div>
            </div>
            <div className="summary-card">
              <span>会话控制</span>
              <strong>{`${pinnedDocumentPaths.length} 固定 / ${excludedDocumentPaths.length} 排除`}</strong>
              <div className="muted-line">{latestBudgetPlan ? `预算命中 ${latestBudgetPlan.selectedRetrievalHitCount} 条` : '尚未生成上下文包'}</div>
            </div>
          </div>
          {(pinnedDocumentPaths.length || excludedDocumentPaths.length) ? (
            <div className="context-doc-grid">
              <div className="context-doc-column">
                <div className="section-kicker">固定上下文</div>
                {pinnedDocumentPaths.length ? (
                  <div className="list-stack compact">
                    {pinnedDocumentPaths.map((documentPath: string) => (
                      <div key={`pinned-${documentPath}`} className="list-card compact-row">
                        <button type="button" className="reference-pill" onClick={() => void openDocument(documentPath)}>
                          {fileName(documentPath)}
                        </button>
                        {activeSession ? (
                          <IconButton
                            title="取消固定上下文"
                            onClick={() => void toggleSessionPinnedDocument?.(activeSession.id, documentPath)}
                            icon={Pin}
                            active
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-note">暂无固定文档</div>
                )}
              </div>
              <div className="context-doc-column">
                <div className="section-kicker">排除上下文</div>
                {excludedDocumentPaths.length ? (
                  <div className="list-stack compact">
                    {excludedDocumentPaths.map((documentPath: string) => (
                      <div key={`excluded-${documentPath}`} className="list-card compact-row">
                        <button type="button" className="reference-pill" onClick={() => void openDocument(documentPath)}>
                          {fileName(documentPath)}
                        </button>
                        {activeSession ? (
                          <IconButton
                            title="取消排除上下文"
                            onClick={() => void toggleSessionExcludedDocument?.(activeSession.id, documentPath)}
                            icon={X}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-note">暂无排除文档</div>
                )}
              </div>
            </div>
          ) : null}
          {latestBudgetPlan ? (
            <div className="tag-cloud compact">
              <span className="small-tag">预计上下文 {latestBudgetPlan.estimatedContextTokens} tokens</span>
              <span className="small-tag">预计总提示 {latestBudgetPlan.estimatedPromptTokens} tokens</span>
              <span className="small-tag">保留输出 {latestBudgetPlan.reservedOutputTokens} tokens</span>
              <span className="small-tag">截断命中 {latestBudgetPlan.truncatedRetrievalHitCount}</span>
              <span className="small-tag">省略消息 {latestBudgetPlan.omittedMessageCount}</span>
            </div>
          ) : null}
          {knowledgeIndexState?.staleDocumentPaths?.length ? (
            <div className="tag-cloud compact">
              {knowledgeIndexState.staleDocumentPaths.slice(0, 6).map((documentPath: string) => <span key={documentPath} className="small-tag warning">{fileName(documentPath)}</span>)}
            </div>
          ) : null}
          {latestRetrievalHits.length ? (
            <>
              <div className="section-kicker">命中原因</div>
              <div className="list-stack">
                {latestRetrievalHits.slice(0, 6).map((hit: any) => {
                  const isPinned = pinnedDocumentPaths.includes(hit.path);
                  const isExcluded = excludedDocumentPaths.includes(hit.path);
                  return (
                    <div key={hit.unitId} className="list-card">
                      <div className="list-card-header">
                        <div>
                          <strong>{hit.title}</strong>
                          <div className="muted-line">{hit.reason}</div>
                        </div>
                        <span className="small-tag">{Number.isFinite(hit.score) ? hit.score.toFixed(2) : hit.score}</span>
                      </div>
                      <div className="tag-cloud compact">
                        {(hit.matchedBy ?? []).map((mode: string) => <span key={`${hit.unitId}-${mode}`} className="small-tag">{mode}</span>)}
                        {hit.pinned ? <span className="small-tag state-good">固定</span> : null}
                        {hit.relatedChangeRecordIds?.length ? <span className="small-tag">关联变更 {hit.relatedChangeRecordIds.length}</span> : null}
                      </div>
                      <div className="muted-line context-hit-excerpt">{hit.excerpt}</div>
                      <div className="context-inline-actions">
                        <button type="button" className="button-secondary icon-text" onClick={() => void openDocument(hit.path)}>
                          <FolderOpen size={14} strokeWidth={1.8} />
                          <span>打开来源</span>
                        </button>
                        {activeSession ? (
                          <>
                            <button
                              type="button"
                              className={`button-secondary icon-text ${isPinned ? 'active' : ''}`}
                              onClick={() => void toggleSessionPinnedDocument?.(activeSession.id, hit.path)}
                            >
                              <Pin size={14} strokeWidth={1.8} />
                              <span>{isPinned ? '取消固定' : '固定'}</span>
                            </button>
                            <button
                              type="button"
                              className={`button-secondary icon-text ${isExcluded ? 'active' : ''}`}
                              onClick={() => void toggleSessionExcludedDocument?.(activeSession.id, hit.path)}
                            >
                              <X size={14} strokeWidth={1.8} />
                              <span>{isExcluded ? '取消排除' : '排除'}</span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-note">最近一次运行后，这里会显示命中原因、分数与上下文来源。</div>
          )}
          {latestProvenanceRecords.length ? (
            <>
              <div className="section-kicker">来源证据</div>
              <div className="list-stack">
                {latestProvenanceRecords.slice(0, 8).map((record: any) => (
                  <div key={record.id} className="list-card compact-row provenance-row">
                    <div className="context-provenance-copy">
                      <strong>{record.label}</strong>
                      <div className="muted-line">{record.detail}</div>
                    </div>
                    <div className="context-inline-actions">
                      {typeof record.score === 'number' ? <span className="small-tag">{record.score.toFixed(2)}</span> : null}
                      {record.sourcePath ? (
                        <button type="button" className="button-secondary icon-text" onClick={() => void openDocument(record.sourcePath)}>
                          <FolderOpen size={14} strokeWidth={1.8} />
                          <span>打开原文</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>

        {showNoteReferences ? (
          <section className="context-panel-card">
            <div className="workspace-subhead">
              <div>
                <div className="section-kicker">笔记引用</div>
                <strong>围绕当前文档组织可复用上下文</strong>
              </div>
            </div>
            <div className="context-reference-grid">
              <div className="summary-card reference-card">
                <span>当前文档引用</span>
                <strong>{activeNoteDocument.outbound.length}</strong>
                <div className="reference-list">
                  {activeNoteDocument.outbound.length
                    ? activeNoteDocument.outbound.slice(0, 6).map((edge: any) => (
                      <button key={edge.id} type="button" className="reference-pill" onClick={() => void openDocument(edge.targetPath)}>
                        {edge.targetTitle}
                      </button>
                    ))
                    : <span className="small-tag muted">暂无</span>}
                </div>
              </div>
              <div className="summary-card reference-card">
                <span>反向引用</span>
                <strong>{activeNoteDocument.inbound.length}</strong>
                <div className="reference-list">
                  {activeNoteDocument.inbound.length
                    ? activeNoteDocument.inbound.slice(0, 6).map((edge: any) => (
                      <button key={edge.id} type="button" className="reference-pill" onClick={() => void openDocument(edge.sourcePath)}>
                        {fileName(edge.sourcePath)}
                      </button>
                    ))
                    : <span className="small-tag muted">暂无</span>}
                </div>
              </div>
            </div>
            <div className="field-stack compact">
              <label>
                对比引用关系
                <select value={noteComparePath} onChange={(event) => setNoteComparePath(event.target.value)}>
                  <option value="">选择另一篇笔记</option>
                  {noteComparisonCandidates.map((document: any) => (
                    <option key={document.path} value={document.path}>{document.title}</option>
                  ))}
                </select>
              </label>
            </div>
            {activeNoteComparison ? (
              <>
                <div className="section-kicker">引用对比</div>
                <div className="reference-compare-grid">
                  <div className="summary-card reference-card">
                    <span>共同引用</span>
                    <strong>{activeNoteComparison.sharedOutbound.length}</strong>
                    <div className="reference-list">
                      {activeNoteComparison.sharedOutbound.length
                        ? activeNoteComparison.sharedOutbound.slice(0, 6).map((document: any) => (
                          <button key={`shared-out-${document.path}`} type="button" className="reference-pill" onClick={() => void openDocument(document.path)}>{document.title}</button>
                        ))
                        : <span className="small-tag muted">暂无</span>}
                    </div>
                  </div>
                  <div className="summary-card reference-card">
                    <span>当前独有引用</span>
                    <strong>{activeNoteComparison.baseOnlyOutbound.length}</strong>
                    <div className="reference-list">
                      {activeNoteComparison.baseOnlyOutbound.length
                        ? activeNoteComparison.baseOnlyOutbound.slice(0, 6).map((document: any) => (
                          <button key={`base-only-out-${document.path}`} type="button" className="reference-pill" onClick={() => void openDocument(document.path)}>{document.title}</button>
                        ))
                        : <span className="small-tag muted">暂无</span>}
                    </div>
                  </div>
                  <div className="summary-card reference-card">
                    <span>对方独有引用</span>
                    <strong>{activeNoteComparison.compareOnlyOutbound.length}</strong>
                    <div className="reference-list">
                      {activeNoteComparison.compareOnlyOutbound.length
                        ? activeNoteComparison.compareOnlyOutbound.slice(0, 6).map((document: any) => (
                          <button key={`compare-only-out-${document.path}`} type="button" className="reference-pill" onClick={() => void openDocument(document.path)}>{document.title}</button>
                        ))
                        : <span className="small-tag muted">暂无</span>}
                    </div>
                  </div>
                </div>
                <div className="section-kicker">反向引用对比</div>
                <div className="reference-compare-grid">
                  <div className="summary-card reference-card">
                    <span>共同被引用</span>
                    <strong>{activeNoteComparison.sharedInbound.length}</strong>
                    <div className="reference-list">
                      {activeNoteComparison.sharedInbound.length
                        ? activeNoteComparison.sharedInbound.slice(0, 6).map((document: any) => (
                          <button key={`shared-in-${document.path}`} type="button" className="reference-pill" onClick={() => void openDocument(document.path)}>{document.title}</button>
                        ))
                        : <span className="small-tag muted">暂无</span>}
                    </div>
                  </div>
                  <div className="summary-card reference-card">
                    <span>当前独有被引用</span>
                    <strong>{activeNoteComparison.baseOnlyInbound.length}</strong>
                    <div className="reference-list">
                      {activeNoteComparison.baseOnlyInbound.length
                        ? activeNoteComparison.baseOnlyInbound.slice(0, 6).map((document: any) => (
                          <button key={`base-only-in-${document.path}`} type="button" className="reference-pill" onClick={() => void openDocument(document.path)}>{document.title}</button>
                        ))
                        : <span className="small-tag muted">暂无</span>}
                    </div>
                  </div>
                  <div className="summary-card reference-card">
                    <span>对方独有被引用</span>
                    <strong>{activeNoteComparison.compareOnlyInbound.length}</strong>
                    <div className="reference-list">
                      {activeNoteComparison.compareOnlyInbound.length
                        ? activeNoteComparison.compareOnlyInbound.slice(0, 6).map((document: any) => (
                          <button key={`compare-only-in-${document.path}`} type="button" className="reference-pill" onClick={() => void openDocument(document.path)}>{document.title}</button>
                        ))
                        : <span className="small-tag muted">暂无</span>}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {recentDocumentChanges.length ? (
          <section className="context-panel-card">
            <div className="workspace-subhead">
              <div>
                <div className="section-kicker">最近变更</div>
                <strong>AI 会自动附带这些变更与影响分析</strong>
              </div>
            </div>
            <div className="list-stack">
              {recentDocumentChanges.map((record: any) => (
                <div key={record.id} className="list-card">
                  <div className="list-card-header">
                    <div>
                      <strong>{record.title}</strong>
                      <div className="muted-line">{record.summary}</div>
                    </div>
                    <span className="small-tag">{record.source === 'external-change' ? '外部修改' : record.source === 'editor-save' ? '编辑保存' : '运行写入'}</span>
                  </div>
                  <div className="tag-cloud compact">
                    {record.impact.inboundAffectedPaths.length ? <span className="small-tag">上游 {record.impact.inboundAffectedPaths.length}</span> : null}
                    {record.impact.outboundAddedPaths.length ? <span className="small-tag">新增引用 {record.impact.outboundAddedPaths.length}</span> : null}
                    {record.impact.outboundRemovedPaths.length ? <span className="small-tag">移除引用 {record.impact.outboundRemovedPaths.length}</span> : null}
                    {record.impact.artifactPaths.length ? <span className="small-tag">工件 {record.impact.artifactPaths.length}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="conversation-scroll">
          {messageThreads.length ? messageThreads.map((message: any) => <article key={message.id} className={`message-thread ${message.role}`}><div className="message-heading"><span>{message.role === 'user' ? '你' : message.role === 'assistant' ? 'AI' : '系统'}</span><time>{message.formattedTime}</time></div><div className="message-body">{message.content}</div></article>) : <EmptyBlock title="当前会话还没有消息" description="从右下角输入框开始和 AI 一起推进当前文档。" />}
        </div>
        <section className="composer"><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={targetType === 'orchestration-flow' ? '描述你希望 AI 如何生成或修改当前流程…' : '输入你希望 AI 帮你推进的内容…'} /><div className="composer-actions"><span className="composer-hint">已附带：{targetLabel}{recentDocumentChanges.length ? ` · 最近变更 ${recentDocumentChanges.length} 条` : ''}{latestContextPack ? ` · 最近命中 ${latestRetrievalHits.length} 条` : ''}</span><button type="button" className="button-primary icon-text" data-testid="ai-composer-send" onClick={() => void sendMessage()} disabled={sending || !chatInput.trim()}><SendHorizontal size={14} strokeWidth={1.8} /><span>{sending ? '发送中…' : '发送'}</span></button></div></section>
      </div>

      <aside className="context-session-rail" aria-label="会话轨道">
        <button type="button" className="session-rail-button session-rail-add" onClick={() => createSession(conversationTarget)} title="新建会话" aria-label="新建会话">
          <Plus size={15} strokeWidth={1.9} />
        </button>
        {railSessions.map((session: any) => {
          const label = session.title.trim().slice(0, 2) || 'AI';
          return (
            <button
              key={session.id}
              type="button"
              className={`session-rail-button ${session.id === activeSession?.id ? 'active' : ''}`}
              onClick={() => setActiveSessionId?.(session.id)}
              title={`${session.title} · ${stageLabels[session.stage] ?? session.stage}`}
              aria-label={`切换会话 ${session.title}`}
            >
              <span>{label}</span>
            </button>
          );
        })}
        {archivedSessions.length ? <div className="session-rail-count" title={`已归档 ${archivedSessions.length} 个会话`}>{archivedSessions.length}</div> : null}
      </aside>
    </div>
  );
}

function areContextPanePropsEqual(previous: any, next: any) {
  return previous.activityView === next.activityView
    && previous.activeSession === next.activeSession
    && previous.visibleSessions === next.visibleSessions
    && previous.archivedSessions === next.archivedSessions
    && previous.activeDocumentName === next.activeDocumentName
    && previous.activeDocumentPath === next.activeDocumentPath
    && previous.activeSessionSkillIds === next.activeSessionSkillIds
    && previous.projectSkillIds === next.projectSkillIds
    && previous.installedSkills === next.installedSkills
    && previous.chatInput === next.chatInput
    && previous.sending === next.sending
    && previous.activeNoteDocument === next.activeNoteDocument
    && previous.noteComparisonCandidates === next.noteComparisonCandidates
    && previous.noteComparePath === next.noteComparePath
    && previous.activeNoteComparison === next.activeNoteComparison
    && previous.recentDocumentChanges === next.recentDocumentChanges
    && previous.conversationTarget === next.conversationTarget
    && previous.targetLabel === next.targetLabel
    && previous.contextPacks === next.contextPacks
    && previous.knowledgeIndexState === next.knowledgeIndexState
    && previous.runtimeGovernorStatus === next.runtimeGovernorStatus
    && previous.stageLabels === next.stageLabels;
}

export const ContextPane = memo(ContextPaneComponent, areContextPanePropsEqual);

export function ProcessPanel(props: any) {
  const {
    layout,
    project,
    activeSession,
    activeReviewRounds,
    stageInstructions,
    stageGuard,
    setStageInstructions,
    updateSessionStage,
    generateStageDraft,
    confirmStage,
    revisitStage,
    generateOpenSpec,
    runReviewRound,
    updateReviewIssue,
    consistencyReport,
    snapshots,
    restoreSnapshot,
    auditEntries,
    runtimeRuns,
    runtimeEvents,
    runtimeCapabilities,
    runConsistencyCheck,
    pauseRuntimeRun,
    resumeRuntimeRun,
    retryRuntimeRun,
    stopRuntimeRun,
    patchSidebar,
    stageLabels,
    stageOrder,
    fileName
  } = props;

  return (
    <section className="process-panel">
      <div className="process-header">
        <div className="process-tabs">
          <ProcessTabButton label="阶段" active={layout.processPanelTab === 'stage'} onClick={() => patchSidebar({ processPanelTab: 'stage' })} icon={Workflow} />
          <ProcessTabButton label="审查" active={layout.processPanelTab === 'review'} onClick={() => patchSidebar({ processPanelTab: 'review' })} icon={MessageSquare} />
          <ProcessTabButton label="历史" active={layout.processPanelTab === 'history'} onClick={() => patchSidebar({ processPanelTab: 'history' })} icon={History} />
        </div>
        <CollapseButton onClick={() => patchSidebar({ processPanelOpen: false })} />
      </div>
      <div className="process-content">
        {layout.processPanelTab === 'stage' && (
          <div className="process-grid">
            <section className="panel-card">
              <div className="card-kicker">当前阶段</div>
              <div className="card-title-row">
                <strong>{activeSession ? stageLabels[activeSession.stage] : '未选择'}</strong>
                {activeSession ? <StageBadge stage={activeSession.stage} /> : null}
              </div>
              <div className="field-stack">
                <label>
                  调整阶段
                  <select value={activeSession?.stage ?? 'discover'} onChange={(event) => updateSessionStage(event.target.value)}>
                    {stageOrder.map((stage: string) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
                  </select>
                </label>
                <label>
                  阶段说明
                  <textarea value={stageInstructions} onChange={(event) => setStageInstructions(event.target.value)} placeholder="补充当前阶段的限制、重点或额外要求" />
                </label>
              </div>
              <div className="button-row">
                <button type="button" className="button-primary" onClick={() => void generateStageDraft()} disabled={!activeSession}>生成阶段草稿</button>
                <button type="button" className="button-secondary" onClick={() => void confirmStage()} disabled={!activeSession || !stageGuard?.ok}>确认当前阶段</button>
                <button type="button" className="button-secondary" onClick={() => void generateOpenSpec()} disabled={!project}>导出 OpenSpec</button>
              </div>
              {stageGuard ? (
                <div className="stage-guard-card">
                  <div className="section-kicker">阶段约束</div>
                  {stageGuard.blockers.length ? (
                    <div className="finding-stack">
                      {stageGuard.blockers.map((item: string) => <div key={item} className="finding-card error">{item}</div>)}
                    </div>
                  ) : (
                    <div className="finding-card info">当前阶段已满足确认条件。</div>
                  )}
                  {stageGuard.warnings.length ? (
                    <div className="finding-stack">
                      {stageGuard.warnings.map((item: string) => <div key={item} className="finding-card warning">{item}</div>)}
                    </div>
                  ) : null}
                  {stageGuard.artifacts.length ? (
                    <div className="guard-artifact-list">
                      {stageGuard.artifacts.map((artifact: any) => (
                        <div key={artifact.path} className={`guard-artifact-row ${artifact.valid ? 'ok' : 'blocked'}`}>
                          <div className="guard-artifact-title-row">
                            <strong>{artifact.title}</strong>
                            <span className={`guard-artifact-chip ${artifact.valid ? 'ok' : 'blocked'}`}>
                              {(artifact.qualityVerdict ?? (artifact.valid ? 'accepted' : 'blocked')).toUpperCase()}
                              {typeof artifact.qualityScore === 'number' ? ` · ${artifact.qualityScore}` : ''}
                            </span>
                          </div>
                          <span>{artifact.valid ? '通过' : artifact.message || '未通过'}</span>
                          {!artifact.valid && artifact.qualityReasons?.length ? (
                            <div className="guard-artifact-reasons">
                              {artifact.qualityReasons.slice(0, 3).map((reason: string) => <span key={reason}>{reason}</span>)}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {stageGuard.blockers.some((item: string) => item.includes('Artifact check failed') || item.includes('No successful run recorded')) ? (
                    <div className="finding-card info">
                      当前阶段存在核心工件质量阻断。先重新生成，或手动补全文档后再确认阶段。
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
            <section className="panel-card">
              <div className="card-kicker">阶段轨迹</div>
              <div className="stage-track">
                {stageOrder.map((stage: string) => {
                  const confirmed = project.workflow.confirmedStages.includes(stage);
                  const current = project.workflow.stage === stage;
                  return (
                    <button key={stage} type="button" className={`stage-chip ${current ? 'current' : ''} ${confirmed ? 'confirmed' : ''}`} onClick={() => void revisitStage(stage)}>
                      <span>{stageLabels[stage]}</span>
                      {confirmed && <CheckCheck size={14} strokeWidth={1.8} />}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}
        {layout.processPanelTab === 'review' && (
          <div className="process-grid review-grid">
            <section className="panel-card">
              <div className="card-kicker">当前文档</div>
              <div className="card-title-row">
                <strong>{fileName(project.workflow.activeDocumentPath ?? '') || '未选择文档'}</strong>
                <button type="button" className="button-primary" onClick={() => void runReviewRound()} disabled={!activeSession || !project.workflow.activeDocumentPath}>执行红蓝审查</button>
              </div>
            </section>
            <section className="panel-card panel-card-scroll">
              {activeReviewRounds.length ? activeReviewRounds.map((round: any) => (
                <div key={round.id} className="review-round-card">
                  <div className="list-card-header">
                    <div>
                      <strong>{stageLabels[round.stage]}</strong>
                      <div className="muted-line">{round.summary}</div>
                    </div>
                    <span className="small-tag">{fileName(round.documentPath)}</span>
                  </div>
                  {round.issues.map((issue: any) => (
                    <div key={issue.id} className="review-issue-card">
                      <div className="issue-title">{issue.title}</div>
                      <div className="muted-line">{issue.detail}</div>
                      <div className="segmented compact">
                        <button type="button" className={issue.state === 'pending' ? 'active' : ''} onClick={() => void updateReviewIssue(round.id, issue.id, 'pending')}>待处理</button>
                        <button type="button" className={issue.state === 'adopted' ? 'active' : ''} onClick={() => void updateReviewIssue(round.id, issue.id, 'adopted')}>采纳</button>
                        <button type="button" className={issue.state === 'ignored' ? 'active' : ''} onClick={() => void updateReviewIssue(round.id, issue.id, 'ignored')}>忽略</button>
                      </div>
                    </div>
                  ))}
                </div>
              )) : <EmptyBlock title="还没有审查轮次" description="选择当前文档后执行一轮红蓝审查，结果会记录在这里。" />}
            </section>
          </div>
        )}
        {layout.processPanelTab === 'history' && (
          <div className="process-grid history-grid">
            <section className="panel-card">
              <div className="card-kicker">一致性检查</div>
              <div className="button-row">
                <button type="button" className="button-secondary" onClick={() => void runConsistencyCheck()}>执行一致性检查</button>
              </div>
              {consistencyReport?.findings.length ? consistencyReport.findings.map((finding: any) => (
                <div key={finding.id} className={`finding-card ${finding.severity}`}>
                  <strong>{finding.message}</strong>
                  {finding.documentPath && <div className="muted-line">{finding.documentPath}</div>}
                </div>
              )) : <div className="empty-note">暂无发现</div>}
            </section>
            <section className="panel-card">
              <div className="card-kicker">运行记录</div>
              {runtimeRuns.length ? runtimeRuns.slice(0, 8).map((run: any) => {
                const effectiveStatus = run.controlState?.status ?? run.status;
                const allowedActions = new Set(run.controlState?.allowedActions ?? []);
                const statusLabel = effectiveStatus === 'completed'
                  ? '完成'
                  : effectiveStatus === 'running'
                    ? '执行中'
                    : effectiveStatus === 'pause-requested'
                      ? '等待暂停'
                      : effectiveStatus === 'paused'
                        ? '已暂停'
                    : effectiveStatus === 'stopped'
                      ? '已停止'
                      : effectiveStatus === 'queued'
                        ? '等待中'
                        : effectiveStatus === 'waiting-approval'
                          ? '待审批'
                          : effectiveStatus === 'merge-required'
                            ? '待合并确认'
                            : '失败';
                return (
                  <div key={run.id} className="audit-card">
                    <strong>{run.kind} · {run.selectedProfileId ?? '未路由'}</strong>
                    <div>{statusLabel}</div>
                    <div className="muted-line">{run.updatedAt}</div>
                    <div className="muted-line">{`tokens ${run.usage.totalTokens} · $${run.usage.estimatedCostUsd.toFixed(6)}`}</div>
                    {run.controlState?.summary ? <div className="muted-line">{run.controlState.summary}</div> : null}
                    {run.errorMessage ? <div className="muted-line">{run.errorMessage}</div> : null}
                    {run.outputs.length ? (
                      <details className="runtime-output-details">
                        <summary>查看输出审计</summary>
                        <div className="runtime-output-list">
                          {run.outputs.slice(-4).map((output: any) => (
                            <div key={output.id} className="runtime-output-card">
                              <strong>{output.label}</strong>
                              <div className="muted-line">{output.kind} · {output.contentType}</div>
                              <pre>{output.content.slice(0, 360)}</pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    {run.checkpoints.length ? (
                      <div className="muted-line">检查点：{run.checkpoints.map((item: any) => item.summary).join(' / ')}</div>
                    ) : null}
                    {run.latestCheckpointSummary ? (
                      <div className="muted-line">最近可恢复点：{run.latestCheckpointSummary}</div>
                    ) : null}
                    {allowedActions.has('pause') && typeof pauseRuntimeRun === 'function' ? (
                      <button type="button" className="button-secondary" onClick={() => void pauseRuntimeRun(run.id)}>暂停</button>
                    ) : null}
                    {allowedActions.has('resume') ? (
                      <button type="button" className="button-secondary" onClick={() => void resumeRuntimeRun(run.id)}>继续执行</button>
                    ) : null}
                    {allowedActions.has('retry') ? (
                      <button type="button" className="button-secondary" onClick={() => void retryRuntimeRun(run.id)}>重试</button>
                    ) : null}
                    {allowedActions.has('stop') ? (
                      <button type="button" className="button-secondary" onClick={() => void stopRuntimeRun(run.id)}>停止</button>
                    ) : null}
                    {allowedActions.has('resolve-merge') && typeof props.openRunMergeForReview === 'function' ? (
                      <button type="button" className="button-secondary" onClick={() => void props.openRunMergeForReview(run.id)}>处理合并</button>
                    ) : null}
                  </div>
                );
              }) : <div className="empty-note">暂无运行记录</div>}
            </section>
            <section className="panel-card">
              <div className="card-kicker">快照</div>
              {snapshots.length ? snapshots.map((snapshot: any) => (
                <div key={snapshot.id} className="list-card compact-row">
                  <div>
                    <strong>{snapshot.label}</strong>
                    <div className="muted-line">{snapshot.createdAt}</div>
                  </div>
                  <button type="button" className="button-secondary" onClick={() => void restoreSnapshot(snapshot.id)}>恢复</button>
                </div>
              )) : <div className="empty-note">暂无快照</div>}
            </section>
            <section className="panel-card panel-card-scroll">
              <div className="card-kicker">审计事件</div>
              {runtimeEvents.length ? runtimeEvents.slice().reverse().slice(0, 20).map((event: any) => (
                <div key={event.id} className="audit-card">
                  <strong>{event.type}</strong>
                  <div>{event.message}</div>
                  {event.metadata ? Object.entries(event.metadata).slice(0, 4).map(([key, value]) => (
                    <div key={`${event.id}-${key}`} className="muted-line">{key}: {String(value)}</div>
                  )) : null}
                  <div className="muted-line">{event.createdAt}</div>
                </div>
              )) : auditEntries.length ? auditEntries.map((entry: any) => (
                <div key={entry.id} className="audit-card">
                  <strong>{entry.type}</strong>
                  <div>{entry.message}</div>
                  <div className="muted-line">{entry.createdAt}</div>
                </div>
              )) : <div className="empty-note">暂无审计记录</div>}
            </section>
            <section className="panel-card">
              <div className="card-kicker">已启用能力</div>
              <div className="tag-cloud">
                {runtimeCapabilities.length
                  ? runtimeCapabilities.filter((item: any) => item.enabled).slice(0, 20).map((item: any) => (
                    <span key={item.id} className="small-tag">{item.name}</span>
                  ))
                  : <span className="small-tag">无</span>}
              </div>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}
