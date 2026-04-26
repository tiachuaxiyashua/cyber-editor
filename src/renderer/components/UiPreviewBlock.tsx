import { useMemo, useState } from 'react';
import { MoonStar, SunMedium } from 'lucide-react';
import type { UiPreviewSpec } from '../../shared/types';
import { parseUiPreviewSpec } from '../../shared/ui-preview';

function jumpToTarget(target: string) {
  const anchor = target.split('#')[1];
  if (!anchor) return;
  const element = document.getElementById(anchor);
  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function UiPreviewBlock({ raw }: { raw: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const spec = useMemo(() => parseUiPreviewSpec(raw), [raw]);

  if (!spec) {
    return (
        <div className="special-block error-block">
        <div className="special-block-title">界面预览规范无法解析</div>
        <pre>{raw}</pre>
      </div>
    );
  }

  return (
    <div className="special-block preview-shell">
      <div className="preview-toolbar">
        <div>
          <div className="special-block-title">界面效果预览</div>
          <strong>{spec.title}</strong>
          {spec.description ? <div className="muted">{spec.description}</div> : null}
        </div>
        <div className="segmented icon-only" aria-label="预览主题切换">
          <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} title="浅色" aria-label="浅色">
            <SunMedium size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} title="深色" aria-label="深色">
            <MoonStar size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className={`ui-preview-canvas ${theme}`}>
        <PreviewChrome spec={spec} />
      </div>
    </div>
  );
}

function PreviewChrome({ spec }: { spec: UiPreviewSpec }) {
  return (
    <div className="ui-preview-window">
      <div className="ui-preview-titlebar">
        <span>{spec.title}</span>
        <span className="muted">预览</span>
      </div>
      <div className="ui-preview-body">
        {spec.sections.map((section) => (
          <section key={section.id} className="ui-preview-section">
            <div className="ui-preview-section-title">{section.title}</div>
            <div className="ui-preview-region-grid">
              {section.regions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  className="ui-preview-region"
                  onClick={() => region.target ? jumpToTarget(region.target) : undefined}
                >
                  <strong>{region.title}</strong>
                  {region.description ? <span>{region.description}</span> : null}
                  {region.target ? <em>{region.target}</em> : null}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
