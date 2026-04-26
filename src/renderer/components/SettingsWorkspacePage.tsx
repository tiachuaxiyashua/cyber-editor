import { Keyboard, LayoutGrid, PanelsTopLeft, PlugZap, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { AppSettings } from '../../shared/types';
import { getProviderLabel } from '../../shared/provider-registry';
import type { ProviderProfileDraft } from './ProviderProfilesDialog';

type SettingsSection = 'providers' | 'editor' | 'appearance' | 'shortcuts' | 'advanced';

function themeLabel(theme: AppSettings['theme']) {
  if (theme === 'light') return '浅色';
  if (theme === 'dark') return '深色';
  return '跟随系统';
}

function capabilitySummary(profile: ProviderProfileDraft | null) {
  const tags = new Set(profile?.capabilities?.tags ?? []);
  return [
    { label: '结构化输出', value: tags.has('structured-output') || tags.has('json-mode') ? '支持' : '未声明' },
    { label: '工具调用', value: tags.has('tools') ? '支持' : '未声明' },
    { label: '长上下文', value: tags.has('long-context') || (profile?.capabilities?.maxContextTokens ?? 0) >= 64000 ? '支持' : '基础' },
    { label: '部署形态', value: profile?.capabilities?.privacy === 'local' ? '本地' : profile?.capabilities?.privacy === 'cloud' ? '云端' : '未知' }
  ];
}

const sections: Array<{ id: SettingsSection; title: string; description: string }> = [
  { id: 'providers', title: 'Provider Profiles', description: '模型、路由与连接测试' },
  { id: 'editor', title: '编辑器', description: '文档、标签和默认工作方式' },
  { id: 'appearance', title: '外观与布局', description: '主题、三栏宽度与活动栏' },
  { id: 'shortcuts', title: '快捷键', description: '高频动作与系统差异提示' },
  { id: 'advanced', title: '高级', description: '诊断、日志与安全证据入口' }
];

export function SettingsWorkspacePage({
  settings,
  draftTheme,
  providerDrafts,
  activeProviderProfileId,
  status,
  onOpenProviderManager,
  onTestConnection
}: {
  settings: AppSettings;
  draftTheme: AppSettings['theme'];
  providerDrafts: ProviderProfileDraft[];
  activeProviderProfileId: string;
  status: string;
  onOpenProviderManager: () => void;
  onTestConnection: () => void;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('providers');
  const currentProfile = providerDrafts.find((item) => item.id === activeProviderProfileId) ?? providerDrafts[0] ?? null;

  return (
    <section className="settings-workspace-page">
      <div className="workspace-page-head">
        <div className="workspace-page-copy">
          <div className="section-kicker">设置</div>
          <h1>把低频系统项放回它该在的位置</h1>
          <p>这里是完整设置页，不再把 Provider、布局、快捷键和诊断塞进侧栏的一小块区域里。</p>
        </div>
        <div className="workspace-page-actions">
          <button type="button" className="button-secondary icon-text" onClick={onTestConnection}>
            <PlugZap size={14} strokeWidth={1.8} />
            <span>测试当前连接</span>
          </button>
          <button type="button" className="button-primary icon-text" onClick={onOpenProviderManager}>
            <Sparkles size={14} strokeWidth={1.8} />
            <span>打开完整设置</span>
          </button>
        </div>
      </div>

      <div className="settings-workspace-grid">
        <aside className="settings-section-nav">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`settings-section-link ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <strong>{section.title}</strong>
              <span>{section.description}</span>
            </button>
          ))}
        </aside>

        <div className="settings-main-column">
          <div className="settings-overview-row">
            <div className="settings-overview-card">
              <span>当前 Provider</span>
              <strong>{getProviderLabel(currentProfile?.provider || settings.provider)}</strong>
            </div>
            <div className="settings-overview-card">
              <span>当前模型</span>
              <strong>{currentProfile?.model || settings.model || '未配置'}</strong>
            </div>
            <div className="settings-overview-card">
              <span>主题</span>
              <strong>{themeLabel(draftTheme)}</strong>
            </div>
            <div className="settings-overview-card">
              <span>布局</span>
              <strong>{`${settings.sidebar.leftWidth} / ${settings.sidebar.rightWidth}`}</strong>
            </div>
          </div>

          {activeSection === 'providers' ? (
            <section className="settings-surface">
              <div className="workspace-subhead">
                <div>
                  <div className="section-kicker">Provider Profiles</div>
                  <strong>连接与路由</strong>
                </div>
                <span className="small-tag">{providerDrafts.length} 个配置</span>
              </div>
              <div className="settings-detail-grid">
                <div className="settings-detail-card">
                  <span>当前激活</span>
                  <strong>{currentProfile?.name || '未命名配置'}</strong>
                  <p>{currentProfile?.baseUrl || '尚未配置接口地址'}</p>
                </div>
                <div className="settings-detail-card">
                  <span>能力标签</span>
                  <div className="tag-cloud">
                    {(currentProfile?.capabilities?.tags ?? []).length
                      ? (currentProfile?.capabilities?.tags ?? []).map((tag) => <span key={tag} className="small-tag">{tag}</span>)
                      : <span className="small-tag">暂无</span>}
                  </div>
                </div>
                <div className="settings-detail-card">
                  <span>最近诊断</span>
                  <strong>{currentProfile?.diagnostics?.status || 'unknown'}</strong>
                  <p>{currentProfile?.diagnostics?.checkedAt ? new Date(currentProfile.diagnostics.checkedAt).toLocaleString() : '还没有测试记录'}</p>
                </div>
                <div className="settings-detail-card">
                  <span>能力摘要</span>
                  <div className="meta-list">
                    {capabilitySummary(currentProfile).map((item) => (
                      <div key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="settings-detail-card">
                  <span>诊断细节</span>
                  <strong>{currentProfile?.diagnostics?.latencyMs ? `${currentProfile.diagnostics.latencyMs} ms` : '未采样'}</strong>
                  <p>{currentProfile?.diagnostics?.message || '还没有诊断说明。'}</p>
                </div>
              </div>
              <div className="workspace-inline-note">
                <strong>当前状态</strong>
                <span>{status || '连接测试、增删改查和能力标签都归到 Provider Profiles 管理器，不再把整套表单常驻在主界面里。'}</span>
              </div>
            </section>
          ) : null}

          {activeSection === 'editor' ? (
            <section className="settings-surface">
              <div className="workspace-subhead">
                <div>
                  <div className="section-kicker">编辑器</div>
                  <strong>围绕工作台而不是营销卡片</strong>
                </div>
                <LayoutGrid size={16} strokeWidth={1.8} />
              </div>
              <div className="settings-detail-grid">
                <div className="settings-detail-card">
                  <span>文档模式</span>
                  <strong>阅读 / 编辑 / 源码</strong>
                  <p>保留文档标签、查找替换和引用对比，默认不引入无关装饰。</p>
                </div>
                <div className="settings-detail-card">
                  <span>信息层级</span>
                  <strong>主区优先</strong>
                  <p>文件树、文档区和 AI 侧栏维持编辑器式三栏，低频动作进入抽屉或弹层。</p>
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === 'appearance' ? (
            <section className="settings-surface">
              <div className="workspace-subhead">
                <div>
                  <div className="section-kicker">外观与布局</div>
                  <strong>更高密度，更少玻璃质感</strong>
                </div>
                <PanelsTopLeft size={16} strokeWidth={1.8} />
              </div>
              <div className="settings-detail-grid">
                <div className="settings-detail-card">
                  <span>主题</span>
                  <strong>{themeLabel(draftTheme)}</strong>
                  <p>当前版本默认回到浅色高对比，不再用大面积透明与模糊降低文字清晰度。</p>
                </div>
                <div className="settings-detail-card">
                  <span>左侧栏</span>
                  <strong>{settings.sidebar.leftWidth}px</strong>
                  <p>文件树与会话列表保留紧凑宽度，不让无效说明挤占中心工作面。</p>
                </div>
                <div className="settings-detail-card">
                  <span>右侧栏</span>
                  <strong>{settings.sidebar.rightWidth}px</strong>
                  <p>AI 会话栏仅在需要时展示，资源中心和设置页默认释放整页宽度。</p>
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === 'shortcuts' ? (
            <section className="settings-surface">
              <div className="workspace-subhead">
                <div>
                  <div className="section-kicker">快捷键</div>
                  <strong>把高频动作收敛到肌肉记忆</strong>
                </div>
                <Keyboard size={16} strokeWidth={1.8} />
              </div>
              <div className="settings-shortcut-list">
                <div className="settings-shortcut-row"><span>命令面板</span><strong>Ctrl/Cmd + K</strong></div>
                <div className="settings-shortcut-row"><span>保存文档</span><strong>Ctrl/Cmd + S</strong></div>
                <div className="settings-shortcut-row"><span>查找 / 替换</span><strong>Ctrl/Cmd + F / H</strong></div>
                <div className="settings-shortcut-row"><span>切换左 / 右侧栏</span><strong>Alt + [ / ]</strong></div>
              </div>
            </section>
          ) : null}

          {activeSection === 'advanced' ? (
            <section className="settings-surface">
              <div className="workspace-subhead">
                <div>
                  <div className="section-kicker">高级</div>
                  <strong>诊断、证据与恢复路径</strong>
                </div>
                <SlidersHorizontal size={16} strokeWidth={1.8} />
              </div>
              <div className="settings-detail-grid">
                <div className="settings-detail-card">
                  <span>帮助与诊断</span>
                  <strong>延后展开</strong>
                  <p>日志、安全与证据类内容不占首屏主区域，需要时再进入抽屉或专门对话框。</p>
                </div>
                <div className="settings-detail-card">
                  <span>恢复策略</span>
                  <strong>优先可读状态</strong>
                  <p>当连接异常或模型不可用时，应先给出可理解状态，再提示下一步检查动作。</p>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
