import { PlugZap, Plus, Trash2, X } from 'lucide-react';
import type { AppSettings, ProviderProfileInput } from '../../shared/types';
import {
  defaultProviderCapabilities,
  getProviderLabel,
  listProviderDefinitions,
  providerAllowsEmptyApiKey
} from '../../shared/provider-registry';
import { IconButton, SidebarHeader } from './ShellPrimitives';
import { OverlayPortal } from './OverlayPortal';

export type ProviderProfileDraft = Required<Pick<ProviderProfileInput, 'id'>> & ProviderProfileInput;

const providerOptions = listProviderDefinitions().map((definition) => ({
  value: definition.kind,
  label: definition.label,
  placeholder: definition.defaultBaseUrl,
  model: definition.defaultModel
}));

export function ProviderProfilesDialog({
  open,
  settings,
  drafts,
  selectedProfileId,
  status,
  testing,
  saving,
  onChangeTheme,
  onChangeLiveLogConsole,
  onSelectProfile,
  onChangeProfile,
  onCreateProfile,
  onDeleteProfile,
  onTestProfile,
  onSave,
  onClose
}: {
  open: boolean;
  settings: Pick<AppSettings, 'theme' | 'activeProviderProfileId' | 'debug'>;
  drafts: ProviderProfileDraft[];
  selectedProfileId: string;
  status: string;
  testing: boolean;
  saving: boolean;
  onChangeTheme: (theme: AppSettings['theme']) => void;
  onChangeLiveLogConsole: (enabled: boolean) => void;
  onSelectProfile: (profileId: string) => void;
  onChangeProfile: (profile: ProviderProfileDraft) => void;
  onCreateProfile: () => void;
  onDeleteProfile: (profileId: string) => void;
  onTestProfile: (profileId: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const current = drafts.find((item) => item.id === selectedProfileId) ?? drafts[0];
  const diagnostic = current?.diagnostics;
  const capabilityTags = current?.capabilities?.tags ?? [];

  return (
    <OverlayPortal>
      <div className="modal-backdrop">
        <div className="modal dialog-surface provider-dialog" data-testid="provider-dialog">
        <SidebarHeader
          title="设置"
          description="主题、Provider profile 与连接测试"
          actions={<IconButton title="关闭设置" onClick={onClose} icon={X} />}
        />
        <div className="provider-dialog-grid">
          <aside className="provider-list-panel">
            <div className="section-kicker">模型配置</div>
            <button type="button" className="button-secondary icon-text full-width" onClick={onCreateProfile}>
              <Plus size={14} strokeWidth={1.8} />
              <span>新建配置</span>
            </button>
            <div className="provider-list">
              {drafts.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  data-testid={`provider-profile-${profile.id}`}
                  className={`provider-list-item ${profile.id === current?.id ? 'active' : ''}`}
                    onClick={() => onSelectProfile(profile.id)}
                  >
                  <div className="provider-list-item-title">
                    <strong>{profile.name}</strong>
                    {settings.activeProviderProfileId === profile.id ? <span className="small-tag state-good">当前激活</span> : null}
                  </div>
                  <div className="muted-line">{getProviderLabel(profile.provider)}</div>
                  <div className="muted-inline">{profile.model}</div>
                </button>
              ))}
            </div>
          </aside>
          <section className="provider-editor-panel">
            <div className="form-grid">
              <label>
                主题
                <select value={settings.theme} onChange={(event) => onChangeTheme(event.target.value as AppSettings['theme'])}>
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </label>
              <label>
                配置名称
                <input value={current?.name ?? ''} onChange={(event) => current && onChangeProfile({ ...current, name: event.target.value })} />
              </label>
              <label>
                服务类型
                <select
                  value={current?.provider ?? 'mock'}
                  onChange={(event) => {
                    if (!current) return;
                    const provider = event.target.value as typeof current.provider;
                    const option = providerOptions.find((item) => item.value === provider);
                    onChangeProfile({
                      ...current,
                      provider,
                      baseUrl: option?.placeholder ?? current.baseUrl,
                      model: option?.model ?? current.model,
                      capabilities: defaultProviderCapabilities(provider),
                      diagnostics: { status: 'unknown' }
                    });
                  }}
                >
                  {providerOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>
                接口地址
                <input value={current?.baseUrl ?? ''} onChange={(event) => current && onChangeProfile({ ...current, baseUrl: event.target.value })} />
              </label>
              <label>
                模型
                <input value={current?.model ?? ''} onChange={(event) => current && onChangeProfile({ ...current, model: event.target.value })} />
              </label>
              <label>
                API 密钥
                <input
                  type="password"
                  value={current?.apiKey ?? ''}
                  placeholder={current?.provider && providerAllowsEmptyApiKey(current.provider) ? '当前 Provider 可为空' : '输入 API Key'}
                  onChange={(event) => current && onChangeProfile({ ...current, apiKey: event.target.value })}
                />
              </label>
            </div>
            <div className="provider-status-card">
              <div className="section-kicker">连接状态</div>
              <p>{status || '可以先测试当前 Profile，再保存。'}</p>
              <div className="meta-list">
                <div><span>最近检查</span><strong>{diagnostic?.checkedAt ? new Date(diagnostic.checkedAt).toLocaleString() : '未检查'}</strong></div>
                <div><span>状态</span><strong>{diagnostic?.status ?? 'unknown'}</strong></div>
                <div><span>延迟</span><strong>{diagnostic?.latencyMs ? `${diagnostic.latencyMs} ms` : '-'}</strong></div>
              </div>
            </div>
            <div className="provider-status-card">
              <div className="section-kicker">路由能力</div>
              <div className="tag-cloud">
                {capabilityTags.length ? capabilityTags.map((tag) => <span key={tag} className="small-tag">{tag}</span>) : <span className="small-tag">暂无</span>}
              </div>
              <div className="meta-list">
                <div><span>上下文</span><strong>{current?.capabilities?.maxContextTokens ?? 0}</strong></div>
                <div><span>隐私</span><strong>{current?.capabilities?.privacy ?? '-'}</strong></div>
                <div><span>成本</span><strong>{current?.capabilities?.costTier ?? '-'}</strong></div>
                <div><span>时延</span><strong>{current?.capabilities?.latencyTier ?? '-'}</strong></div>
              </div>
            </div>
            <div className="provider-status-card">
              <div className="section-kicker">调试日志</div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.debug.liveLogConsoleEnabled}
                  onChange={(event) => onChangeLiveLogConsole(event.target.checked)}
                />
                <span>启动时打开在线日志窗</span>
              </label>
              <p>开启后会将 AI 输出、流转状态、质量诊断和异常分级实时显示并同时写入日志文件。</p>
            </div>
            <div className="modal-actions align-start">
              <button type="button" className="button-secondary icon-text" onClick={() => current && onTestProfile(current.id)} disabled={!current || testing}>
                <PlugZap size={14} strokeWidth={1.8} />
                <span>{testing ? '测试中…' : '测试连接'}</span>
              </button>
              <button type="button" className="button-danger icon-text" onClick={() => current && onDeleteProfile(current.id)} disabled={drafts.length <= 1}>
                <Trash2 size={14} strokeWidth={1.8} />
                <span>删除</span>
              </button>
            </div>
          </section>
        </div>
        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>关闭</button>
          <button type="button" className="button-primary" onClick={onSave} disabled={saving}>{saving ? '保存中…' : '保存设置'}</button>
        </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
