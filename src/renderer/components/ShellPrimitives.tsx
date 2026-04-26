import type { MouseEvent, ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import type { ProjectTemplateDefinition, RecentDraftEntry, RecentProjectEntry } from '../../shared/types';

type SidebarHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

type IconButtonProps = {
  icon: LucideIcon;
  title: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'danger';
};

type ActivityButtonProps = {
  icon: LucideIcon;
  title: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
};

type EmptyBlockProps = {
  title: string;
  description: string;
};

type WelcomeScreenProps = {
  recentProjects: RecentProjectEntry[];
  recentTemplates: ProjectTemplateDefinition[];
  recentDrafts: RecentDraftEntry[];
  onCreate: () => void;
  onStartOrchestration: () => void;
  onOpen: () => void;
  onOpenResourceCenter: () => void;
  onCreateFromRecentTemplate: (templateId: string) => void;
  onStartFromRecentTemplate: (templateId: string) => void;
  onOpenRecentDraft: (entry: RecentDraftEntry) => void;
  onRemoveRecentDraft: (entry: RecentDraftEntry) => void;
  onOpenRecent: (rootPath: string) => void;
  onRenameRecent: (entry: RecentProjectEntry) => void;
  onRemoveRecent: (entry: RecentProjectEntry) => void;
  onRevealRecent: (entry: RecentProjectEntry) => void;
  onClearInvalidRecent: () => void;
  onClearAllRecent: () => void;
};

type ProjectWelcomeCardProps = {
  projectName: string;
  sessionTitle: string;
  onOpenProjectFolder: () => void;
  onOpenRequirementDoc: () => void;
};

type ProcessTabButtonProps = {
  label: string;
  active?: boolean;
  onClick?: () => void;
  icon: LucideIcon;
};

type CollapseButtonProps = {
  onClick: () => void;
};

type WelcomeRowAction = {
  label: string;
  ariaLabel?: string;
  tone?: 'default' | 'subtle' | 'danger';
  disabled?: boolean;
  title?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
};

function templateUnavailableReason(template: ProjectTemplateDefinition | null | undefined) {
  if (!template) return '未找到模板。';
  if (template.health === 'corrupt') return template.issueMessage || '模板包已损坏，请先修复。';
  if (template.compatibility === 'incompatible') return '该模板与当前版本不兼容。';
  if (template.trust === 'blocked') return template.issueMessage || '该模板当前被阻止使用。';
  return '';
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderActionLinks(actions: WelcomeRowAction[]) {
  return (
    <div className="simple-row-actions">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`action-link text-link ${action.tone === 'danger' ? 'danger' : action.tone === 'subtle' ? 'subtle' : ''}`}
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.title ?? action.ariaLabel}
          aria-label={action.ariaLabel}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function WelcomeRow({
  title,
  subtitle,
  actions,
  className
}: {
  title: string;
  subtitle: string;
  actions: WelcomeRowAction[];
  className?: string;
}) {
  return (
    <div className={`simple-row ${className ?? ''}`.trim()}>
      <div className="simple-row-main">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      {renderActionLinks(actions)}
    </div>
  );
}

export function SidebarHeader({ title, description, actions }: SidebarHeaderProps) {
  return (
    <div className="sidebar-header">
      <div className="sidebar-header-copy" title={description ? `${title} / ${description}` : title}>
        <div className="sidebar-header-title">{title}</div>
        {description ? <div className="sidebar-header-description">{description}</div> : null}
      </div>
      {actions ? <div className="icon-actions">{actions}</div> : null}
    </div>
  );
}

export function IconButton({ icon: Icon, title, onClick, active, disabled, variant = 'default' }: IconButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`icon-button ${active ? 'active' : ''} ${variant === 'danger' ? 'danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={16} strokeWidth={1.8} />
    </button>
  );
}

export function ActivityButton({ icon: Icon, title, active, onClick, disabled }: ActivityButtonProps) {
  return (
    <button
      type="button"
      className={`activity-button ${active ? 'active' : ''}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={18} strokeWidth={1.8} />
    </button>
  );
}

export function EmptyBlock({ title, description }: EmptyBlockProps) {
  return (
    <div className="empty-block">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function WelcomeScreen({
  recentProjects,
  recentTemplates,
  recentDrafts,
  onCreate,
  onStartOrchestration,
  onOpen,
  onOpenResourceCenter,
  onCreateFromRecentTemplate,
  onStartFromRecentTemplate,
  onOpenRecentDraft,
  onRemoveRecentDraft,
  onOpenRecent,
  onRenameRecent,
  onRemoveRecent,
  onRevealRecent,
  onClearInvalidRecent,
  onClearAllRecent
}: WelcomeScreenProps) {
  const confirmRemoveRecentProject = (entry: RecentProjectEntry) => {
    if (window.confirm(`确定从最近项目列表移除“${entry.alias || entry.name}”吗？`)) {
      onRemoveRecent(entry);
    }
  };

  const confirmRemoveRecentDraft = (entry: RecentDraftEntry) => {
    if (window.confirm(`确定从最近草稿列表移除“${entry.name}”吗？`)) {
      onRemoveRecentDraft(entry);
    }
  };

  const hasRightColumnContent = recentDrafts.length > 0 || recentTemplates.length > 0;
  const invalidRecentCount = recentProjects.filter((entry) => !entry.available).length;

  return (
    <div className="welcome-screen welcome-frame-runtime">
      <section className="welcome-main-column welcome-main-column-runtime">
        <div className="welcome-slogan-block-editorial">
          <div className="welcome-title-stack">
            <div className="welcome-title-brand">Cyber Editor</div>
            <div className="welcome-title-line">从模糊到清晰</div>
            <div className="welcome-title-subline">从想法到结构化文档</div>
          </div>
        </div>

        <div className="welcome-sections-grid">
          <section className="welcome-hub-section">
            <header className="welcome-hub-header">
              <div>
                <div className="section-kicker">最近工程</div>
                <h2>继续真实项目</h2>
              </div>
              <div className="welcome-actions">
                <button
                  type="button"
                  className="welcome-deep-action"
                  data-testid="welcome-create-project"
                  onClick={onCreate}
                >
                  新建工程
                </button>
                  <button
                  type="button"
                  className="welcome-deep-action"
                  data-testid="welcome-open-project"
                  onClick={onOpen}
                >
                  打开工程
                </button>
                {invalidRecentCount ? (
                  <button type="button" className="welcome-deep-action" onClick={onClearInvalidRecent}>
                    清理失效
                  </button>
                ) : null}
                {recentProjects.length ? (
                  <button type="button" className="welcome-deep-action" onClick={onClearAllRecent}>
                    清空列表
                  </button>
                ) : null}
              </div>
            </header>
            <div className="simple-list">
              {recentProjects.length ? (
                recentProjects.map((entry) => {
                  const displayName = entry.alias || entry.name;
                  const actions: WelcomeRowAction[] = [
                    {
                      label: '继续',
                      ariaLabel: `打开最近工程 ${displayName}`,
                      disabled: !entry.available,
                      title: entry.available ? undefined : '该工程当前不可打开',
                      onClick: () => onOpenRecent(entry.rootPath)
                    },
                    {
                      label: '编辑',
                      ariaLabel: '重命名最近工程',
                      onClick: () => onRenameRecent(entry)
                    },
                    {
                      label: '显示',
                      ariaLabel: '在系统中显示最近工程',
                      tone: 'subtle',
                      onClick: () => onRevealRecent(entry)
                    },
                    {
                      label: '从最近移除',
                      ariaLabel: '移除最近工程',
                      tone: 'subtle',
                      onClick: () => confirmRemoveRecentProject(entry)
                    },
                    {
                      label: '删除',
                      tone: 'danger',
                      disabled: true,
                      title: '当前版本尚未接入彻底删除'
                    }
                  ];

                  return (
                    <WelcomeRow
                      key={entry.rootPath}
                      className="recent-card"
                      title={displayName}
                      subtitle={`${entry.available ? '最近打开' : '已失效'} · ${formatDateTime(entry.lastOpenedAt)}`}
                      actions={actions}
                    />
                  );
                })
              ) : (
                <EmptyBlock title="还没有最近工程" description="创建或打开工程后，这里会保留最近入口。" />
              )}
            </div>
          </section>

          <section className="welcome-hub-section">
            <header className="welcome-hub-header">
              <div>
                <div className="section-kicker">模板与编排</div>
                <h2>从模板或草稿快速开始</h2>
              </div>
              <div className="welcome-actions">
                <button type="button" className="welcome-deep-action" onClick={onStartOrchestration}>
                  开始编排
                </button>
                <button
                  type="button"
                  className="welcome-deep-action"
                  data-testid="welcome-open-resources"
                  onClick={onOpenResourceCenter}
                >
                  资源中心
                </button>
              </div>
            </header>
            <div className="simple-list">
              {recentDrafts.map((entry) => (
                <WelcomeRow
                  key={entry.id}
                  title={entry.name}
                  subtitle={`${entry.templateName ? `${entry.templateName} · ` : ''}上次编辑：${formatDateTime(entry.updatedAt)}`}
                  actions={[
                    {
                      label: '继续编辑',
                      disabled: !entry.available,
                      title: entry.available ? undefined : '该草稿当前不可用',
                      onClick: () => onOpenRecentDraft(entry)
                    },
                    {
                      label: '详情',
                      onClick: () => onOpenRecentDraft(entry)
                    },
                    {
                      label: '从最近移除',
                      tone: 'subtle',
                      onClick: () => confirmRemoveRecentDraft(entry)
                    },
                    {
                      label: '删除',
                      tone: 'danger',
                      disabled: true,
                      title: '当前版本尚未接入彻底删除'
                    }
                  ]}
                />
              ))}

              {recentTemplates.map((template) => {
                const unavailableReason = templateUnavailableReason(template);
                return (
                  <WelcomeRow
                    key={template.id}
                    title={template.name}
                    subtitle={unavailableReason || template.shortDescription}
                    actions={[
                      {
                        label: '使用模板',
                        disabled: Boolean(unavailableReason),
                        title: unavailableReason || undefined,
                        onClick: () => onCreateFromRecentTemplate(template.id)
                      },
                      {
                        label: '开始编排',
                        disabled: Boolean(unavailableReason),
                        title: unavailableReason || undefined,
                        onClick: () => onStartFromRecentTemplate(template.id)
                      },
                      {
                        label: '详情',
                        onClick: () => onOpenResourceCenter()
                      },
                      {
                        label: '从最近移除',
                        tone: 'subtle',
                        disabled: true,
                        title: '模板入口由资源中心维护'
                      },
                      {
                        label: '删除',
                        tone: 'danger',
                        disabled: true,
                        title: '请在资源中心处理模板删除'
                      }
                    ]}
                  />
                );
              })}

              {!hasRightColumnContent ? (
                <EmptyBlock title="还没有模板或草稿" description="先从资源中心安装模板，或开始一次新的编排。" />
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

export function ProjectWelcomeCard({
  projectName,
  sessionTitle,
  onOpenProjectFolder,
  onOpenRequirementDoc
}: ProjectWelcomeCardProps) {
  return (
    <div className="project-welcome-card">
      <div className="workspace-subhead">
        <div>
          <div className="section-kicker">工作台就绪</div>
          <strong>{projectName}</strong>
        </div>
        <span className="small-tag">{sessionTitle}</span>
      </div>
      <h2>从文件树、文档区和当前会话直接开工</h2>
      <p>默认工作台不再展示独立欢迎页，而是把当前工程、当前文档和 AI 上下文放回同一层级。</p>
      <div className="project-welcome-grid">
        <div className="project-welcome-tile">
          <span>建议动作</span>
          <strong>先打开第一份主文档</strong>
          <p>如果工程中已经存在 Markdown 文档，优先从主文档开始推进。</p>
        </div>
        <div className="project-welcome-tile">
          <span>当前会话</span>
          <strong>{sessionTitle}</strong>
          <p>右侧 AI 助手会围绕当前工作区自动切换上下文，不需要单独跳到聊天页。</p>
        </div>
      </div>
      <div className="welcome-actions">
        <button type="button" className="button-primary" onClick={onOpenRequirementDoc}>
          打开第一份文档
        </button>
        <button type="button" className="button-secondary" onClick={onOpenProjectFolder}>
          打开工程目录
        </button>
      </div>
    </div>
  );
}

export function ProcessTabButton({ label, active, onClick, icon: Icon }: ProcessTabButtonProps) {
  return (
    <button type="button" className={`process-tab ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon size={14} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
}

export function CollapseButton({ onClick }: CollapseButtonProps) {
  return <IconButton title="收起" onClick={onClick} icon={ChevronDown} />;
}
